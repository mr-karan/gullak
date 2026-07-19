import { and, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";

import {
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
  transactions,
} from "../db/schema.ts";
import {
  chatJson,
  chatTools,
  LlmHttpError,
  type ChatToolCall,
} from "../llm/client.ts";
import { newId, nowMs, recordChange } from "../repos/changelog.ts";
import {
  ASK_TOOL_NAMES,
  ASK_TOOL_SCHEMAS,
  runAskTool,
  type AskToolCall,
  type AskToolName,
} from "./ask_tools.ts";

/// Conversational entry point used by /v1/messages and the WhatsApp
/// webhook. Splits into:
///   - log: parse N expenses and BOOK each straight into the server DB
///     (with a change_log row), so the phone, sheets, and every other client
///     pull them via normal sync. The reply states what was booked (account +
///     category) so the user can correct it in-app — the app remains the place
///     to review/edit, but the server is the source of truth.
///   - ask: pick one pre-canned aggregation tool and answer with concrete
///     numbers from the server DB.
///
/// Edit/delete via chat still nudges to the app (identifying the exact row
/// conversationally is a follow-up).

export interface AgentRequest {
  text: string;
  threadId?: string;
  source?: string;
  sourceUser?: string;
  pushName?: string;
  chatId?: string;
  messageId?: string;
  receivedAtMs?: number;
  // Advisory "where is the user" hint from the web sidebar. Prose only — it is
  // appended to the model turn to steer answers, NEVER parsed and never allowed
  // to drive writes. Oversized/invalid values are dropped.
  context?: unknown;
}

// Cap the serialized context so a bloated client payload can't blow up the
// prompt. ~1 KB is plenty for {view, goalId, month} style breadcrumbs.
const MAX_CONTEXT_BYTES = 1024;

/// Render the advisory context breadcrumb, or "" if absent/invalid/oversized.
function renderContextLine(context: unknown): string {
  if (context === null || typeof context !== "object" || Array.isArray(context)) {
    return "";
  }
  let serialized: string;
  try {
    serialized = JSON.stringify(context);
  } catch {
    return "";
  }
  if (!serialized || serialized === "{}" || serialized.length > MAX_CONTEXT_BYTES) {
    return "";
  }
  return `User is currently viewing: ${serialized}`;
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

const ASK_AGENT_SYSTEM = `You are Gullak, a friendly personal-finance
assistant answering questions about the user's own transaction data over
WhatsApp / in-app chat.

You have TOOLS that run real SQL over the user's database. To answer any
question about spending, income, balances, budgets, or specific
transactions, you MUST call the relevant tool(s) — never invent numbers.
Call more than one tool when a question needs it (e.g. "how does this
month compare to last month?" → call summary twice with different months).

Resolving dates:
- The current date and the user's accounts/categories are in the first
  user message.
- "this month" = the current YYYY-MM. "last month" = the previous one.
- Pass a category or account by NAME (categoryName/accountName); the
  server matches it.

Judgement rules (learned from the owner — apply them, don't recite them):
- Before calling a month's spend "high", check whether one or two one-shot
  purchases dominate it (furniture, trip prep, gadgets, medical). Call
  top_payees or search_transactions to spot them, name the one-shots, and
  quote the recurring run-rate without them.
- Headline merchants land better than categories: "Zomato ₹8,898 in one
  order" beats "Eating Out ₹18K". Lead with the merchant when one stands out.
- Quick-commerce (Blinkit) sits inside Groceries and inflates it; mention
  that when Groceries looks unusually high.
- State numbers plainly. Never moralise about spending or suggest cuts
  unless asked.

Wealth, goals, and desires (the money-manager tools):
- When a money question spans cash AND investments ("what are we worth",
  "can we afford X"), use net_worth or afford_check — not just
  account_balances. Account balances alone are the wrong answer for
  net-worth questions.
- For desire / "can we afford it" questions, state the surplus math plainly
  (monthly surplus, months-of-surplus, cash on hand) and STOP. NEVER moralise,
  never recommend, never say whether to buy it — present the numbers and let
  the humans decide. This is a hard rule.
- Goals language: speak in "on pace / needs ₹X per month" terms, never in
  financial-advice terms. No "you should invest more", no verdicts.
- Investment values are as-of-import; when you quote a blended/net-worth
  number, mention it's as of the import date if the tool gives one.

When you have the numbers, write a SHORT, warm reply in plain text.
Use the ₹ symbol for rupees. If a tool returned a bulleted breakdown,
keep the bullets. No JSON, no markdown tables, no code fences. Keep it to
1–2 sentences plus any bullets.`;

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
      return await handleAsk(db, config, threadId, text, request.context);
    }
    if (mode === "edit_or_delete") {
      return handleEditOrDelete(db, threadId, text);
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
  // LOG before ASK: a message that STARTS with an amount or a spend/receive
  // verb ("spent 480 …", "got 2000 refund") is recording, even though words
  // like "spent" also appear in the ask-regex. Questions start with how/what/
  // show/etc., so they fall through to the ask check below.
  if (/^(\d|rs\.?|inr|₹|spent|paid|got|received|refund|salary)\b/.test(lower)) {
    return "log";
  }
  if (
    /(how much|how many|show|what.*spend|spent|balance|budget left|recent|last \d|this month|last month|net worth|worth|afford|portfolio|holdings|goal)/.test(
      lower,
    ) &&
    !/^\d/.test(lower) // questions usually don't start with a digit
  ) {
    return "ask";
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

  const defaultAccount = accountList[0];
  if (!defaultAccount) {
    const reply =
      "You don't have any accounts set up yet — add one in the app first.";
    appendTurn(db, threadId, "assistant", reply);
    return { threadId, reply };
  }

  const at = nowMs();
  const messageId = request.messageId ?? newId();
  const booked: BookedExpense[] = [];
  db.transaction((tx) => {
    items.forEach((item, idx) => {
      const account = resolveByHint(item.accountHint, accountList) ?? defaultAccount;
      const category = resolveByHint(item.categoryHint, categoryList);
      const id = newId();
      // Expense is negative; income/refund/salary positive.
      const amountCents = item.isIncome
        ? Math.abs(item.amountCents)
        : -Math.abs(item.amountCents);
      const row = {
        id,
        accountId: account.id,
        categoryId: category?.id ?? null,
        payeeId: null,
        payeeName: item.payee ?? null,
        amountCents,
        date: item.date ?? todayIso(),
        notes: item.notes ?? null,
        latitude: null,
        longitude: null,
        locationName: null,
        cleared: false,
        origin: "whatsapp",
        originRef: `${messageId}:${idx}`,
        transferAccountId: null,
        transferGroupId: null,
        parentId: null,
        splitTotalCents: null,
        createdAt: at,
        updatedAt: at,
      };
      // TODO(#41): the log path books each item as a single plain txn. When the
      // parser can flag an item as an account-to-account transfer (e.g. "moved
      // 5000 from HDFC to cash"), resolve both accounts and call
      // createTransferPair(tx, primaryRow) from ../transactions/transfers.ts
      // instead of this single insert, so the mirror leg is auto-created in one
      // transaction. No transfer detection exists in parseWhatsappExpenses yet,
      // so there is nothing to hook today.
      tx.insert(transactions)
        .values(row)
        .onConflictDoUpdate({ target: transactions.id, set: row })
        .run();
      // change_log row → phone / sheets / any client pulls it via normal sync.
      recordChange(tx, {
        resource: "transactions",
        resourceId: id,
        op: "upsert",
        payload: row,
      });
      booked.push({
        item,
        accountName: account.name,
        categoryName: category?.name ?? null,
      });
    });
  });

  const reply = composeBookedReply(booked);
  appendTurn(db, threadId, "assistant", reply);
  return { threadId, reply, queued: booked.length };
}

interface BookedExpense {
  item: WhatsappCandidate;
  accountName: string;
  categoryName: string | null;
}

/** Match a free-text hint ("hdfc", "groceries") to a named row, case-insensitive. */
function resolveByHint<T extends { id: string; name: string }>(
  hint: string | null | undefined,
  rows: T[],
): T | undefined {
  const h = hint?.trim().toLowerCase();
  if (!h) return undefined;
  return (
    rows.find((r) => r.name.toLowerCase() === h) ??
    rows.find(
      (r) => r.name.toLowerCase().includes(h) || h.includes(r.name.toLowerCase()),
    )
  );
}

function handleEditOrDelete(
  db: Db,
  threadId: string,
  text: string,
): AgentResponse {
  const lower = text.toLowerCase();
  const undoLast =
    /^(undo|scrap|nvm|never ?mind)\b/.test(lower) ||
    /\b(undo|delete|remove|cancel|scrap)\b.*\b(last|that|it|previous|latest)\b/.test(
      lower,
    );
  if (undoLast) {
    // Only the most-recent chat-booked expense, and only if it's fresh (1h),
    // so a stray "undo" can never wipe an older transaction.
    const cutoff = nowMs() - 60 * 60 * 1000;
    const last = db
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.origin, "whatsapp"),
          gt(transactions.createdAt, cutoff),
        ),
      )
      .orderBy(desc(transactions.createdAt))
      .limit(1)
      .get();
    if (!last) {
      const reply =
        "Nothing recent from here to undo — open the app to edit older entries.";
      appendTurn(db, threadId, "assistant", reply);
      return { threadId, reply };
    }
    db.transaction((tx) => {
      tx.delete(transactions).where(eq(transactions.id, last.id)).run();
      recordChange(tx, {
        resource: "transactions",
        resourceId: last.id,
        op: "delete",
      });
    });
    const what = last.payeeName ? ` — ${last.payeeName}` : "";
    const reply = `Deleted ${formatMoney(Math.abs(last.amountCents))}${what}. It's gone from all your devices.`;
    appendTurn(db, threadId, "assistant", reply);
    return { threadId, reply };
  }
  const reply =
    'To change a specific past entry, open it in the Gullak app. I can "undo" the last thing you logged here though — just say "undo".';
  appendTurn(db, threadId, "assistant", reply);
  return { threadId, reply };
}

