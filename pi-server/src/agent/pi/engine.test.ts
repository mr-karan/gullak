import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, expect, test, vi } from "vitest";

import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type Context,
  type Message,
  type Model,
} from "@earendil-works/pi-ai";

// The cheap log path (handleLog → parseWhatsappExpenses) still reaches the model
// through llm/client's chatJson. Stub that single seam so the cheap-path test can
// book a transaction without a real model. The pi engine itself talks to a faux
// pi-ai provider, not this module.
vi.mock("../../llm/client.ts", async () => {
  const actual =
    await vi.importActual<typeof import("../../llm/client.ts")>("../../llm/client.ts");
  return { ...actual, chatJson: vi.fn() };
});

import type { AppConfig } from "../../config.ts";
import * as schema from "../../db/schema.ts";
import { chatJson } from "../../llm/client.ts";
import { dispatchMessage } from "../agent.ts";
import type { PiModelDeps } from "./provider.ts";
import { handlePiMessage, streamPiMessage, type PiUiEvent } from "./engine.ts";

const mockChatJson = vi.mocked(chatJson);
const at = 1_700_000_000_000;

const config = {
  ai: { enabled: true },
  defaultCurrency: "INR",
} as unknown as AppConfig;

function seed() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.insert(schema.accounts)
    .values({ id: "a1", name: "HDFC", openingBalanceCents: 0, createdAt: at, updatedAt: at })
    .run();
  db.insert(schema.categories)
    .values({ id: "c-food", name: "Food", groupId: "g1", updatedAt: at })
    .run();
  db.insert(schema.categories)
    .values({ id: "c-gro", name: "Groceries", groupId: "g1", updatedAt: at })
    .run();
  db.insert(schema.transactions)
    .values({ id: "t1", accountId: "a1", amountCents: -500_00, date: "2026-07-01", payeeName: "Swiggy", createdAt: at, updatedAt: at })
    .run();
  db.insert(schema.transactions)
    .values({ id: "t2", accountId: "a1", amountCents: -300_00, date: "2026-07-02", payeeName: "Zomato", createdAt: at, updatedAt: at })
    .run();
  return db;
}

/// A faux pi-ai provider + a Models collection wrapping it, ready to inject as
/// the engine's `deps`. `setResponses` scripts the assistant turns.
function makeDeps() {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const model = faux.getModel() as Model<"openai-completions">;
  const deps: PiModelDeps = { models, model };
  return { faux, deps };
}

beforeEach(() => {
  mockChatJson.mockReset();
});

test("ask flow: model calls summary, reply is the sanitized text, nothing mutated", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("summary", {})]),
    fauxAssistantMessage("You spent ₹800 this month."),
  ]);

  const res = await handlePiMessage(
    db,
    config,
    { text: "how much did I spend this month?", source: "web" },
    deps,
  );

  expect(res.reply).toBe("You spent ₹800 this month.");
  expect(res.tool).toBe("summary");
  expect(res.actions).toBeUndefined();

  // No rows mutated by a read tool.
  expect(db.select().from(schema.transactions).where(eq(schema.transactions.id, "t1")).get()!.categoryId).toBeNull();
  expect(db.select().from(schema.transactions).all()).toHaveLength(2);
});

test("advisory flow: 'Where can I cut back?' routes through pi, not the canned noop", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  const answer = "Your Swiggy and Zomato orders are the bulk this month.";
  faux.setResponses([fauxAssistantMessage(answer)]);

  const res = await dispatchMessage(
    db,
    config,
    { text: "Where can I cut back?", source: "web" },
    deps,
  );

  expect(res.reply).toBe(answer);
  // Not the deterministic greeting/noop ack.
  expect(res.reply).not.toContain("Send an amount like");
});

