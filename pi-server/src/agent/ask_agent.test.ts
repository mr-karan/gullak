import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, expect, test, vi } from "vitest";

// The ask/answer path goes through chatTools (the tool-calling loop). We stub
// chatTools so no real model is needed, but crucially we DRIVE the supplied
// runTool callback ourselves — that exercises the real read-only SQL tools
// against a seeded in-memory DB and proves the numbers are correct. chatJson is
// also stubbed because classify() may fall back to it.
vi.mock("../llm/client.ts", async () => {
  const actual =
    await vi.importActual<typeof import("../llm/client.ts")>("../llm/client.ts");
  return { ...actual, chatJson: vi.fn(), chatTools: vi.fn() };
});

import type { AppConfig } from "../config.ts";
import * as schema from "../db/schema.ts";
import { chatJson, chatTools, type ChatToolCall } from "../llm/client.ts";
import { handleMessage } from "./agent.ts";

const mockChatTools = vi.mocked(chatTools);
const mockChatJson = vi.mocked(chatJson);

function makeDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const now = Date.now();
  db.insert(schema.accounts)
    .values({
      id: "a1",
      name: "HDFC",
      kind: "checking",
      openingBalanceCents: 100_00, // ₹100 opening
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(schema.categories)
    .values({ id: "c-dining", name: "Dining", groupId: "g1", updatedAt: now })
    .run();
  db.insert(schema.categories)
    .values({ id: "c-groc", name: "Groceries", groupId: "g1", updatedAt: now })
    .run();
  // June 2026 spend: ₹300 dining (2 txns) + ₹200 groceries; ₹1000 income.
  const txn = (
    id: string,
    cents: number,
    date: string,
    categoryId: string | null,
    payeeName: string | null,
  ) =>
    db
      .insert(schema.transactions)
      .values({
        id,
        accountId: "a1",
        categoryId,
        payeeName,
        amountCents: cents,
        date,
        origin: "test",
        createdAt: now,
        updatedAt: now,
      })
      .run();
  txn("t1", -200_00, "2026-06-05", "c-dining", "Swiggy");
  txn("t2", -100_00, "2026-06-12", "c-dining", "Zomato");
  txn("t3", -200_00, "2026-06-20", "c-groc", "Blinkit");
  txn("t4", 1000_00, "2026-06-01", null, "Salary");
  return db;
}

const config = {
  ai: { enabled: true },
  defaultCurrency: "INR",
} as unknown as AppConfig;

beforeEach(() => {
  mockChatTools.mockReset();
  mockChatJson.mockReset();
  // classify() falls back to chatJson for prompts its deterministic regex
  // doesn't catch; steer those to the ask path so every test here exercises
  // the tool-calling answer loop.
  mockChatJson.mockResolvedValue({ mode: "ask", confidence: 0.9 });
});

test("a category-spend question drives the category_spend tool with the named category and returns the correct total", async () => {
  const db = makeDb();
  const seen: ChatToolCall[] = [];

  // Simulate the model deciding to call category_spend(Dining, June 2026),
  // then answering in prose using the tool's returned text.
  mockChatTools.mockImplementation(async (_config, opts) => {
    const call: ChatToolCall = {
      id: "call_1",
      name: "category_spend",
      arguments: JSON.stringify({
        categoryName: "Dining",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
      }),
    };
    seen.push(call);
    const toolResult = await opts.runTool(call);
    return `You spent that on dining. ${toolResult}`;
  });

  const res = await handleMessage(db, config, {
    text: "how much did I spend on dining in June?",
    source: "web",
  });

  // The model was handed the read-only tool set...
  expect(mockChatTools).toHaveBeenCalledTimes(1);
  const toolNames = mockChatTools.mock.calls[0]![1].tools.map((t) => t.name);
  expect(toolNames).toContain("category_spend");
  expect(toolNames).toContain("summary");
  expect(toolNames).toContain("account_balances");
  // ...and drove the category_spend tool for the named category.
  expect(seen[0]!.name).toBe("category_spend");
  // The tool returned the correct number (₹200 + ₹100 = ₹300) — reads only.
  expect(res.reply).toContain("₹300");
  expect(res.reply).toContain("Dining");
  expect(res.tool).toBe("category_spend");
  // Reads must not mutate: the 4 seeded rows are untouched.
  expect(db.select().from(schema.transactions).all()).toHaveLength(4);
});

test("account_balances tool computes opening balance + net of all txns", async () => {
  const db = makeDb();
  let toolText = "";
  mockChatTools.mockImplementation(async (_config, opts) => {
    toolText = await opts.runTool({
      id: "c",
      name: "account_balances",
      arguments: "{}",
    });
    return toolText;
  });

  const res = await handleMessage(db, config, {
    text: "what's my HDFC balance?",
    source: "web",
  });
  // 100 opening + (1000 income - 500 spend) = ₹600.
  expect(res.reply).toContain("HDFC");
  expect(res.reply).toContain("₹600");
});

test("summary tool returns income, expense, and net for the range", async () => {
  const db = makeDb();
  mockChatTools.mockImplementation(async (_config, opts) =>
    opts.runTool({
      id: "c",
      name: "summary",
      arguments: JSON.stringify({
        startDate: "2026-06-01",
        endDate: "2026-06-30",
      }),
    }),
  );
  const res = await handleMessage(db, config, {
    text: "how did June look overall?",
    source: "web",
  });
  expect(res.reply).toContain("income ₹1,000"); // salary
  expect(res.reply).toContain("spent ₹500"); // 200+100+200
  expect(res.reply).toContain("net +₹500"); // 1000 - 500
});

test("top_payees ranks merchants by spend", async () => {
  const db = makeDb();
  mockChatTools.mockImplementation(async (_config, opts) =>
    opts.runTool({
      id: "c",
      name: "top_payees",
      arguments: JSON.stringify({
        startDate: "2026-06-01",
        endDate: "2026-06-30",
        limit: 3,
      }),
    }),
  );
  const res = await handleMessage(db, config, {
    text: "top merchants in June?",
    source: "web",
  });
  // Swiggy (₹200) and Blinkit (₹200) are the biggest; both must appear.
  expect(res.reply).toContain("Swiggy");
  expect(res.reply).toContain("Blinkit");
  expect(res.reply).toContain("₹200");
});

test("an unknown tool name is reported back to the model, not thrown", async () => {
  const db = makeDb();
  let toolResult = "";
  mockChatTools.mockImplementation(async (_config, opts) => {
    toolResult = await opts.runTool({
      id: "c",
      name: "delete_everything",
      arguments: "{}",
    });
    return "handled";
  });
  await handleMessage(db, config, { text: "what did I spend?", source: "web" });
  expect(toolResult.toLowerCase()).toContain("unknown tool");
  // No mutation happened.
  expect(db.select().from(schema.transactions).all()).toHaveLength(4);
});

test("assistant unavailable (LLM 402/503) yields a graceful reply, not a crash", async () => {
  const db = makeDb();
  const { LlmHttpError } = await import("../llm/client.ts");
  mockChatTools.mockRejectedValue(new LlmHttpError(402, "out of credits"));
  const res = await handleMessage(db, config, {
    text: "how much did I spend this month?",
    source: "web",
  });
  expect(res.reply.toLowerCase()).toContain("unavailable");
});

test("with no model configured the ask path answers honestly without calling the model", async () => {
  const db = makeDb();
  const noAi = {
    ai: { enabled: false },
    defaultCurrency: "INR",
  } as unknown as AppConfig;
  const res = await handleMessage(db, noAi, {
    text: "how much did I spend this month?",
    source: "web",
  });
  expect(mockChatTools).not.toHaveBeenCalled();
  expect(res.reply.toLowerCase()).toContain("isn't configured");
});

// --- classification of advisory / question-shaped messages ------------------
// "Where can I cut back?" is one of the app's own suggested prompts, yet the
// old classifier binned it as noop (it has no data keyword) and replied with
// the canned onboarding tip. These pin the fix: question-shaped text that
// isn't a log/edit reaches the ask agent, deterministically (no model call).

test("an advisory question reaches the ask agent, not the noop canned tip", async () => {
  const db = makeDb();
  mockChatTools.mockImplementation(async (_config, opts) => {
    const toolResult = await opts.runTool({
      id: "call_1",
      name: "category_spend",
      arguments: JSON.stringify({
        categoryName: "Dining",
        startDate: "2026-06-01",
        endDate: "2026-06-30",
      }),
    });
    return `Dining is your biggest lever. ${toolResult}`;
  });

  const res = await handleMessage(db, config, {
    text: "Where can I cut back?",
    source: "web",
  });

  // Routed to the tool-calling ask loop — and deterministically, so the
  // classifier never paid for a model call.
  expect(mockChatTools).toHaveBeenCalledTimes(1);
  expect(mockChatJson).not.toHaveBeenCalled();
  expect(res.reply).toContain("Dining is your biggest lever.");
});

test("a greeting PREFIX no longer swallows the message into noop", async () => {
  const db = makeDb();
  // "ok delete the last one" must route to edit_or_delete; with no fresh
  // chat-booked rows the deterministic undo path answers — but the old prefix
  // regex ("ok…") returned the noop canned tip before edit was ever checked.
  const res = await handleMessage(db, config, {
    text: "ok delete the last one",
    source: "web",
  });
  expect(res.reply).toContain("Nothing recent from here to undo");
  expect(mockChatJson).not.toHaveBeenCalled();
});

test("a question-shaped edit still routes to the write loop, not ask", async () => {
  const db = makeDb();
  mockChatTools.mockResolvedValue("Found it — deleted the duplicate.");

  await handleMessage(db, config, {
    text: "can you delete the duplicate Swiggy charge?",
    source: "web",
  });

  // The edit check runs BEFORE the question-shape rule: the model must have
  // been handed the write tools, not just the read set.
  expect(mockChatTools).toHaveBeenCalledTimes(1);
  const toolNames = mockChatTools.mock.calls[0]![1].tools.map((t) => t.name);
  expect(toolNames).toContain("delete_transactions");
  expect(toolNames).toContain("search_transactions");
});