async function handleAsk(
  db: Db,
  config: AppConfig,
  threadId: string,
  text: string,
  context?: unknown,
): Promise<AgentResponse> {
  // No model configured → the tool-calling loop can't run. Answer honestly
  // rather than firing a doomed request with the dummy key.
  if (!config.ai.enabled) {
    const reply =
      "The assistant isn't configured with a model right now, so I can't answer questions yet. You can still log expenses (e.g. \"480 groceries\").";
    appendTurn(db, threadId, "assistant", reply);
    return { threadId, reply };
  }
  const today = todayIso();
  const history = recentHistory(db, threadId);
  const categoryList = db
    .select({ id: categories.id, name: categories.name })
    .from(categories)
    .all();
  const accountList = db
    .select({ id: accounts.id, name: accounts.name })
    .from(accounts)
    .all();
  const contextLine = renderContextLine(context);
  const toolUser = [
    `Today's date: ${today}. Currency: ${config.defaultCurrency}.`,
    `Accounts: ${accountList.map((a) => a.name).join(", ") || "(none)"}`,
    `Categories: ${categoryList.map((c) => c.name).join(", ") || "(none)"}`,
    ...(contextLine ? [contextLine] : []),
    "",
    `Question: ${text}`,
  ].join("\n");

  // Track which tool(s) the model invoked so /v1/messages can echo the last
  // one back (kept for response-shape compatibility with the app/web chat).
  let lastTool: AskToolName | undefined;

  try {
    const answer = await chatTools(config, {
      system: ASK_AGENT_SYSTEM,
      user: toolUser,
      history,
      temperature: 0,
      tools: ASK_TOOL_SCHEMAS,
      runTool: (call: ChatToolCall) =>
        runAskToolCall(db, call, (name) => {
          lastTool = name;
        }),
    });
    const reply = sanitizeReply(answer.trim());
    appendTurn(db, threadId, "assistant", reply);
    return { threadId, reply, tool: lastTool };
  } catch (err) {
    // 402 (out of credits) / 503 / network → assistant unavailable, but never
    // crash the request. LlmHttpError specifically covers the provider gate.
    if (err instanceof LlmHttpError) {
      const reply =
        "The assistant is temporarily unavailable — I couldn't reach the model. You can still log expenses (e.g. \"480 groceries\") and I'll book them.";
      appendTurn(db, threadId, "assistant", reply);
      return { threadId, reply };
    }
    throw err;
  }
}

