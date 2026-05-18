import { desc, eq } from "drizzle-orm";
import { z } from "zod";

import {
  candidateJson,
  parseWhatsappExpenses,
  type WhatsappCandidate,
} from "../ai/whatsapp_parser.ts";
import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import {
  accounts,
  agentTurns,
  categories,
  payees,
  whatsappInboxCandidates,
} from "../db/schema.ts";
import { chatJson } from "../llm/client.ts";
import { newId, nowMs } from "../repos/changelog.ts";
import { runAskTool, type AskToolCall, type AskToolName } from "./ask_tools.ts";

/// Conversational entry point used by /v1/messages and the WhatsApp
/// webhook. Splits into two paths:
///   - log: parse N expenses, write each to `whatsapp_inbox_candidates`
///     for the phone to pull and review. No transaction is auto-booked.
///   - ask: pick one pre-canned aggregation tool and answer with concrete
///     numbers from the server DB.
///
/// Auto-write of transactions and edit/delete via WhatsApp are gone — both
/// were dangerous now that the phone owns the review UX. Edit/delete copy
/// nudges the user back into the app.

export interface AgentRequest {
  text: string;
  threadId?: string;
  source?: string;
  sourceUser?: string;
  pushName?: string;
  chatId?: string;
  messageId?: string;
  receivedAtMs?: number;
}

export interface AgentResponse {
  threadId: string;
  reply: string;
  queued?: number; // count of inbox candidates queued (log path)
  tool?: AskToolName; // tool that answered (ask path)
}

const HISTORY_LIMIT = 6;

const classifierSchema = z.object({
  mode: z.enum(["log", "ask", "edit_or_delete", "noop"]),
  confidence: z.number().nullish(),
});

const askToolSchema = z.object({
  tool: z.enum([
    "month_spend",
    "category_spend",
    "recent_transactions",
    "budget_status",
    "account_balances",
  ]),
  params: z
    .object({
      month: z.string().nullish(),
      startDate: z.string().nullish(),
      endDate: z.string().nullish(),
      accountId: z.string().nullish(),
      accountName: z.string().nullish(),
      categoryId: z.string().nullish(),
      categoryName: z.string().nullish(),
      payee: z.string().nullish(),
      limit: z.number().nullish(),
    })
    .nullish(),
});

const CLASSIFIER_SYSTEM = `You classify a personal-finance message into
ONE of these modes:

- "log": the user is recording a spend, refund, salary, transfer, or
  any other transaction. Multiple expenses in one message still count
  as "log".
- "ask": the user is asking a question about their finances — totals,
  category spend, budget status, recent transactions, account balances.
- "edit_or_delete": the user wants to change or remove a previously
  logged transaction.
- "noop": greetings, thanks, small talk, anything that isn't a clear
  log/ask/edit.

Output ONLY a single JSON object: {"mode": "<one of the above>", "confidence": 0.0–1.0}.
No prose.`;

const ASK_TOOL_SYSTEM = `You are picking ONE database tool to answer a
finance question. Output ONLY a single JSON object:

{
  "tool": "month_spend" | "category_spend" | "recent_transactions" | "budget_status" | "account_balances",
  "params": {
    "month": "YYYY-MM"|null,
    "startDate": "YYYY-MM-DD"|null,
    "endDate": "YYYY-MM-DD"|null,
    "accountId": string|null,
    "accountName": string|null,
    "categoryId": string|null,
    "categoryName": string|null,
    "payee": string|null,
    "limit": integer|null
  }
}

Tool guide:
- month_spend: total spent + earned in a month. Use for "how much did
  I spend this month", "spending in April", "income this month".
- category_spend: total in a category over a range. Use for "how much
  did I spend on groceries", "food spending this month", or general
  category breakdowns when no specific category is named (returns top 5).
- recent_transactions: most recent transactions (optionally filtered).
  Use for "show last 5 expenses", "what were my recent groceries".
- budget_status: how much budget is left in a category or all.
  Use for "budget left for food", "how am I doing on budget".
- account_balances: balance per account.

Notes:
- Today's date is supplied in <today>. If the user says "this month",
  use today's YYYY-MM as the month.
- Resolve category/account by name when the user names them — pass it
  in categoryName or accountName.
- limit defaults to 5 for recent_transactions; cap by 15.
- Output ONLY the JSON. No prose.`;

const REPLY_SYSTEM = `You write a SHORT, friendly WhatsApp reply
combining the supplied facts. Plain text only — no JSON, no markdown
tables, no code fences. Use the symbol ₹ for rupees. Keep it under 2
short sentences unless the facts have a bulleted breakdown — then
output the breakdown verbatim and one wrapping line.

Output ONLY the reply text. No prose framing like "Here you go:".`;

