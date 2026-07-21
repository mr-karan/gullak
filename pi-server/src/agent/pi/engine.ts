import { Agent } from "@earendil-works/pi-agent-core";
import type { AgentMessage } from "@earendil-works/pi-agent-core";
import type {
  Api,
  AssistantMessage,
  Model,
  TextContent,
  Usage,
  UserMessage,
} from "@earendil-works/pi-ai";

import type { AppConfig } from "../../config.ts";
import type { Db } from "../../db/index.ts";
import { accounts, categories } from "../../db/schema.ts";
import { newId } from "../../repos/changelog.ts";
import {
  appendTurn,
  recentHistory,
  renderContextLine,
  renderSelectionLine,
  sanitizeReply,
  type AgentRequest,
  type AgentResponse,
} from "../agent.ts";
import { WRITE_TOOL_NAMES, type WriteToolName } from "../write_tools.ts";
import { buildPiModel, type PiModelDeps } from "./provider.ts";
import {
  buildAskTools,
  buildWriteTools,
  type WriteToolCollector,
} from "./tools.ts";

/// The single tool-calling engine. One pi `Agent` run per request answers
/// questions (read tools) OR makes changes (write tools), replacing the legacy
/// classifier + ask/write split. Same AgentResponse shape as before.

export type PiUiEvent =
  | { type: "delta"; text: string }
  | { type: "tool_start"; tool: string }
  | { type: "tool_end"; tool: string; ok: boolean };

const MAX_DELETE_IDS = 50;

const AI_UNCONFIGURED =
  "The assistant isn't configured with a model right now, so I can't answer questions yet. You can still log expenses (e.g. \"480 groceries\").";
const AI_UNAVAILABLE =
  "The assistant is temporarily unavailable — I couldn't reach the model. You can still log expenses (e.g. \"480 groceries\") and I'll book them.";

const PI_SYSTEM = `You are Gullak, a warm, plain-spoken personal-finance assistant for the user's own data, chatting in-app or over WhatsApp.

You have TOOLS that run real SQL over the user's database.
- READ tools (summary, category_spend, search_transactions, recent_transactions, account_balances, net_worth, top_payees, afford_check, goal/desire/holdings tools, …) answer questions. Never invent numbers — call tools. Call several when a question needs it (comparisons, "where can I cut back").
- WRITE tools (categorize_transactions, edit_transaction, delete_transactions, log_transaction) change data. Only call one when the user clearly asks to add, change, or delete something. If the message is a question or ambiguous, use READ tools only.

Resolving things:
- The current date and the user's accounts/categories are in the first user message. "this month" = current YYYY-MM.
- Pass categories/accounts by NAME (categoryName/accountName); the server matches them. Amounts are positive paise; the expense/income sign is handled for you.
- "these" / "them" / "the selected ones" = the transactions listed under "The user has selected …". Act on exactly those ids.
- To act on rows you haven't been given (e.g. "delete the duplicate"), find them with a READ tool first, then write with those ids. Reconciled (locked) rows are skipped by the tools; say so if some were.

Judgement (learned from the owner — apply, don't recite):
- Advisory questions ("where can I cut back", "am I overspending") are answered from the data: check whether one or two one-shot purchases dominate the month (furniture, trip prep, gadgets, medical) via top_payees or search_transactions, name the one-shots, and quote the recurring run-rate without them.
- Headline merchants land better than categories: "Zomato ₹8,898 in one order" beats "Eating Out ₹18K".
- Quick-commerce (Blinkit) sits inside Groceries and inflates it; mention that when Groceries looks high.
- State numbers plainly. Never moralise or recommend cuts unless the user asked for exactly that.
- Net-worth/afford questions span cash AND investments: use net_worth or afford_check, not just account_balances. Investment values are as-of-import; say so when quoting them.
- Desires/"can we afford it": present the surplus math (monthly surplus, months-of-surplus, cash on hand) and STOP — no verdicts, no advice. Goals: "on pace / needs ₹X per month" language only.

Reply style: SHORT and warm, plain text, ₹ for rupees. Keep tool bullets if useful. No JSON, no markdown tables, no code fences. 1–2 sentences plus bullets at most. After a write, confirm concretely ("Done — recategorized 3 to Food.").`;

/// Non-streaming entry point. Drains the streaming generator and returns the
/// final AgentResponse — so both paths share exactly one implementation.
export async function handlePiMessage(
  db: Db,
  config: AppConfig,
  request: AgentRequest,
  deps?: PiModelDeps,
): Promise<AgentResponse> {
  const gen = streamPiMessage(db, config, request, deps);
  while (true) {
    const next = await gen.next();
    if (next.done) return next.value;
  }
}

