import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, expect, test, vi } from "vitest";

// Drive the real read-only SQL tools; stub only the model calls (as in
// ask_agent.test.ts). runTool below runs against a seeded in-memory DB so the
// numbers the model would see are the numbers we assert.
vi.mock("../llm/client.ts", async () => {
  const actual =
    await vi.importActual<typeof import("../llm/client.ts")>("../llm/client.ts");
  return { ...actual, chatJson: vi.fn(), chatTools: vi.fn() };
});

import type { AppConfig } from "../config.ts";
import * as schema from "../db/schema.ts";
import { chatJson, chatTools, type ChatToolCall } from "../llm/client.ts";
import { handleMessage } from "./agent.ts";
import { runAskTool } from "./ask_tools.ts";

const mockChatTools = vi.mocked(chatTools);
const mockChatJson = vi.mocked(chatJson);

/** A YYYY-MM-DD date inside the previous (last full) calendar month. */
function lastFullMonthDate(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 15);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-15`;
}

function seed() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const now = Date.now();

  db.insert(schema.accounts)
    .values({ id: "a1", name: "HDFC", openingBalanceCents: 1000_00, createdAt: now, updatedAt: now })
    .run();

  // Goals: BMW (mapped holdings), Retire (unfunded).
  db.insert(schema.goals)
    .values({ id: "g-bmw", name: "BMW", emoji: "🚗", targetCents: 1_000_000_00, createdAt: now, updatedAt: now })
    .run();
  db.insert(schema.goals)
    .values({ id: "g-ret", name: "Retire early", targetCents: 5_000_000_00, createdAt: now, updatedAt: now })
    .run();

  const hold = (
    id: string,
    kind: "equity" | "mutual_fund",
    goalId: string | null,
    investedCents: number,
    currentCents: number,
    stale = false,
  ) =>
    db
      .insert(schema.holdings)
      .values({
        id,
        isin: id,
        symbol: id,
        name: id,
        kind,
        quantity: 1,
        avgPrice: 1,
        lastPrice: 1,
        investedCents,
        currentCents,
        goalId,
        stale,
        importedAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .run();
  hold("TATA", "equity", "g-bmw", 200_000_00, 300_000_00);
  hold("PPFAS", "mutual_fund", "g-bmw", 100_000_00, 150_000_00);
  hold("OLD", "equity", null, 999_00, 999_00, true); // stale — must be ignored

  // Desires.
  db.insert(schema.desires)
    .values({ id: "d1", person: "karan", title: "Vinyl player", estCostCents: 50_000_00, why: "music", status: "dreaming", createdAt: now, updatedAt: now })
    .run();
  db.insert(schema.desires)
    .values({ id: "d2", person: "wife", title: "New phone", estCostCents: 80_000_00, status: "yes", decidedAt: now, createdAt: now, updatedAt: now })
    .run();

  // Transactions in the last full month: +₹2,00,000 income, -₹50,000 expense
  // → net +₹1,50,000 that month → surplus/month = ₹50,000 over the 3-month window.
  const d = lastFullMonthDate();
  db.insert(schema.transactions)
    .values({ id: "in", accountId: "a1", amountCents: 200_000_00, date: d, createdAt: now, updatedAt: now })
    .run();
  db.insert(schema.transactions)
    .values({ id: "ex", accountId: "a1", amountCents: -50_000_00, date: d, createdAt: now, updatedAt: now })
    .run();
  return db;
}

const config = { ai: { enabled: true }, defaultCurrency: "INR" } as unknown as AppConfig;

beforeEach(() => {
  mockChatTools.mockReset();
  mockChatJson.mockReset();
  mockChatJson.mockResolvedValue({ mode: "ask", confidence: 0.9 });
});

test("portfolio_summary: totals, P&L, equity/MF split over non-stale rows", () => {
  const db = seed();
  const r = runAskTool(db, { tool: "portfolio_summary", params: {} });
  // current 300k+150k = ₹4,50,000; invested 200k+100k = ₹3,00,000; P&L +₹1,50,000.
  expect(r.formatted).toContain("₹4,50,000");
  expect(r.formatted).toContain("₹3,00,000");
  expect(r.formatted).toContain("+₹1,50,000");
  expect(r.formatted).toContain("TATA");
  // The stale holding is excluded.
  expect(r.formatted).not.toContain("OLD");
  expect(r.resolved?.currentCents).toBe(450_000_00);
});

test("goal_progress: per-goal current, target, and pct; stale excluded", () => {
  const db = seed();
  const r = runAskTool(db, { tool: "goal_progress", params: {} });
  expect(r.formatted).toContain("BMW");
  expect(r.formatted).toContain("₹4,50,000"); // BMW current
  expect(r.formatted).toContain("₹10,00,000"); // BMW target
  expect(r.formatted).toContain("45%"); // 450000 / 1000000
  expect(r.formatted).toContain("Retire early");
});

test("list_desires: filters by person and shows cost + status", () => {
  const db = seed();
  const all = runAskTool(db, { tool: "list_desires", params: {} });
  expect(all.formatted).toContain("Vinyl player");
  expect(all.formatted).toContain("New phone");
  const karan = runAskTool(db, { tool: "list_desires", params: { person: "karan" } });
  expect(karan.formatted).toContain("Vinyl player");
  expect(karan.formatted).not.toContain("New phone");
});

test("afford_check by amount: surplus math and months-of-surplus, no verdict", () => {
  const db = seed();
  const r = runAskTool(db, { tool: "afford_check", params: { amountCents: 100_000_00 } });
  expect(r.resolved?.surplusPerMonthCents).toBe(50_000_00); // 150000/3
  expect(r.formatted).toContain("₹50,000"); // monthly surplus
  expect(r.formatted).toContain("2 months of surplus"); // 100000 / 50000
  // No moralising / verdict language.
  expect(r.formatted.toLowerCase()).not.toMatch(/should|don't|avoid|too expensive/);
});

test("afford_check by desire name looks up the estimated cost", () => {
  const db = seed();
  const r = runAskTool(db, { tool: "afford_check", params: { desireName: "vinyl" } });
  expect(r.resolved?.amountCents).toBe(50_000_00);
  expect(r.formatted).toContain("Vinyl player");
});

test("net_worth: cash + invested (non-stale), with import date", () => {
  const db = seed();
  const r = runAskTool(db, { tool: "net_worth", params: {} });
  // cash = 1000 opening + (200000 - 50000) activity = ₹1,51,000.
  expect(r.resolved?.cashCents).toBe(151_000_00);
  expect(r.resolved?.investedCurrentCents).toBe(450_000_00);
  expect(r.resolved?.totalCents).toBe(601_000_00);
});

test("all new tools are read-only (no mutation to any seeded table)", () => {
  const db = seed();
  for (const tool of ["portfolio_summary", "goal_progress", "list_desires", "net_worth"] as const) {
    runAskTool(db, { tool, params: {} });
  }
  runAskTool(db, { tool: "afford_check", params: { amountCents: 1 } });
  expect(db.select().from(schema.holdings).all()).toHaveLength(3);
  expect(db.select().from(schema.desires).all()).toHaveLength(2);
  expect(db.select().from(schema.goals).all()).toHaveLength(2);
});

test("the new tools are offered to the model in the ask path", async () => {
  const db = seed();
  mockChatTools.mockImplementation(async (_c, opts) => {
    return opts.runTool({ id: "c", name: "net_worth", arguments: "{}" });
  });
  const res = await handleMessage(db, config, { text: "what are we worth?", source: "web" });
  const toolNames = mockChatTools.mock.calls[0]![1].tools.map((t) => t.name);
  for (const t of ["portfolio_summary", "goal_progress", "list_desires", "afford_check", "net_worth"]) {
    expect(toolNames).toContain(t);
  }
  expect(res.reply).toContain("₹6,01,000"); // net worth total
});

test("context breadcrumb is appended to the model turn as advisory prose", async () => {
  const db = seed();
  let seenUser = "";
  mockChatTools.mockImplementation(async (_c, opts) => {
    seenUser = opts.user;
    return "ok";
  });
  await handleMessage(db, config, {
    text: "how are my goals?",
    source: "web",
    context: { view: "goals", goalId: "g-bmw" },
  });
  expect(seenUser).toContain('User is currently viewing: {"view":"goals","goalId":"g-bmw"}');
});

test("invalid/oversized context is silently dropped", async () => {
  const db = seed();
  let seenUser = "";
  mockChatTools.mockImplementation(async (_c, opts) => {
    seenUser = opts.user;
    return "ok";
  });
  // Oversized: a >1KB serialized object.
  const big: Record<string, string> = {};
  for (let i = 0; i < 200; i++) big[`k${i}`] = "xxxxxxxx";
  await handleMessage(db, config, { text: "how are my goals?", source: "web", context: big });
  expect(seenUser).not.toContain("User is currently viewing");
});
