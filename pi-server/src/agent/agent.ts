import { and, desc, eq, gt } from "drizzle-orm";

import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import {
  accounts,
  agentTurns,
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
  threadId: string;
  reply: string;
  action?:
    | {
        kind: "record_expense" | "record_income" | "edit_last" | "delete_last";
        transactionId: string;
        amountCents?: number;
        date?: string;
      }
    | { kind: "list_recent"; transactions: { id: string; payee: string | null; amountCents: number; date: string }[] }
    | { kind: "noop" };
}

type ActionKind =
  | "record_expense"
  | "record_income"
  | "edit_last"
  | "delete_last"
  | "list_recent"
  | "noop";

interface AgentDecision {
  reply: string;
  action?: {
    kind: ActionKind;
    amountCents?: number;
    payee?: string | null;
    accountHint?: string | null;
    categoryHint?: string | null;
    date?: string | null;
    notes?: string | null;
    limit?: number;
  };
}

const SYSTEM = `You are Gullak, a personal expense-tracking assistant.

You may run a tool by setting "action.kind" to one of:
- "record_expense": user describes a spend (negative on account)
- "record_income": user got money (positive on account)
- "edit_last": amend the most recent transaction (only fields the
  user asked you to change; omit the rest)
- "delete_last": remove the most recent transaction
- "list_recent": user is asking what they spent recently
- "noop": small talk, clarification, or anything that isn't a clear
  transaction. Put your message in "reply".

Output ONLY a single JSON object:

{
  "reply": "<short natural reply, max 1 sentence>",
  "action": {
    "kind": "record_expense" | "record_income" | "edit_last" | "delete_last" | "list_recent" | "noop",
    "amountCents": integer,
    "payee": string|null,
    "accountHint": string|null,
    "categoryHint": string|null,
    "date": string|null (YYYY-MM-DD),
    "notes": string|null,
    "limit": integer (only for list_recent, default 5)
  }
}

Rules:
- Money is integer minor units. "450" with 2 minor digits → 45000.
- Do NOT invent payees, accounts, or amounts. If the user is
  ambiguous, ask in "reply" and use kind "noop".
- "yes/yeah/sure" by itself confirms whatever you proposed last
  turn. Re-emit the action you previously proposed.
- "no/cancel" cancels — kind "noop" with a short ack.
- The conversation history is provided so you can resolve "this",
  "that", "the last one" relative to prior turns.
- Reply must be short. "Logged ₹450 at Blinkit." or
  "Which card — HDFC or Axis?"`;

const HISTORY_LIMIT = 10;

export async function handleMessage(
  db: Db,
  config: AppConfig,
  request: AgentRequest,
): Promise<AgentResponse> {
  const text = request.text.trim();
  if (!text) {
    return { threadId: request.threadId ?? "", reply: "Send me an expense and I'll log it." };
  }
  const threadId = request.threadId ?? `${request.source ?? "http"}:${newId().slice(0, 8)}`;

  const accountList = db.select().from(accounts).all();
  const categoryList = db.select().from(categories).all();
  const payeeList = db.select().from(payees).all();
  const history = db
    .select()
    .from(agentTurns)
    .where(eq(agentTurns.threadId, threadId))
    .orderBy(desc(agentTurns.id))
    .limit(HISTORY_LIMIT)
    .all()
    .reverse();

  const lastTxn = lastTransactionFor(db, threadId);

  const today = todayIso();
  const userPrompt = [
    `<today>: ${today}`,
    `<accounts>: ${accountList.map((a) => a.name).join(", ") || "(none)"}`,
    `<categories>: ${categoryList.map((c) => c.name).join(", ") || "(none)"}`,
    `<payees>: ${payeeList.map((p) => p.name).slice(0, 80).join(", ")}`,
    lastTxn
      ? `<last_recorded>: id=${lastTxn.id} amount_cents=${lastTxn.amountCents} payee=${lastTxn.payeeName ?? "(unknown)"} date=${lastTxn.date}`
      : `<last_recorded>: none`,
    "",
    `Message: ${text}`,
  ].join("\n");

  const decision = await askModel(config, SYSTEM, userPrompt, history);

  const action = decision.action;
  const reply = decision.reply || "Got it.";

  // Persist the user turn first regardless of outcome.
  appendTurn(db, threadId, "user", text);

  if (!action || action.kind === "noop") {
    appendTurn(db, threadId, "assistant", reply);
    return { threadId, reply, action: { kind: "noop" } };
  }

  switch (action.kind) {
    case "record_expense":
    case "record_income":
      return recordTransaction(db, threadId, request, action, reply, accountList, categoryList, payeeList);
    case "edit_last":
      return editLast(db, threadId, action, reply, accountList, categoryList, payeeList);
    case "delete_last":
      return deleteLast(db, threadId, reply);
    case "list_recent":
      return listRecent(db, threadId, action.limit ?? 5, reply);
    default:
      appendTurn(db, threadId, "assistant", reply);
      return { threadId, reply, action: { kind: "noop" } };
  }
}

