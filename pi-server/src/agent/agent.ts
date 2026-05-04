import { and, desc, eq } from "drizzle-orm";

import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import {
  accounts,
  categories,
  payees,
  transactions,
} from "../db/schema.ts";
import { newId, nowMs, recordChange } from "../repos/changelog.ts";

export interface AgentRequest {
  text: string;
  threadId?: string;
  source?: string;
  sourceUser?: string;
}

export interface AgentResponse {
  reply: string;
  action?:
    | {
        kind: "record_expense" | "record_income";
        transactionId: string;
        amountCents: number;
        payee?: string;
        accountId?: string;
        categoryId?: string;
        date: string;
      }
    | { kind: "noop" };
}

interface AgentDecision {
  reply: string;
  action?:
    | {
        kind: "record_expense" | "record_income";
        amountCents: number;
        payee?: string | null;
        accountHint?: string | null;
        categoryHint?: string | null;
        date?: string | null;
        notes?: string | null;
      }
    | { kind: "noop" };
}

const SYSTEM = `You are Gullak, a personal expense-tracking assistant.

Decide what the user wants to do. Output ONLY a single JSON object
matching this shape:

{
  "reply": "<natural-language reply, max 1 sentence>",
  "action": {
    "kind": "record_expense" | "record_income" | "noop",
    "amountCents": integer (omit when noop),
    "payee": string|null,
    "accountHint": string|null,
    "categoryHint": string|null,
    "date": string|null (YYYY-MM-DD),
    "notes": string|null
  }
}

Rules:
- Money is integer minor units. "450" with 2 minor digits → 45000.
- record_expense: user describes a spend. record_income: user got money.
- noop: small talk, questions, anything that isn't a clear transaction.
  In that case write a short helpful reply.
- Do NOT invent payees or accounts beyond the lists supplied.
- Do NOT fabricate amounts. If the user is ambiguous, ask in reply
  and emit kind: "noop".
- Reply should be short and natural. "Logged ₹450 at Blinkit." or
  "Which card did you pay with — HDFC or Axis?"`;

export async function handleMessage(
  db: Db,
  config: AppConfig,
  request: AgentRequest,
): Promise<AgentResponse> {
  const text = request.text.trim();
  if (!text) {
    return { reply: "Send me an expense and I'll log it." };
  }

  const accountList = db.select().from(accounts).all();
  const categoryList = db.select().from(categories).all();
  const payeeList = db.select().from(payees).all();

  const today = todayIso(config.timezone);
  const userPrompt = [
    `<today>: ${today}`,
    `<accounts>: ${accountList.map((a) => a.name).join(", ") || "(none)"}`,
    `<categories>: ${categoryList.map((c) => c.name).join(", ") || "(none)"}`,
    `<payees>: ${payeeList.map((p) => p.name).slice(0, 80).join(", ")}`,
    "",
    `Message: ${text}`,
  ].join("\n");

  const decision = await askModel(config, SYSTEM, userPrompt);

  if (!decision.action || decision.action.kind === "noop") {
    return { reply: decision.reply || "Got it." };
  }

  const action = decision.action;
  if (
    typeof action.amountCents !== "number" ||
    action.amountCents <= 0 ||
    !Number.isFinite(action.amountCents)
  ) {
    return {
      reply:
        decision.reply || "I couldn't read an amount — say something like 'blinkit 450'.",
    };
  }

  const accountId =
    matchByName(action.accountHint, accountList, (a) => a.name, (a) => a.id) ??
    accountList[0]?.id ??
    null;
  if (!accountId) {
    return {
      reply: "Add an account in Gullak first — I'll start logging once it's there.",
    };
  }
  const categoryId = matchByName(
    action.categoryHint,
    categoryList,
    (c) => c.name,
    (c) => c.id,
  );
  const payeeId = action.payee
    ? upsertPayee(db, action.payee, payeeList)
    : null;

  const isIncome = action.kind === "record_income";
  const signed = isIncome
    ? Math.abs(action.amountCents)
    : -Math.abs(action.amountCents);
  const date = isYmd(action.date) ? action.date! : today;
  const id = newId();
  const at = nowMs();

  const row = {
    id,
    accountId,
    categoryId: categoryId ?? null,
    payeeId,
    payeeName: action.payee ?? null,
    amountCents: signed,
    date,
    notes: action.notes ?? null,
    cleared: false,
    origin: request.source ?? "agent",
    originRef: request.sourceUser ?? null,
    transferAccountId: null,
    transferGroupId: null,
    parentId: null,
    splitTotalCents: null,
    createdAt: at,
    updatedAt: at,
  };

  db.transaction((tx) => {
    tx.insert(transactions).values(row).run();
    recordChange(tx, {
      resource: "transactions",
      resourceId: id,
      op: "upsert",
      payload: row,
    });
    if (payeeId) bumpPayeeUseCount(tx, payeeId);
  });

  return {
    reply: decision.reply || (isIncome ? "Logged income." : "Logged expense."),
    action: {
      kind: action.kind,
      transactionId: id,
      amountCents: signed,
      payee: action.payee ?? undefined,
      accountId,
      categoryId: categoryId ?? undefined,
      date,
    },
  };
}