test("write flow: categorize_transactions actually recategorizes + change-logs + returns an action", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  faux.setResponses([
    fauxAssistantMessage([
      fauxToolCall("categorize_transactions", {
        transactionIds: ["t1", "t2"],
        categoryName: "Food",
      }),
    ]),
    fauxAssistantMessage("Done — recategorized 2 to Food."),
  ]);

  const res = await handlePiMessage(
    db,
    config,
    {
      text: "recategorize these to Food",
      source: "web",
      selection: { transactionIds: ["t1", "t2"] },
    },
    deps,
  );

  // Rows actually changed.
  expect(db.select().from(schema.transactions).where(eq(schema.transactions.id, "t1")).get()!.categoryId).toBe("c-food");
  expect(db.select().from(schema.transactions).where(eq(schema.transactions.id, "t2")).get()!.categoryId).toBe("c-food");

  // Change-log rows written so other clients pull the updates.
  const upserts = db
    .select()
    .from(schema.changeLog)
    .where(eq(schema.changeLog.op, "upsert"))
    .all();
  expect(upserts.some((c) => c.resourceId === "t1")).toBe(true);
  expect(upserts.some((c) => c.resourceId === "t2")).toBe(true);

  // Structured action sidecar for the UI (with Undo).
  expect(res.tool).toBe("categorize_transactions");
  expect(res.actions).toHaveLength(1);
  expect(res.actions![0]!.kind).toBe("write_result");
  expect(res.actions![0]!.affectedIds.sort()).toEqual(["t1", "t2"]);
  expect(res.actions![0]!.undo?.tool).toBe("restore_categories");
});

test("guardrail: delete_transactions with 51 ids is blocked, rows untouched", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  const ids = Array.from({ length: 51 }, (_, i) => `t1`); // duplicates dedupe to t1, but 51 raw ids trip the cap
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("delete_transactions", { transactionIds: ids })]),
    fauxAssistantMessage("I can't delete that many at once."),
  ]);

  const res = await handlePiMessage(
    db,
    config,
    { text: "delete everything", source: "web" },
    deps,
  );

  // Nothing was deleted and no write action was produced.
  expect(db.select().from(schema.transactions).all()).toHaveLength(2);
  expect(res.actions).toBeUndefined();
  const deletes = db
    .select()
    .from(schema.changeLog)
    .where(eq(schema.changeLog.op, "delete"))
    .all();
  expect(deletes).toHaveLength(0);
});

test("cheap path: 'spent 480 groceries' books via handleLog, bypassing pi (engine=pi)", async () => {
  const db = seed();
  const { deps } = makeDeps();
  mockChatJson.mockResolvedValueOnce({
    items: [
      {
        amount_cents: 48000,
        is_income: false,
        payee: "Blinkit",
        category_hint: "Groceries",
        text: "spent 480 groceries",
      },
    ],
  });

  const res = await dispatchMessage(
    db,
    config,
    { text: "spent 480 groceries", source: "web" },
    deps,
  );

  expect(res.queued).toBe(1);
  const booked = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.categoryId, "c-gro"))
    .all();
  expect(booked).toHaveLength(1);
  expect(booked[0]!.amountCents).toBe(-48000);
});

test("cheap path: undo-last hits the deterministic undo, bypassing pi (engine=pi)", async () => {
  const db = seed();
  const { deps } = makeDeps();
  // A fresh chat-booked expense the undo can remove.
  db.insert(schema.transactions)
    .values({
      id: "fresh",
      accountId: "a1",
      amountCents: -100_00,
      date: "2026-07-03",
      payeeName: "Coffee",
      origin: "whatsapp",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .run();

  const res = await dispatchMessage(
    db,
    config,
    { text: "ok delete the last one", source: "web" },
    deps,
  );

  expect(res.reply.toLowerCase()).toContain("deleted");
  expect(db.select().from(schema.transactions).where(eq(schema.transactions.id, "fresh")).get()).toBeUndefined();
});

test("streamPiMessage yields delta events and a final AgentResponse", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  faux.setResponses([fauxAssistantMessage("Streaming reply here.")]);

  const gen = streamPiMessage(
    db,
    config,
    { text: "say hello", source: "web" },
    deps,
  );

  const events: PiUiEvent[] = [];
  let result;
  while (true) {
    const next = await gen.next();
    if (next.done) {
      result = next.value;
      break;
    }
    events.push(next.value);
  }

  expect(events.some((e) => e.type === "delta")).toBe(true);
  const streamedText = events
    .filter((e): e is Extract<PiUiEvent, { type: "delta" }> => e.type === "delta")
    .map((e) => e.text)
    .join("");
  expect(streamedText).toContain("Streaming reply");
  expect(result!.reply).toBe("Streaming reply here.");
});

test("a committed write is never re-run via legacy fallback when the run dies afterwards", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  // Script ONLY the write tool call. The follow-up LLM call (after the tool
  // result) finds no scripted response, so the faux provider rejects — the
  // exact "write committed, then the run died" shape. dispatchMessage must NOT
  // fall back to the legacy flow (which could book the expense a second time).
  faux.setResponses([
    fauxAssistantMessage([
      fauxToolCall("log_transaction", {
        amountCents: 45000,
        payeeName: "Blinkit",
        categoryName: "Food",
        accountName: "HDFC",
      }),
    ]),
  ]);

  const before = db.select().from(schema.transactions).all().length;
  const res = await dispatchMessage(
    db,
    config,
    { text: "add a 450 groceries expense", source: "web" },
    deps,
  );
  const after = db.select().from(schema.transactions).all();

  // Exactly ONE row was booked — no legacy re-run, no duplicate.
  expect(after.length).toBe(before + 1);
  // The degraded-but-honest reply, with the committed action still attached.
  expect(res.reply).toContain("check the register");
  expect(res.actions?.length).toBe(1);
});