function recordTransaction(
  db: Db,
  threadId: string,
  request: AgentRequest,
  action: NonNullable<AgentDecision["action"]>,
  reply: string,
  accountList: { id: string; name: string }[],
  categoryList: { id: string; name: string }[],
  payeeList: { id: string; name: string }[],
): AgentResponse {
  if (
    typeof action.amountCents !== "number" ||
    action.amountCents <= 0 ||
    !Number.isFinite(action.amountCents)
  ) {
    appendTurn(db, threadId, "assistant", reply);
    return { threadId, reply, action: { kind: "noop" } };
  }
  const accountId =
    matchByName(action.accountHint, accountList, (a) => a.name, (a) => a.id) ??
    accountList[0]?.id;
  if (!accountId) {
    const msg = "Add an account in Gullak first — I'll start logging once it's there.";
    appendTurn(db, threadId, "assistant", msg);
    return { threadId, reply: msg, action: { kind: "noop" } };
  }
  const categoryId = matchByName(
    action.categoryHint,
    categoryList,
    (c) => c.name,
    (c) => c.id,
  );
  const payeeId = action.payee ? upsertPayee(db, action.payee, payeeList) : null;

  const isIncome = action.kind === "record_income";
  const signed = isIncome
    ? Math.abs(action.amountCents)
    : -Math.abs(action.amountCents);
  const date = isYmd(action.date) ? action.date! : todayIso();
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

  appendTurn(db, threadId, "assistant", reply, id);

  return {
    threadId,
    reply,
    action: {
      kind: action.kind as "record_expense" | "record_income",
      transactionId: id,
      amountCents: signed,
      date,
    },
  };
}

function editLast(
  db: Db,
  threadId: string,
  action: NonNullable<AgentDecision["action"]>,
  reply: string,
  accountList: { id: string; name: string }[],
  categoryList: { id: string; name: string }[],
  payeeList: { id: string; name: string }[],
): AgentResponse {
  const target = lastTransactionFor(db, threadId);
  if (!target) {
    const msg = "Nothing to edit yet on this thread.";
    appendTurn(db, threadId, "assistant", msg);
    return { threadId, reply: msg, action: { kind: "noop" } };
  }
  const next: typeof target = { ...target, updatedAt: nowMs() };
  if (typeof action.amountCents === "number" && action.amountCents > 0) {
    const sign = next.amountCents < 0 ? -1 : 1;
    next.amountCents = sign * Math.abs(action.amountCents);
  }
  if (action.payee != null) {
    next.payeeName = action.payee;
    next.payeeId = upsertPayee(db, action.payee, payeeList);
  }
  if (action.accountHint != null) {
    const matched = matchByName(action.accountHint, accountList, (a) => a.name, (a) => a.id);
    if (matched) next.accountId = matched;
  }
  if (action.categoryHint != null) {
    next.categoryId = matchByName(
      action.categoryHint,
      categoryList,
      (c) => c.name,
      (c) => c.id,
    );
  }
  if (isYmd(action.date)) next.date = action.date!;
  if (action.notes != null) next.notes = action.notes;

  db.transaction((tx) => {
    tx.update(transactions).set(next).where(eq(transactions.id, target.id)).run();
    recordChange(tx, {
      resource: "transactions",
      resourceId: target.id,
      op: "upsert",
      payload: next,
    });
  });

  appendTurn(db, threadId, "assistant", reply, target.id);
  return {
    threadId,
    reply,
    action: {
      kind: "edit_last",
      transactionId: target.id,
      amountCents: next.amountCents,
      date: next.date,
    },
  };
}

