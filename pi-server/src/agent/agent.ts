import { and, desc, eq, gt, inArray } from "drizzle-orm";

import {
  parseWhatsappExpenses,
  type WhatsappCandidate,
} from "../ai/whatsapp_parser.ts";
import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import { accounts, agentTurns, categories, transactions } from "../db/schema.ts";
import { newId, nowMs, recordChange } from "../repos/changelog.ts";
import { learnCategory } from "../rules/learn.ts";
import { handlePiMessage } from "./pi/engine.ts";
import type { PiModelDeps } from "./pi/provider.ts";
import type { WriteAction } from "./write_tools.ts";

/// Conversational entry point used by /v1/messages and the WhatsApp webhook.
/// Cheap deterministic paths run first and never touch the LLM:
///   - log: parse N expenses and BOOK each straight into the server DB
///     (with a change_log row), so the phone, sheets, and every other client
///     pull them via normal sync. The reply states what was booked (account +
///     category) so the user can correct it in-app — the app remains the place
///     to review/edit, but the server is the source of truth.
///   - undo-last: delete the most-recent chat-booked expense within a freshness
///     window.
/// Everything else goes to the single pi tool-calling engine (handlePiMessage),
/// which answers questions (read tools) OR makes changes (write tools).

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
  // Trusted structured selection from the web register: the ids of the
  // transactions the user has ticked. DISTINCT from the advisory `context` —
  // these are resolved to concrete rows and rendered into the model turn so a
  // bare "categorize these" / "delete these" acts on exactly this set. Capped
  // at 200; invalid entries are dropped.
  selection?: { transactionIds?: string[] };
}

// A write the agent performed, echoed to the UI so it can render a result card
// and an Undo. `undo` names a write tool + server-authored args the UI replays.
export type { WriteAction };

const MAX_SELECTION_IDS = 200;
// How many selected rows to spell out in the prompt before summarizing.
const MAX_SELECTION_SHOWN = 30;

// Cap the serialized context so a bloated client payload can't blow up the
// prompt. ~1 KB is plenty for {view, goalId, month} style breadcrumbs.
const MAX_CONTEXT_BYTES = 1024;

/// Render the advisory context breadcrumb, or "" if absent/invalid/oversized.
export function renderContextLine(context: unknown): string {
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
  tool?: string; // tool that answered/acted (ask or write path)
  // Structured sidecar describing any writes the agent performed, so the web UI
  // can render a result card + Undo. Additive — the natural-language `reply`
  // stays the primary surface.
  actions?: WriteAction[];
}

const HISTORY_LIMIT = 6;

const EMPTY_REPLY =
  "Send me an expense or ask a question — I can help with both.";
const NOOP_ACK =
  "Got it. Send an amount like \"480 groceries\" to log, or ask \"how much have I spent this month?\".";
const CLASSIFY_FALLBACK =
  "I didn't quite get that. Send the amount and what it was for, like \"480 groceries\".";

/// The routing entry point /v1/messages and the WhatsApp webhook call. Cheap
/// deterministic paths (empty, greeting, amount-prefix log, undo-last) run FIRST
/// and never touch the LLM. Everything else — for every source, WhatsApp
/// included — goes to the single pi tool-calling engine.
export async function dispatchMessage(
  db: Db,
  config: AppConfig,
  request: AgentRequest,
  // Optional model deps, forwarded to the pi engine. Production leaves this
  // unset (the engine builds from config); tests inject a faux provider.
  deps?: PiModelDeps,
): Promise<AgentResponse> {
  const text = request.text.trim();
  if (!text) {
    return { threadId: request.threadId ?? "", reply: EMPTY_REPLY };
  }
  const threadId =
    request.threadId ?? `${request.source ?? "http"}:${newId().slice(0, 8)}`;
  const req: AgentRequest = { ...request, threadId };
  const lower = text.toLowerCase().trim();
  const hasSelection = (request.selection?.transactionIds?.length ?? 0) > 0;

  // Cheap deterministic paths — engine-independent, never an LLM call.
  if (isWholeGreeting(lower)) {
    appendTurn(db, threadId, "user", text);
    appendTurn(db, threadId, "assistant", NOOP_ACK);
    return { threadId, reply: NOOP_ACK };
  }
  if (isLogPrefix(lower)) {
    appendTurn(db, threadId, "user", text);
    return await handleLog(db, config, req, threadId, text);
  }
  if (!hasSelection && isUndoLastPhrase(lower)) {
    appendTurn(db, threadId, "user", text);
    return runUndoLast(db, threadId);
  }

  // Everything else → the pi engine. handlePiMessage persists the user turn
  // itself and, once it has, never throws — run failures come back as honest
  // replies (with any committed write actions attached). A throw can therefore
  // only mean a PRE-persist failure (history read / model construction) where
  // nothing was persisted; append the user turn + a canned fallback here so the
  // thread history stays consistent (mirroring what the persisting paths do).
  try {
    return await handlePiMessage(db, config, req, deps);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `pi engine error: ${err instanceof Error ? err.message : String(err)}`,
    );
    appendTurn(db, threadId, "user", text);
    appendTurn(db, threadId, "assistant", CLASSIFY_FALLBACK);
    return { threadId, reply: CLASSIFY_FALLBACK };
  }
}