// ── ported from the deleted legacy ask/write engine tests ─────────────────────
// The real-SQL tool correctness, "no model configured", classification-shape,
// selection-rendering, and money-tool coverage that used to live in
// ask_agent.test.ts / write_agent.test.ts / money_tools.test.ts moves here, now
// exercised end-to-end through the single pi engine + a faux provider instead of
// the old chatTools loop.

/// The text of the most-recent user message the engine handed the model — i.e.
/// the `firstUser` prompt with its accounts/categories/context/selection lines.
function lastUserText(messages: Message[]): string {
  const u = [...messages].reverse().find((m) => m.role === "user");
  if (!u) return "";
  return typeof u.content === "string"
    ? u.content
    : u.content.map((c) => (c.type === "text" ? c.text : "")).join("");
}

/// Names of the tools offered to the model on a given turn.
function toolNamesOf(context: Context): string[] {
  return (context.tools ?? []).map((t) => t.name);
}

/// A faux response step that echoes the last tool result back as the assistant's
/// text, so a read tool's real SQL output surfaces in `res.reply` for assertion.
function echoToolResult(prefix: string) {
  return (context: Context) => {
    const tr = [...context.messages]
      .reverse()
      .find((m): m is Extract<Message, { role: "toolResult" }> => m.role === "toolResult");
    const text = tr
      ? tr.content.map((c) => (c.type === "text" ? c.text : "")).join("")
      : "";
    return fauxAssistantMessage(`${prefix} ${text}`);
  };
}

/// Seed mirroring the old ask_agent.test.ts: HDFC (₹100 opening), Dining +
/// Groceries, June 2026 spend (₹300 dining + ₹200 groceries) and ₹1000 income.
function seedAsk() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.insert(schema.accounts)
    .values({ id: "a1", name: "HDFC", kind: "checking", openingBalanceCents: 100_00, createdAt: at, updatedAt: at })
    .run();
  db.insert(schema.categories)
    .values({ id: "c-dining", name: "Dining", groupId: "g1", updatedAt: at })
    .run();
  db.insert(schema.categories)
    .values({ id: "c-groc", name: "Groceries", groupId: "g1", updatedAt: at })
    .run();
  const txn = (id: string, cents: number, date: string, categoryId: string | null, payeeName: string | null) =>
    db
      .insert(schema.transactions)
      .values({ id, accountId: "a1", categoryId, payeeName, amountCents: cents, date, origin: "test", createdAt: at, updatedAt: at })
      .run();
  txn("t1", -200_00, "2026-06-05", "c-dining", "Swiggy");
  txn("t2", -100_00, "2026-06-12", "c-dining", "Zomato");
  txn("t3", -200_00, "2026-06-20", "c-groc", "Blinkit");
  txn("t4", 1000_00, "2026-06-01", null, "Salary");
  return db;
}

test("read tool: category_spend returns the correct total for the named category, nothing mutated", async () => {
  const db = seedAsk();
  const { faux, deps } = makeDeps();
  faux.setResponses([
    fauxAssistantMessage([
      fauxToolCall("category_spend", {
        categoryName: "Dining",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
      }),
    ]),
    echoToolResult("You spent that on dining."),
  ]);

  const res = await handlePiMessage(
    db,
    config,
    { text: "how much did I spend on dining in June?", source: "web" },
    deps,
  );

  // ₹200 + ₹100 = ₹300, from the tool's real SQL.
  expect(res.reply).toContain("₹300");
  expect(res.reply).toContain("Dining");
  expect(res.tool).toBe("category_spend");
  // Reads must not mutate: the 4 seeded rows are untouched.
  expect(db.select().from(schema.transactions).all()).toHaveLength(4);
});