/// Adapt one raw model tool_call into an AskToolCall, run it, and return the
/// formatted string fed back to the model. Unknown tool names get a clear
/// message instead of throwing so the loop keeps going. Args that fail to parse
/// degrade to defaults (empty params) rather than crashing.
function runAskToolCall(
  db: Db,
  call: ChatToolCall,
  onTool: (name: AskToolName) => void,
): string {
  if (!ASK_TOOL_NAMES.has(call.name)) {
    return `Unknown tool "${call.name}". Available: ${[...ASK_TOOL_NAMES].join(", ")}.`;
  }
  const tool = call.name as AskToolName;
  onTool(tool);
  let args: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(call.arguments || "{}");
    if (parsed && typeof parsed === "object") {
      args = parsed as Record<string, unknown>;
    }
  } catch {
    // Malformed args JSON — run with defaults; most tools have a sensible
    // current-month fallback.
  }
  const result = runAskTool(db, {
    tool,
    params: {
      month: toStr(args.month),
      startDate: toStr(args.startDate),
      endDate: toStr(args.endDate),
      accountId: toStr(args.accountId),
      accountName: toStr(args.accountName),
      categoryId: toStr(args.categoryId),
      categoryName: toStr(args.categoryName),
      payee: toStr(args.payee),
      query: toStr(args.query),
      limit: toNum(args.limit),
      goalName: toStr(args.goalName),
      person: toStr(args.person),
      status: toStr(args.status),
      amountCents: toNum(args.amountCents),
      desireName: toStr(args.desireName),
    },
  });
  return result.formatted;
}

function composeBookedReply(booked: BookedExpense[]): string {
  const money = (c: number) => formatMoney(Math.abs(c));
  if (booked.length === 1) {
    const b = booked[0]!;
    const what = b.item.payee ?? b.categoryName ?? b.item.notes ?? "expense";
    const cat = b.categoryName ? ` · ${b.categoryName}` : "";
    const verb = b.item.isIncome ? "Logged income" : "Logged";
    return `${verb} ${money(b.item.amountCents)} — ${what}${cat} · ${b.accountName} ✓  Edit in the app if that's off.`;
  }
  const list = booked
    .map((b) => {
      const what = b.item.payee ?? b.categoryName ?? "expense";
      return `• ${money(b.item.amountCents)} ${what} · ${b.accountName}`;
    })
    .join("\n");
  return `Logged ${booked.length} ✓\n${list}\nEdit any in the app.`;
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