/// True when POST /v1/messages/stream should drive the pi engine (and therefore
/// emit real deltas/tool events) rather than compute a one-shot AgentResponse.
/// Mirrors dispatchMessage's routing decision for the streaming endpoint:
/// everything that isn't a cheap deterministic path streams via pi.
export function wouldStreamViaPi(request: AgentRequest): boolean {
  const text = request.text.trim();
  if (!text) return false;
  const lower = text.toLowerCase().trim();
  const hasSelection = (request.selection?.transactionIds?.length ?? 0) > 0;
  if (isWholeGreeting(lower) || isLogPrefix(lower)) return false;
  if (!hasSelection && isUndoLastPhrase(lower)) return false;
  return true;
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
  // #39: payee/category of each booked row, collected for best-effort auto-learn
  // AFTER the write commits (so the just-booked rows are counted).
  const toLearn: { payeeName: string | null; categoryId: string | null }[] = [];
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
      toLearn.push({ payeeName: row.payeeName, categoryId: row.categoryId });
    });
  });

  // #39: auto-learn payee→category rules from the booked expenses. Best-effort;
  // learnCategory never throws. Agent bookings have no payeeId, so this matches
  // history by payee name.
  for (const l of toLearn) {
    if (l.categoryId) {
      learnCategory(db, { payeeName: l.payeeName, categoryId: l.categoryId });
    }
  }

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

// ── deterministic cheap-path predicates (no model) ────────────────────────────
// Shared by dispatchMessage and wouldStreamViaPi so both agree on which messages
// never touch the LLM. Kept as pure string tests.

/// Whole-message greeting/ack → noop.
export function isWholeGreeting(lower: string): boolean {
  return /^(yes|yeah|sure|ok|okay|nope|no|thanks|thank you|hi|hello|hey)[\s!.,]*$/.test(
    lower,
  );
}

/// Starts with an amount or a spend/receive verb → a log.
export function isLogPrefix(lower: string): boolean {
  return /^(\d|rs\.?|inr|₹|spent|paid|got|received|refund|salary)\b/.test(lower);
}

/// "undo" / "scrap that" / "delete the last one" → the deterministic undo-last.
export function isUndoLastPhrase(lower: string): boolean {
  return (
    /^(undo|scrap|nvm|never ?mind)\b/.test(lower) ||
    /\b(undo|delete|remove|cancel|scrap)\b.*\b(last|that|it|previous|latest)\b/.test(
      lower,
    )
  );
}

/// Delete the most-recent chat-booked expense, but only if it's fresh (1h), so a
/// stray "undo" can never wipe an older transaction. Appends the assistant turn.
function runUndoLast(db: Db, threadId: string): AgentResponse {
  const cutoff = nowMs() - 60 * 60 * 1000;
  const last = db
    .select()
    .from(transactions)
    .where(
      and(eq(transactions.origin, "whatsapp"), gt(transactions.createdAt, cutoff)),
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

/// Render the trusted selection into concrete, actionable context. Only ids that
/// exist are shown; >MAX_SELECTION_SHOWN rows are summarized so the prompt stays
/// bounded. Returns "" when there's nothing usable.
export function renderSelectionLine(
  db: Db,
  selection: AgentRequest["selection"],
): string {
  const raw = selection?.transactionIds;
  if (!Array.isArray(raw) || raw.length === 0) return "";
  const ids = [
    ...new Set(
      raw.filter((id): id is string => typeof id === "string" && id.trim().length > 0),
    ),
  ].slice(0, MAX_SELECTION_IDS);
  if (ids.length === 0) return "";

  const rows = db
    .select({
      id: transactions.id,
      date: transactions.date,
      payeeName: transactions.payeeName,
      amountCents: transactions.amountCents,
      categoryId: transactions.categoryId,
      accountId: transactions.accountId,
    })
    .from(transactions)
    .where(inArray(transactions.id, ids))
    .all();
  if (rows.length === 0) return "";

  const shown = rows.slice(0, MAX_SELECTION_SHOWN);
  const lines = shown.map((r) => {
    const catName = r.categoryId ? categoryNameById(db, r.categoryId) : "uncategorised";
    const payee = r.payeeName ?? "—";
    return `  - id=${r.id} | ${r.date} | ${payee} | ${formatMoney(Math.abs(r.amountCents))} | category: ${catName}`;
  });
  const more =
    rows.length > shown.length ? `\n  …and ${rows.length - shown.length} more` : "";
  return `The user has selected these ${rows.length} transaction${rows.length === 1 ? "" : "s"} — act on THESE when they say "these"/"them"/"the selected ones":\n${lines.join("\n")}${more}`;
}

function categoryNameById(db: Db, id: string): string {
  return (
    db
      .select({ name: categories.name })
      .from(categories)
      .where(eq(categories.id, id))
      .get()?.name ?? "uncategorised"
  );
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
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
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

export function recentHistory(db: Db, threadId: string) {
  return db
    .select({ role: agentTurns.role, content: agentTurns.content })
    .from(agentTurns)
    .where(eq(agentTurns.threadId, threadId))
    .orderBy(desc(agentTurns.id))
    .limit(HISTORY_LIMIT)
    .all()
    .reverse();
}

export function appendTurn(
  db: Db,
  threadId: string,
  role: "user" | "assistant",
  content: string,
  transactionId: string | null = null,
) {
  db.insert(agentTurns)
    .values({ threadId, role, content, transactionId })
    .run();
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