async function askModel(
  config: AppConfig,
  system: string,
  user: string,
): Promise<AgentDecision> {
  const url = `${stripTrailingSlash(config.modelBaseUrl)}/chat/completions`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.modelApiKey}`,
      accept: "application/json",
    },
    body: JSON.stringify({
      model: config.modelId,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`LLM ${r.status}: ${body.slice(0, 200)}`);
  }
  const json = (await r.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  return parseDecision(raw);
}

function parseDecision(raw: string): AgentDecision {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return { reply: text || "I couldn't parse that." };
  }
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as AgentDecision;
    return parsed;
  } catch {
    return { reply: text };
  }
}

function matchByName<T>(
  hint: string | null | undefined,
  rows: T[],
  nameOf: (row: T) => string,
  idOf: (row: T) => string,
): string | null {
  if (!hint || rows.length === 0) return null;
  const h = hint.trim().toLowerCase();
  if (!h) return null;
  for (const row of rows) {
    if (nameOf(row).toLowerCase() === h) return idOf(row);
  }
  for (const row of rows) {
    const n = nameOf(row).toLowerCase();
    if (n.includes(h) || h.includes(n)) return idOf(row);
  }
  let best: T | null = null;
  let bestDist = 3;
  for (const row of rows) {
    const dist = levenshtein(h, nameOf(row).toLowerCase());
    if (dist < bestDist) {
      best = row;
      bestDist = dist;
    }
  }
  return best ? idOf(best) : null;
}

function upsertPayee(
  db: Db,
  name: string,
  existing: { id: string; name: string }[],
): string {
  const lower = name.trim().toLowerCase();
  const found = existing.find((p) => p.name.toLowerCase() === lower);
  if (found) return found.id;
  const id = newId();
  db.transaction((tx) => {
    tx.insert(payees).values({
      id,
      name: name.trim(),
      useCount: 0,
      updatedAt: nowMs(),
    }).run();
    recordChange(tx, {
      resource: "payees",
      resourceId: id,
      op: "upsert",
      payload: {
        id,
        name: name.trim(),
        useCount: 0,
        updatedAt: nowMs(),
      },
    });
  });
  return id;
}

function bumpPayeeUseCount(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  payeeId: string,
) {
  const existing = tx
    .select()
    .from(payees)
    .where(eq(payees.id, payeeId))
    .get();
  if (!existing) return;
  const next = {
    ...existing,
    useCount: existing.useCount + 1,
    updatedAt: nowMs(),
  };
  tx.update(payees).set(next).where(eq(payees.id, payeeId)).run();
  recordChange(tx, {
    resource: "payees",
    resourceId: payeeId,
    op: "upsert",
    payload: next,
  });
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const v0 = new Array<number>(b.length + 1);
  const v1 = new Array<number>(b.length + 1);
  for (let i = 0; i <= b.length; i++) v0[i] = i;
  for (let i = 0; i < a.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < b.length; j++) {
      const cost = a.charCodeAt(i) === b.charCodeAt(j) ? 0 : 1;
      v1[j + 1] = Math.min(
        (v1[j] ?? 0) + 1,
        (v0[j + 1] ?? 0) + 1,
        (v0[j] ?? 0) + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) v0[j] = v1[j] ?? 0;
  }
  return v0[b.length] ?? 0;
}

function isYmd(s: string | null | undefined): boolean {
  if (!s) return false;
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function todayIso(_timezone: string): string {
  // bun:sqlite doesn't matter here; we rely on the host clock. The
  // `_timezone` arg is reserved for when we wire a tz-aware date lib.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}

void and;
void desc;
