import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test } from "vitest";

import * as schema from "../db/schema.ts";
import type { Db } from "../db/index.ts";
import { runRules } from "./engine.ts";
import { learnCategory } from "./learn.ts";

function makeDb(): Db {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as Db;
}

let txSeq = 0;
function addTxn(
  db: Db,
  o: {
    payeeId?: string | null;
    payeeName?: string | null;
    categoryId?: string | null;
    date?: string;
    parentId?: string | null;
    isGroupParent?: boolean;
  },
) {
  const at = Date.now() + txSeq;
  db.insert(schema.transactions)
    .values({
      id: `tx-${txSeq++}`,
      accountId: "acct-1",
      categoryId: o.categoryId ?? null,
      payeeId: o.payeeId ?? null,
      payeeName: o.payeeName ?? null,
      amountCents: -100,
      date: o.date ?? "2026-07-01",
      parentId: o.parentId ?? null,
      isGroupParent: o.isGroupParent ?? false,
      createdAt: at,
      updatedAt: at,
    })
    .run();
}

function addPayee(
  db: Db,
  o: { id: string; name: string; learnCategories?: boolean },
) {
  db.insert(schema.payees)
    .values({
      id: o.id,
      name: o.name,
      learnCategories: o.learnCategories ?? true,
      updatedAt: Date.now(),
    })
    .run();
}

/** All learned rules currently in the table (parsed for convenience). */
function learnedRules(db: Db) {
  return db
    .select()
    .from(schema.rules)
    .where(eq(schema.rules.triggerType, "learned"))
    .all()
    .map((r) => ({
      ...r,
      trigger: JSON.parse(r.triggerPayload) as {
        conditions: { field: string; op: string; value: unknown }[];
      },
      action: JSON.parse(r.actionPayload) as {
        actions: { type: string; value: unknown }[];
      },
    }));
}

let db: Db;
beforeEach(() => {
  txSeq = 0;
  db = makeDb();
});

describe("learnCategory", () => {
  test("3-of-5 threshold: learns a rule when ≥3 recent txns agree", () => {
    // 3 in cat-X, 2 in cat-Y among the last 5.
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-Y" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-Y" });

    learnCategory(db, { payeeName: "Zomato", categoryId: "cat-X" });

    const rules = learnedRules(db);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.trigger.conditions).toEqual([
      { field: "payee", op: "is", value: "zomato" },
    ]);
    expect(rules[0]!.action.actions).toEqual([
      { type: "set_category", value: "cat-X" },
    ]);
  });

  test("below threshold: only 2 agree → no rule", () => {
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-Y" });

    learnCategory(db, { payeeName: "Zomato", categoryId: "cat-X" });

    expect(learnedRules(db)).toHaveLength(0);
  });

  test("opt-out: payee.learnCategories=false → no rule even at ≥3", () => {
    addPayee(db, { id: "p-1", name: "Zomato", learnCategories: false });
    addTxn(db, { payeeId: "p-1", payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeId: "p-1", payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeId: "p-1", payeeName: "Zomato", categoryId: "cat-X" });

    learnCategory(db, { payeeId: "p-1", payeeName: "Zomato", categoryId: "cat-X" });

    expect(learnedRules(db)).toHaveLength(0);
  });

  test("update-in-place: habit change repoints the existing rule, no duplicate", () => {
    // First habit: cat-X.
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    learnCategory(db, { payeeName: "Zomato", categoryId: "cat-X" });

    let rules = learnedRules(db);
    expect(rules).toHaveLength(1);
    const originalId = rules[0]!.id;

    // Habit shifts to cat-Y: three newer cat-Y txns now dominate the last 5.
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-Y" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-Y" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-Y" });
    learnCategory(db, { payeeName: "Zomato", categoryId: "cat-Y" });

    rules = learnedRules(db);
    expect(rules).toHaveLength(1); // still one row
    expect(rules[0]!.id).toBe(originalId); // same row, updated in place
    expect(rules[0]!.action.actions).toEqual([
      { type: "set_category", value: "cat-Y" },
    ]);
  });

  test("learned rule then applies via runRules on a fresh txn", () => {
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    learnCategory(db, { payeeName: "Zomato", categoryId: "cat-X" });

    // A brand-new, uncategorized txn for the same payee gets categorized.
    const out = runRules(db, { payeeName: "Zomato", categoryId: null });
    expect(out.categoryId).toBe("cat-X");
  });

  test("FIX 14: name-only learn honors the opt-out via normalized-name resolution", () => {
    // Agent bookings call learnCategory with a payeeName only (no id). The
    // opt-out must still be honored by resolving the payee by name.
    addPayee(db, { id: "p-1", name: "Zomato", learnCategories: false });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });

    learnCategory(db, { payeeName: "Zomato", categoryId: "cat-X" });

    expect(learnedRules(db)).toHaveLength(0);
  });

  test("FIX 14: name-only opt-out is conservative when names collide", () => {
    // Two payees share the name; ANY opted-out one skips learning.
    addPayee(db, { id: "p-a", name: "Zomato", learnCategories: true });
    addPayee(db, { id: "p-b", name: "zomato", learnCategories: false });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });

    learnCategory(db, { payeeName: "Zomato", categoryId: "cat-X" });

    expect(learnedRules(db)).toHaveLength(0);
  });

  test("FIX 15: learned rule uses the canonical payee name, not a caller variant", () => {
    addPayee(db, { id: "p-amz", name: "Amazon" });
    // History linked by payeeId, categorized to cat-X.
    addTxn(db, { payeeId: "p-amz", payeeName: "Amazon", categoryId: "cat-X" });
    addTxn(db, { payeeId: "p-amz", payeeName: "Amazon", categoryId: "cat-X" });
    addTxn(db, { payeeId: "p-amz", payeeName: "Amazon", categoryId: "cat-X" });

    // Caller passes a raw variant ("AMZN"); the rule must use canonical "amazon".
    learnCategory(db, { payeeId: "p-amz", payeeName: "AMZN", categoryId: "cat-X" });

    const rules = learnedRules(db);
    expect(rules).toHaveLength(1);
    expect(rules[0]!.trigger.conditions).toEqual([
      { field: "payee", op: "is", value: "amazon" },
    ]);

    // A fresh "Amazon" draft matches the canonical learned rule.
    const out = runRules(db, { payeeName: "Amazon", categoryId: null });
    expect(out.categoryId).toBe("cat-X");
  });

  test("opt-out and user rules coexist: learning does not clobber a user rule", () => {
    // A hand-authored user rule for the same payee.
    db.insert(schema.rules)
      .values({
        id: "user-rule-1",
        name: "user: zomato",
        enabled: true,
        stage: "main",
        priority: 100,
        triggerType: "user",
        triggerPayload: JSON.stringify({
          match: "all",
          conditions: [{ field: "payee", op: "is", value: "zomato" }],
        }),
        actionPayload: JSON.stringify({
          actions: [{ type: "set_category", value: "cat-user" }],
        }),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();

    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    addTxn(db, { payeeName: "Zomato", categoryId: "cat-X" });
    learnCategory(db, { payeeName: "Zomato", categoryId: "cat-X" });

    // User rule untouched; a separate learned rule was added.
    const userRule = db
      .select()
      .from(schema.rules)
      .where(eq(schema.rules.id, "user-rule-1"))
      .get()!;
    expect(JSON.parse(userRule.actionPayload).actions).toEqual([
      { type: "set_category", value: "cat-user" },
    ]);
    expect(learnedRules(db)).toHaveLength(1);
  });
});