/// Streaming entry point. Yields UI events (text deltas, tool start/end) as the
/// run proceeds and returns the final AgentResponse. Persists the user turn
/// before the run and the assistant turn after.
export async function* streamPiMessage(
  db: Db,
  config: AppConfig,
  request: AgentRequest,
  deps?: PiModelDeps,
): AsyncGenerator<PiUiEvent, AgentResponse> {
  const text = request.text.trim();
  const threadId =
    request.threadId ?? `${request.source ?? "http"}:${newId().slice(0, 8)}`;

  // No model configured → the tool loop can't run. Answer honestly, matching the
  // legacy ask path verbatim, with no pi machinery.
  if (!config.ai.enabled) {
    appendTurn(db, threadId, "user", text);
    appendTurn(db, threadId, "assistant", AI_UNCONFIGURED);
    return { threadId, reply: AI_UNCONFIGURED };
  }

  // Order matters for turn-persistence guarantees:
  //  1. Everything that can plausibly throw (history read, model construction)
  //     runs BEFORE the user turn is persisted — a throw here reaches
  //     dispatchMessage's catch, which appends its own user + fallback turns.
  //     No double-append, no orphan.
  //  2. After appendTurn, run failures are mapped to honest replies below and
  //     never escape the generator — a persisted user turn always gets an
  //     assistant turn, so the thread history can't hold orphaned questions.
  // History is read before appending so the current message isn't duplicated
  // (it becomes the prompt below).
  const preHistory = recentHistory(db, threadId);
  const { models, model } = deps ?? buildPiModel(config);
  const history = mapHistory(preHistory, model);
  appendTurn(db, threadId, "user", text);

  const collector: WriteToolCollector = { actions: [] };
  const askTools = buildAskTools(db);
  const writeTools = buildWriteTools(db, collector);

  const categoryList = db.select({ name: categories.name }).from(categories).all();
  const accountList = db.select({ name: accounts.name }).from(accounts).all();
  const contextLine = renderContextLine(request.context);
  const selectionLine = renderSelectionLine(db, request.selection);
  const firstUser = [
    `Today's date: ${todayIso()}. Currency: ${config.defaultCurrency}.`,
    `Accounts: ${accountList.map((a) => a.name).join(", ") || "(none)"}`,
    `Categories: ${categoryList.map((c) => c.name).join(", ") || "(none)"}`,
    ...(contextLine ? [contextLine] : []),
    ...(selectionLine ? [selectionLine] : []),
    "",
    `Request: ${text}`,
  ].join("\n");

  const agent = new Agent({
    initialState: {
      systemPrompt: PI_SYSTEM,
      model,
      thinkingLevel: "off",
      tools: [...askTools, ...writeTools],
      messages: history,
    },
    streamFn: (m, ctx, opts) => models.streamSimple(m, ctx, opts),
    // Structural guardrails (not prompt-level): cap mass deletes, and audit every
    // write tool call with a compact arg summary (never full payloads).
    beforeToolCall: async (context) => {
      const name = context.toolCall.name;
      const args = asRecord(context.args);
      if (name === "delete_transactions") {
        const ids = Array.isArray(args.transactionIds) ? args.transactionIds : [];
        if (ids.length > MAX_DELETE_IDS) {
          return {
            block: true,
            reason: "refusing to delete more than 50 transactions in one call",
          };
        }
      }
      if (WRITE_TOOL_NAMES.has(name as WriteToolName)) {
        // eslint-disable-next-line no-console
        console.info(`pi write tool: ${name} ${summarizeArgs(args)}`);
      }
      return undefined;
    },
  });

  // Bridge the callback-based event stream into this generator via a small queue.
  const queue: PiUiEvent[] = [];
  let notify: (() => void) | null = null;
  let finished = false;
  let runError: unknown = null;
  const wake = () => {
    if (notify) {
      const n = notify;
      notify = null;
      n();
    }
  };

  const unsub = agent.subscribe((event) => {
    if (event.type === "message_update") {
      const ev = event.assistantMessageEvent;
      if (ev.type === "text_delta" && ev.delta) {
        queue.push({ type: "delta", text: ev.delta });
      }
    } else if (event.type === "tool_execution_start") {
      // Authoritative "last tool" for res.tool — set in source order for ask AND
      // write tools alike.
      collector.lastTool = event.toolName;
      queue.push({ type: "tool_start", tool: event.toolName });
    } else if (event.type === "tool_execution_end") {
      queue.push({ type: "tool_end", tool: event.toolName, ok: !event.isError });
    }
    wake();
  });

  // Snapshot the pre-run message count so the final-reply search below can't
  // accidentally match an assistant message from the injected HISTORY (which
  // would replay a prior turn's text as this turn's reply).
  const baseLen = agent.state.messages.length;

  const runPromise = agent
    .prompt(firstUser)
    .then(
      () => {
        finished = true;
      },
      (e) => {
        runError = e;
        finished = true;
      },
    )
    .finally(wake);

  while (true) {
    while (queue.length > 0) {
      yield queue.shift()!;
    }
    if (finished) break;
    await new Promise<void>((resolve) => {
      notify = resolve;
    });
  }
  unsub();
  await runPromise;

  // A rejected prompt is an UNEXPECTED (non-pi-contract) failure. It must NOT
  // escape the generator: the user turn is already persisted, so a throw here
  // would orphan it (the /stream route has no legacy fallback), and falling
  // back to the legacy flow after a COMMITTED write would re-run the request —
  // for log_transaction that books the expense TWICE. Map both shapes to
  // honest replies instead.
  if (runError) {
    // eslint-disable-next-line no-console
    console.warn(
      `pi run rejected (mapped to reply, no fallback): ${
        runError instanceof Error ? runError.message : String(runError)
      }`,
    );
    if (collector.actions.length > 0) {
      const reply =
        "I made the change, but hit an error writing the summary — check the register to confirm.";
      const firstWritten = collector.actions.find((a) => a.affectedIds.length > 0)
        ?.affectedIds[0];
      appendTurn(db, threadId, "assistant", reply, firstWritten ?? null);
      return {
        threadId,
        reply,
        tool: collector.lastTool,
        actions: collector.actions,
      };
    }
    appendTurn(db, threadId, "assistant", AI_UNAVAILABLE);
    return { threadId, reply: AI_UNAVAILABLE };
  }

  const finalMsg = [...agent.state.messages.slice(baseLen)]
    .reverse()
    .find((m): m is AssistantMessage => m.role === "assistant");

  // Model unreachable / errored → the same graceful reply the legacy paths use.
  // UNLESS a write already committed this turn: "couldn't reach the model" would
  // then be a lie (money moved), and dropping the actions would cost the UI its
  // result card + Undo. Report the committed change honestly instead.
  if (
    !finalMsg ||
    finalMsg.stopReason === "error" ||
    finalMsg.stopReason === "aborted"
  ) {
    if (collector.actions.length > 0) {
      const reply =
        "I made the change, but hit an error writing the summary — check the register to confirm.";
      const firstWritten = collector.actions.find((a) => a.affectedIds.length > 0)
        ?.affectedIds[0];
      appendTurn(db, threadId, "assistant", reply, firstWritten ?? null);
      return {
        threadId,
        reply,
        tool: collector.lastTool,
        actions: collector.actions,
      };
    }
    appendTurn(db, threadId, "assistant", AI_UNAVAILABLE);
    return { threadId, reply: AI_UNAVAILABLE };
  }

  const rawText = finalMsg.content
    .filter((c): c is TextContent => c.type === "text")
    .map((c) => c.text)
    .join("")
    .trim();
  const reply = sanitizeReply(rawText);
  // Traceability: pin the assistant turn to the first row a write touched.
  const firstAffected = collector.actions.find((a) => a.affectedIds.length > 0)
    ?.affectedIds[0];
  appendTurn(db, threadId, "assistant", reply, firstAffected ?? null);

  return {
    threadId,
    reply,
    tool: collector.lastTool,
    actions: collector.actions.length > 0 ? collector.actions : undefined,
  };
}