test("read tool: account_balances computes opening balance + net of all txns", async () => {
  const db = seedAsk();
  const { faux, deps } = makeDeps();
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("account_balances", {})]),
    echoToolResult("Balance:"),
  ]);
  const res = await handlePiMessage(
    db,
    config,
    { text: "what's my HDFC balance?", source: "web" },
    deps,
  );
  // 100 opening + (1000 income - 500 spend) = ₹600.
  expect(res.reply).toContain("HDFC");
  expect(res.reply).toContain("₹600");
});

test("read tool: summary returns income, expense, and net for the range", async () => {
  const db = seedAsk();
  const { faux, deps } = makeDeps();
  faux.setResponses([
    fauxAssistantMessage([
      fauxToolCall("summary", { startDate: "2026-06-01", endDate: "2026-06-30" }),
    ]),
    echoToolResult("June:"),
  ]);
  const res = await handlePiMessage(
    db,
    config,
    { text: "how did June look overall?", source: "web" },
    deps,
  );
  expect(res.reply).toContain("income ₹1,000"); // salary
  expect(res.reply).toContain("spent ₹500"); // 200+100+200
  expect(res.reply).toContain("net +₹500"); // 1000 - 500
});

test("read tool: top_payees ranks merchants by spend", async () => {
  const db = seedAsk();
  const { faux, deps } = makeDeps();
  faux.setResponses([
    fauxAssistantMessage([
      fauxToolCall("top_payees", { startDate: "2026-06-01", endDate: "2026-06-30", limit: 3 }),
    ]),
    echoToolResult("Top:"),
  ]);
  const res = await handlePiMessage(
    db,
    config,
    { text: "top merchants in June?", source: "web" },
    deps,
  );
  // Swiggy (₹200) and Blinkit (₹200) are the biggest; both must appear.
  expect(res.reply).toContain("Swiggy");
  expect(res.reply).toContain("Blinkit");
  expect(res.reply).toContain("₹200");
});

test("with no model configured, an ask answers honestly without any model call", async () => {
  const db = seedAsk();
  const noAi = { ai: { enabled: false }, defaultCurrency: "INR" } as unknown as AppConfig;
  // No deps: the ai-disabled short-circuit fires before the engine builds a model.
  const res = await dispatchMessage(db, noAi, {
    text: "how much did I spend this month?",
    source: "web",
  });
  expect(res.reply.toLowerCase()).toContain("isn't configured");
});

test("a question-shaped edit still reaches the write tools (they are always offered)", async () => {
  const db = seedAsk();
  const { faux, deps } = makeDeps();
  let offered: string[] = [];
  faux.setResponses([
    (context: Context) => {
      offered = toolNamesOf(context);
      return fauxAssistantMessage("Found the duplicate — deleted it.");
    },
  ]);

  await dispatchMessage(
    db,
    config,
    { text: "can you delete the duplicate Swiggy charge?", source: "web" },
    deps,
  );

  // The model was handed both the write tools and the read tools it needs to
  // find the row first — gating is prompt-level, not tool-availability-level.
  expect(offered).toContain("delete_transactions");
  expect(offered).toContain("search_transactions");
});

test("selection is rendered into the model turn as concrete, actionable context", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  let seenUser = "";
  let offered: string[] = [];
  faux.setResponses([
    (context: Context) => {
      seenUser = lastUserText(context.messages);
      offered = toolNamesOf(context);
      return fauxAssistantMessage("Done.");
    },
  ]);

  await handlePiMessage(
    db,
    config,
    {
      text: "recategorize these to Food",
      source: "web",
      selection: { transactionIds: ["t1", "t2"] },
    },
    deps,
  );

  expect(seenUser).toContain("The user has selected these 2 transactions");
  expect(seenUser).toContain("id=t1");
  expect(seenUser).toContain("id=t2");
  // Both registries are offered on every turn.
  expect(offered).toContain("categorize_transactions");
  expect(offered).toContain("summary");
});

test("write flow: edit_transaction mutates and surfaces an edit action with undo", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  faux.setResponses([
    fauxAssistantMessage([
      fauxToolCall("edit_transaction", { id: "t1", amountCents: 156_000 }),
    ]),
    fauxAssistantMessage("Changed it."),
  ]);

  const res = await handlePiMessage(
    db,
    config,
    { text: "change the Swiggy one to 1560", source: "web" },
    deps,
  );

  expect(
    db.select().from(schema.transactions).where(eq(schema.transactions.id, "t1")).get()!.amountCents,
  ).toBe(-156_000);
  expect(res.actions).toHaveLength(1);
  expect(res.actions![0]!.tool).toBe("edit_transaction");
  expect(res.actions![0]!.summary).toContain("₹1,560.00");
  expect(res.actions![0]!.undo?.tool).toBe("edit_transaction");
});