function deleteLast(db: Db, threadId: string, reply: string): AgentResponse {
  const target = lastTransactionFor(db, threadId);
  if (!target) {
    const msg = "Nothing to delete yet on this thread.";
    appendTurn(db, threadId, "assistant", msg);
    return { threadId, reply: msg, action: { kind: "noop" } };
  }
  db.transaction((tx) => {
    tx.delete(transactions).where(eq(transactions.id, target.id)).run();
    recordChange(tx, {
      resource: "transactions",
      resourceId: target.id,
      op: "delete",
    });
  });
  appendTurn(db, threadId, "assistant", reply);
  return {
    threadId,
    reply,
    action: { kind: "delete_last", transactionId: target.id },
  };
}

function listRecent(
  db: Db,
  threadId: string,
  limit: number,
  reply: string,
): AgentResponse {
  const cap = Math.min(Math.max(limit, 1), 20);
  const rows = db
    .select({
      id: transactions.id,
      payeeName: transactions.payeeName,
      amountCents: transactions.amountCents,
      date: transactions.date,
    })
    .from(transactions)
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(cap)
    .all();
  appendTurn(db, threadId, "assistant", reply);
  return {
    threadId,
    reply,
    action: {
      kind: "list_recent",
      transactions: rows.map((r) => ({
        id: r.id,
        payee: r.payeeName,
        amountCents: r.amountCents,
        date: r.date,
      })),
    },
  };
}

function lastTransactionFor(db: Db, threadId: string) {
  // Prefer the most recent assistant turn that touched a transaction
  // on this thread. Falls back to the global most-recent if none.
  const ourLast = db
    .select()
    .from(agentTurns)
    .where(and(eq(agentTurns.threadId, threadId), gt(agentTurns.id, 0)))
    .orderBy(desc(agentTurns.id))
    .limit(20)
    .all()
    .find((t) => t.role === "assistant" && t.transactionId);
  if (ourLast?.transactionId) {
    const row = db
      .select()
      .from(transactions)
      .where(eq(transactions.id, ourLast.transactionId))
      .get();
    if (row) return row;
  }
  return db
    .select()
    .from(transactions)
    .orderBy(desc(transactions.createdAt))
    .limit(1)
    .get();
}

function appendTurn(
  db: Db,
  threadId: string,
  role: "user" | "assistant",
  content: string,
  transactionId?: string,
) {
  db.insert(agentTurns)
    .values({
      threadId,
      role,
      content,
      transactionId: transactionId ?? null,
    })
    .run();
}

async function askModel(
  config: AppConfig,
  system: string,
  user: string,
  history: { role: string; content: string }[],
): Promise<AgentDecision> {
  const url = `${stripTrailingSlash(config.modelBaseUrl)}/chat/completions`;
  const messages: { role: string; content: string }[] = [
    { role: "system", content: system },
    ...history.map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: user },
  ];
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
      messages,
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
  const at = nowMs();
  db.transaction((tx) => {
    const row = { id, name: name.trim(), useCount: 0, updatedAt: at };
    tx.insert(payees).values(row).run();
    recordChange(tx, {
      resource: "payees",
      resourceId: id,
      op: "upsert",
      payload: row,
    });
  });
  return id;
}

function bumpPayeeUseCount(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  payeeId: string,
) {
  const existing = tx.select().from(payees).where(eq(payees.id, payeeId)).get();
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

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
