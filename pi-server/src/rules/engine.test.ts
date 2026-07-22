import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, describe, expect, test } from "vitest";

import * as schema from "../db/schema.ts";
import type { Db } from "../db/index.ts";
import { runRules } from "./engine.ts";
import type { Condition, Stage } from "./conditions.ts";
import type { Action } from "./actions.ts";

function makeDb(): Db {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db as unknown as Db;
}

let seq = 0;
function addRule(
  db: Db,
  o: {
    name?: string;
    enabled?: boolean;
    priority?: number;
    stage?: Stage;
    match?: "all" | "any";
    conditions?: Condition[];
    actions?: Action[];
    createdAt?: number;
  },
) {
  db.insert(schema.rules)
    .values({
      id: `rule-${seq++}`,
      name: o.name ?? "r",
      enabled: o.enabled ?? true,
      stage: o.stage ?? "main",
      priority: o.priority ?? 100,
      triggerType: "user",
      triggerPayload: JSON.stringify({
        match: o.match ?? "all",
        conditions: o.conditions ?? [],
      }),
      actionPayload: JSON.stringify({ actions: o.actions ?? [] }),
      createdAt: o.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    })
    .run();
}

let db: Db;
beforeEach(() => {
  seq = 0;
  db = makeDb();
});

describe("runRules", () => {
  test("applies a matching rule's actions", () => {
    addRule(db, {
      conditions: [{ field: "payee", op: "contains", value: "blink" }],
      actions: [{ type: "set_category", value: "cat-groceries" }],
    });
    const out = runRules(db, { payeeName: "Blinkit", categoryId: null });
    expect(out.categoryId).toBe("cat-groceries");
  });

  test("maps an SMS body to an account", () => {
    addRule(db, {
      conditions: [{ field: "smsBody", op: "contains", value: "Kotak UPI" }],
      actions: [{ type: "set_account", value: "acc-kotak" }],
    });
    expect(runRules(db, { smsBody: "Paid with KOTAK UPI" }).accountId).toBe("acc-kotak");
  });

  test("skips a rule whose conditions don't match", () => {
    addRule(db, {
      conditions: [{ field: "payee", op: "is", value: "zomato" }],
      actions: [{ type: "set_category", value: "cat-food" }],
    });
    const out = runRules(db, { payeeName: "Blinkit", categoryId: "keep" });
    expect(out.categoryId).toBe("keep");
  });

  test("disabled rules are skipped", () => {
    addRule(db, {
      enabled: false,
      conditions: [{ field: "payee", op: "is", value: "blinkit" }],
      actions: [{ type: "set_category", value: "should-not-apply" }],
    });
    const out = runRules(db, { payeeName: "Blinkit", categoryId: "keep" });
    expect(out.categoryId).toBe("keep");
  });

  test("stage order: pre → main → post (later stage wins the same field)", () => {
    // All match; each sets a different payee. Last one applied wins.
    addRule(db, { stage: "post", actions: [{ type: "set_payee", value: "from-post" }] });
    addRule(db, { stage: "pre", actions: [{ type: "set_payee", value: "from-pre" }] });
    addRule(db, { stage: "main", actions: [{ type: "set_payee", value: "from-main" }] });
    const out = runRules(db, { payeeName: "orig" });
    expect(out.payeeName).toBe("from-post");
  });

  test("priority order within a stage: lower priority runs first (later wins)", () => {
    addRule(db, { stage: "main", priority: 200, actions: [{ type: "set_payee", value: "p200" }] });
    addRule(db, { stage: "main", priority: 50, actions: [{ type: "set_payee", value: "p50" }] });
    // p50 runs first, p200 runs last → p200 is the final value.
    const out = runRules(db, { payeeName: "orig" });
    expect(out.payeeName).toBe("p200");
  });

  test("threads txn through multiple rules (categorize, then note)", () => {
    addRule(db, {
      priority: 10,
      conditions: [{ field: "payee", op: "contains", value: "blink" }],
      actions: [{ type: "set_category", value: "cat-groceries" }],
    });
    addRule(db, {
      priority: 20,
      conditions: [{ field: "category", op: "is", value: "cat-groceries" }],
      actions: [{ type: "set_notes", value: { mode: "replace", text: "groceries run" } }],
    });
    const out = runRules(db, { payeeName: "Blinkit", categoryId: null, notes: null });
    expect(out.categoryId).toBe("cat-groceries");
    expect(out.notes).toBe("groceries run"); // second rule saw the first rule's category
  });

  test("match=any applies when at least one condition holds", () => {
    addRule(db, {
      match: "any",
      conditions: [
        { field: "payee", op: "is", value: "zomato" },
        { field: "amount", op: "outflow" },
      ],
      actions: [{ type: "set_category", value: "cat-x" }],
    });
    const out = runRules(db, { payeeName: "Blinkit", amountCents: -100, categoryId: null });
    expect(out.categoryId).toBe("cat-x");
  });

  test("a malformed rule row is skipped, others still run", () => {
    // Corrupt trigger JSON directly.
    db.insert(schema.rules)
      .values({
        id: "bad",
        name: "bad",
        enabled: true,
        priority: 1,
        triggerType: "user",
        triggerPayload: "{not json",
        actionPayload: "{not json",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      .run();
    addRule(db, {
      priority: 2,
      conditions: [{ field: "payee", op: "is", value: "blinkit" }],
      actions: [{ type: "set_category", value: "cat-ok" }],
    });
    const out = runRules(db, { payeeName: "Blinkit", categoryId: null });
    expect(out.categoryId).toBe("cat-ok");
  });

  test("no rules: returns txn unchanged", () => {
    const txn = { payeeName: "Blinkit", categoryId: "c" };
    expect(runRules(db, txn)).toEqual(txn);
  });
});