// ── money-manager tools over the pi engine (ported from money_tools.test.ts) ──

/// Seed mirroring money_tools.test.ts: goals + holdings + desires + last-full-
/// month income/expense, so net_worth / afford / goal tools have real data.
function lastFullMonthDate(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-15`;
}

function seedMoney() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const now = Date.now();
  db.insert(schema.accounts)
    .values({ id: "a1", name: "HDFC", openingBalanceCents: 1000_00, createdAt: now, updatedAt: now })
    .run();
  db.insert(schema.goals)
    .values({ id: "g-bmw", name: "BMW", emoji: "🚗", targetCents: 1_000_000_00, createdAt: now, updatedAt: now })
    .run();
  db.insert(schema.goals)
    .values({ id: "g-ret", name: "Retire early", targetCents: 5_000_000_00, createdAt: now, updatedAt: now })
    .run();
  const hold = (id: string, kind: "equity" | "mutual_fund", goalId: string | null, investedCents: number, currentCents: number, stale = false) =>
    db
      .insert(schema.holdings)
      .values({ id, isin: id, symbol: id, name: id, kind, quantity: 1, avgPrice: 1, lastPrice: 1, investedCents, currentCents, goalId, stale, importedAt: now, createdAt: now, updatedAt: now })
      .run();
  hold("TATA", "equity", "g-bmw", 200_000_00, 300_000_00);
  hold("PPFAS", "mutual_fund", "g-bmw", 100_000_00, 150_000_00);
  hold("OLD", "equity", null, 999_00, 999_00, true); // stale — ignored
  db.insert(schema.desires)
    .values({ id: "d1", person: "karan", title: "Vinyl player", estCostCents: 50_000_00, why: "music", status: "dreaming", createdAt: now, updatedAt: now })
    .run();
  const d = lastFullMonthDate();
  db.insert(schema.transactions)
    .values({ id: "in", accountId: "a1", amountCents: 200_000_00, date: d, createdAt: now, updatedAt: now })
    .run();
  db.insert(schema.transactions)
    .values({ id: "ex", accountId: "a1", amountCents: -50_000_00, date: d, createdAt: now, updatedAt: now })
    .run();
  return db;
}

test("money tools are offered to the model and net_worth answers with the total", async () => {
  const db = seedMoney();
  const { faux, deps } = makeDeps();
  let offered: string[] = [];
  faux.setResponses([
    (context: Context) => {
      offered = toolNamesOf(context);
      return fauxAssistantMessage([fauxToolCall("net_worth", {})]);
    },
    echoToolResult("Net worth:"),
  ]);

  const res = await handlePiMessage(
    db,
    config,
    { text: "what are we worth?", source: "web" },
    deps,
  );

  for (const t of ["portfolio_summary", "goal_progress", "list_desires", "afford_check", "net_worth"]) {
    expect(offered).toContain(t);
  }
  // cash ₹1,51,000 + invested ₹4,50,000 = ₹6,01,000.
  expect(res.reply).toContain("₹6,01,000");
});

test("context breadcrumb is appended to the model turn as advisory prose", async () => {
  const db = seedMoney();
  const { faux, deps } = makeDeps();
  let seenUser = "";
  faux.setResponses([
    (context: Context) => {
      seenUser = lastUserText(context.messages);
      return fauxAssistantMessage("ok");
    },
  ]);
  await handlePiMessage(
    db,
    config,
    { text: "how are my goals?", source: "web", context: { view: "goals", goalId: "g-bmw" } },
    deps,
  );
  expect(seenUser).toContain('User is currently viewing: {"view":"goals","goalId":"g-bmw"}');
});

test("invalid/oversized context is silently dropped", async () => {
  const db = seedMoney();
  const { faux, deps } = makeDeps();
  let seenUser = "";
  faux.setResponses([
    (context: Context) => {
      seenUser = lastUserText(context.messages);
      return fauxAssistantMessage("ok");
    },
  ]);
  const big: Record<string, string> = {};
  for (let i = 0; i < 200; i++) big[`k${i}`] = "xxxxxxxx";
  await handlePiMessage(
    db,
    config,
    { text: "how are my goals?", source: "web", context: big },
    deps,
  );
  expect(seenUser).not.toContain("User is currently viewing");
});
