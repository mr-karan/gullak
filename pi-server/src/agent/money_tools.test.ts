import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, test } from "vitest";

// Tool-level tests: drive the real read-only money-manager SQL tools directly via
// runAskTool against a seeded in-memory DB, so the numbers the tools return are
// the numbers we assert. The engine-level "these tools are offered to the model"
// and context-breadcrumb coverage lives in pi/engine.test.ts.

import * as schema from "../db/schema.ts";
import { runAskTool } from "./ask_tools.ts";

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