export async function handleMessage(
  db: Db,
  config: AppConfig,
  request: AgentRequest,
): Promise<AgentResponse> {
  const text = request.text.trim();
  if (!text) {
    return {
      threadId: request.threadId ?? "",
      reply: "Send me an expense or ask a question — I can help with both.",
    };
  }
  const threadId =
    request.threadId ??
    `${request.source ?? "http"}:${newId().slice(0, 8)}`;

  appendTurn(db, threadId, "user", text);

  try {
    const mode = await classify(config, text);
    if (mode === "log") {
      return await handleLog(db, config, request, threadId, text);
    }
    if (mode === "ask") {
      return await handleAsk(db, config, threadId, text);
    }
    if (mode === "edit_or_delete") {
      const msg =
        "Edits live in the Gullak app for now — open the transaction there and tweak it.";
      appendTurn(db, threadId, "assistant", msg);
      return { threadId, reply: msg };
    }
    // noop
    const ack =
      "Got it. Send an amount like \"480 groceries\" to log, or ask \"how much have I spent this month?\".";
    appendTurn(db, threadId, "assistant", ack);
    return { threadId, reply: ack };
  } catch (err) {
    const fallback =
      "I didn't quite get that. Send the amount and what it was for, like \"480 groceries\".";
    appendTurn(db, threadId, "assistant", fallback);
    // Keep the original error visible in pi-server logs without leaking
    // model internals back to the user.
    // eslint-disable-next-line no-console
    console.warn(
      `agent failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { threadId, reply: fallback };
  }
}

async function classify(
  config: AppConfig,
  text: string,
): Promise<"log" | "ask" | "edit_or_delete" | "noop"> {
  // Cheap deterministic shortcuts before paying for a model call.
  const lower = text.toLowerCase().trim();
  if (/^(yes|yeah|sure|ok|nope|no|thanks|thank you|hi|hello|hey)\b/.test(lower)) {
    return "noop";
  }
  if (
    /(how much|how many|show|what.*spend|spent|balance|budget left|recent|last \d|this month|last month)/.test(
      lower,
    ) &&
    !/^\d/.test(lower) // questions usually don't start with a digit
  ) {
    return "ask";
  }
  if (/^(\d|rs\.?|inr|₹|spent|paid|got|received|refund|salary)/.test(lower)) {
    return "log";
  }
  if (/(edit|change|update|delete|remove|undo|cancel)/.test(lower)) {
    return "edit_or_delete";
  }
  // Fall back to the model for the ambiguous middle.
  try {
    const raw = await chatJson<unknown>(config, {
      system: CLASSIFIER_SYSTEM,
      user: text,
      temperature: 0,
    });
    return classifierSchema.parse(raw).mode;
  } catch {
    return "noop";
  }
}

async function handleLog(
  db: Db,
  config: AppConfig,
  request: AgentRequest,
  threadId: string,
  text: string,
): Promise<AgentResponse> {
  const accountList = db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .where(eq(accounts.archived, false))
    .all();
  const categoryList = db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .where(eq(categories.hidden, false))
    .all();

  const items = await parseWhatsappExpenses(config, {
    body: text,
    receivedAt: request.receivedAtMs ?? Date.now(),
    categories: categoryList,
    accounts: accountList,
  });

  if (items.length === 0) {
    const reply =
      "I didn't catch an amount in that. Try \"480 groceries\" or \"2,800 home decor on hdfc\".";
    appendTurn(db, threadId, "assistant", reply);
    return { threadId, reply };
  }

  const at = nowMs();
  const messageId = request.messageId ?? newId();
  db.transaction((tx) => {
    items.forEach((item, idx) => {
      tx.insert(whatsappInboxCandidates)
        .values({
          id: newId(),
          sourceUser: request.sourceUser ?? null,
          pushName: request.pushName ?? null,
          chatId: request.chatId ?? null,
          messageId,
          itemIndex: idx,
          body: item.text,
          receivedAt: request.receivedAtMs ?? at,
          candidateJson: candidateJson(item),
          status: "pending",
          deliveredAt: null,
          createdAt: at,
        })
        .run();
    });
  });

  const reply = composeLogReply(items);
  appendTurn(db, threadId, "assistant", reply);
  return { threadId, reply, queued: items.length };
}

async function handleAsk(
  db: Db,
  config: AppConfig,
  threadId: string,
  text: string,
): Promise<AgentResponse> {
  const today = todayIso();
  const history = recentHistory(db, threadId);
  const categoryList = db.select({ id: categories.id, name: categories.name }).from(categories).all();
  const accountList = db.select({ id: accounts.id, name: accounts.name }).from(accounts).all();
  const toolUser = [
    `<today>: ${today}`,
    `<accounts>: ${accountList.map((a) => a.name).join(", ") || "(none)"}`,
    `<categories>: ${categoryList.map((c) => c.name).join(", ") || "(none)"}`,
    "",
    `Question: ${text}`,
  ].join("\n");

  let toolCall: AskToolCall;
  try {
    const raw = await chatJson<unknown>(config, {
      system: ASK_TOOL_SYSTEM,
      user: toolUser,
      history,
      temperature: 0,
    });
    const parsed = askToolSchema.parse(raw);
    toolCall = {
      tool: parsed.tool,
      params: parsed.params
        ? {
            month: toStr(parsed.params.month),
            startDate: toStr(parsed.params.startDate),
            endDate: toStr(parsed.params.endDate),
            accountId: toStr(parsed.params.accountId),
            accountName: toStr(parsed.params.accountName),
            categoryId: toStr(parsed.params.categoryId),
            categoryName: toStr(parsed.params.categoryName),
            payee: toStr(parsed.params.payee),
            limit: toNum(parsed.params.limit),
          }
        : undefined,
    };
  } catch {
    const reply =
      "I couldn't figure out which numbers you wanted. Try \"how much did I spend this month?\" or \"recent groceries\".";
    appendTurn(db, threadId, "assistant", reply);
    return { threadId, reply };
  }

  const result = runAskTool(db, toolCall);
  // For tools that already produce a complete, formatted answer we send
  // the facts as-is. We don't run a second LLM pass for the bulleted
  // tools — keeps things fast and never re-introduces JSON leakage.
  const formatted = result.formatted.trim();
  const reply = sanitizeReply(formatted);
  appendTurn(db, threadId, "assistant", reply);
  return { threadId, reply, tool: toolCall.tool };
}

function composeLogReply(items: WhatsappCandidate[]): string {
  if (items.length === 1) {
    const it = items[0]!;
    const what = it.payee ?? it.categoryHint ?? it.notes ?? "expense";
    return `Got it — ${formatMoney(it.amountCents)} for ${what}. It's waiting in the Gullak Inbox for review.`;
  }
  const list = items
    .map((it) => {
      const what = it.payee ?? it.categoryHint ?? it.notes ?? "expense";
      return `${formatMoney(it.amountCents)} ${what}`;
    })
    .join(", ");
  return `Got ${items.length} expenses: ${list}. They're waiting in the Gullak Inbox for review.`;
}

/// Final defense before any string leaves the agent: strip control
/// chars, refuse output that looks like leaked JSON, cap length, and
/// substitute a clarification message instead. Invariant: LLM-derived
/// strings only reach the user *through* this sanitizer.
export function sanitizeReply(reply: string): string {
  const fallback =
    "I didn't quite get that. Send the amount and what it was for, like \"480 groceries\".";
  if (!reply || typeof reply !== "string") return fallback;
  const cleaned = reply
    // eslint-disable-next-line no-control-regex
    .replace(/[ --]/g, "")
    .trim();
  if (!cleaned) return fallback;
  // Refuse outputs that look like raw JSON or model internals.
  if (
    /^[\[\{]/.test(cleaned) &&
    /\b(action|amountCents|reply|kind)\b/.test(cleaned)
  ) {
    return fallback;
  }
  if (cleaned.length > 1500) return cleaned.slice(0, 1500).trimEnd() + "…";
  return cleaned;
}

function recentHistory(db: Db, threadId: string) {
  return db
    .select({ role: agentTurns.role, content: agentTurns.content })
    .from(agentTurns)
    .where(eq(agentTurns.threadId, threadId))
    .orderBy(desc(agentTurns.id))
    .limit(HISTORY_LIMIT)
    .all()
    .reverse();
}

function appendTurn(
  db: Db,
  threadId: string,
  role: "user" | "assistant",
  content: string,
) {
  db.insert(agentTurns)
    .values({ threadId, role, content, transactionId: null })
    .run();
}

function toStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

function toNum(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatMoney(minorCents: number): string {
  const abs = Math.abs(minorCents);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const formatted = whole.toLocaleString("en-IN");
  return frac === 0 ? `₹${formatted}` : `₹${formatted}.${String(frac).padStart(2, "0")}`;
}

// Re-export shapes used by routes that previously consumed AgentResponse.
export type { Db };

// Silence unused-import warnings — payees may be reintroduced once we
// wire payee-resolution shortcuts in the log branch.
void payees;