// ── helpers ──────────────────────────────────────────────────────────────────

/// Map stored chat turns into pi AgentMessages: user rows → user messages,
/// assistant rows → assistant messages with a single text block.
function mapHistory(
  rows: { role: string; content: string }[],
  model: Model<Api>,
): AgentMessage[] {
  const ts = Date.now();
  return rows.map((r): AgentMessage => {
    if (r.role === "assistant") {
      return {
        role: "assistant",
        content: [{ type: "text", text: r.content }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: zeroUsage(),
        stopReason: "stop",
        timestamp: ts,
      } satisfies AssistantMessage;
    }
    return { role: "user", content: r.content, timestamp: ts } satisfies UserMessage;
  });
}

function zeroUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/// Compact, log-safe summary of a write tool's args — counts and short scalars
/// only, never full row payloads or notes.
function summarizeArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  if (Array.isArray(args.transactionIds)) {
    parts.push(`ids=${args.transactionIds.length}`);
  }
  if (typeof args.id === "string") parts.push(`id=${args.id}`);
  if (typeof args.categoryName === "string") parts.push(`category=${args.categoryName}`);
  if (typeof args.accountName === "string") parts.push(`account=${args.accountName}`);
  if (typeof args.amountCents === "number") parts.push(`amountCents=${args.amountCents}`);
  if (typeof args.isIncome === "boolean") parts.push(`isIncome=${args.isIncome}`);
  if (typeof args.date === "string") parts.push(`date=${args.date}`);
  return parts.join(" ") || "(no args)";
}

function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
