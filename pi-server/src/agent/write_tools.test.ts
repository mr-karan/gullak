import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, test } from "vitest";

import * as schema from "../db/schema.ts";
import { createTransferPair } from "../transactions/transfers.ts";
import {
  runWriteTool,
  type WriteToolData,
  type WriteToolResult,
} from "./write_tools.ts";

const at = 1_700_000_000_000;

function makeDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.insert(schema.accounts)
    .values({ id: "a1", name: "HDFC", openingBalanceCents: 0, createdAt: at, updatedAt: at })
    .run();
  db.insert(schema.accounts)
    .values({ id: "a2", name: "Cash", openingBalanceCents: 0, createdAt: at, updatedAt: at })
    .run();
  db.insert(schema.categories)
    .values({ id: "c-food", name: "Food", groupId: "g1", updatedAt: at })
    .run();
  db.insert(schema.categories)
    .values({ id: "c-groc", name: "Groceries", groupId: "g1", updatedAt: at })
    .run();
  return db;
}

function addTxn(
  db: ReturnType<typeof makeDb>,
  id: string,
  amountCents: number,
  opts: Partial<schema.NewTransaction> = {},
) {
  db.insert(schema.transactions)
    .values({
      id,
      accountId: "a1",
      amountCents,
      date: "2026-07-01",
      createdAt: at,
      updatedAt: at,
      ...opts,
    })
    .run();
}

function rowById(db: ReturnType<typeof makeDb>, id: string) {
  return db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .get();
}

function changeLogFor(db: ReturnType<typeof makeDb>, id: string, op: string) {
  return db
    .select()
    .from(schema.changeLog)
    .all()
    .filter((r) => r.resourceId === id && r.op === op);
}

// ── categorize_transactions ──────────────────────────────────────────────────

test("categorize_transactions sets category, change-logs each, learns, undo restores", () => {
  const db = makeDb();
  // Three Swiggy rows so categorizing them forms a learnable habit (≥3 of 5).
  addTxn(db, "t1", -500_00, { payeeName: "Swiggy" });
  addTxn(db, "t2", -300_00, { payeeName: "Swiggy" });
  addTxn(db, "t3", -200_00, { payeeName: "Swiggy" });

  const res = runWriteTool(db, {
    tool: "categorize_transactions",
    params: { transactionIds: ["t1", "t2", "t3"], categoryName: "Food" },
  });
  const data = res.data as Extract<WriteToolData, { kind: "categorize" }>;
  expect(data.updated.sort()).toEqual(["t1", "t2", "t3"]);
  expect(data.skippedLocked).toEqual([]);
  expect(rowById(db, "t1")!.categoryId).toBe("c-food");
  expect(rowById(db, "t2")!.categoryId).toBe("c-food");
  // change_log upsert for each.
  expect(changeLogFor(db, "t1", "upsert")).toHaveLength(1);
  expect(changeLogFor(db, "t2", "upsert")).toHaveLength(1);
  // The action carries an undo referencing the previous categories.
  expect(res.action?.tool).toBe("categorize_transactions");
  expect(res.action?.undo?.tool).toBe("restore_categories");
  expect(data.previous).toEqual([
    { id: "t1", categoryId: null },
    { id: "t2", categoryId: null },
    { id: "t3", categoryId: null },
  ]);

  // A payee→category habit was learned (Swiggy → Food).
  const learned = db.select().from(schema.rules).all();
  expect(learned.some((r) => r.triggerType === "learned")).toBe(true);

  // Undo re-applies the previous (null) categories.
  runWriteTool(db, {
    tool: "restore_categories",
    params: { previous: data.previous },
  });
  expect(rowById(db, "t1")!.categoryId).toBeNull();
  expect(rowById(db, "t2")!.categoryId).toBeNull();
});

test("categorize_transactions skips a reconciled (locked) row, reports it", () => {
  const db = makeDb();
  addTxn(db, "t1", -500_00);
  addTxn(db, "locked", -300_00, { reconciled: true });

  const res = runWriteTool(db, {
    tool: "categorize_transactions",
    params: { transactionIds: ["t1", "locked"], categoryName: "Food" },
  });
  const data = res.data as Extract<WriteToolData, { kind: "categorize" }>;
  expect(data.updated).toEqual(["t1"]);
  expect(data.skippedLocked).toEqual(["locked"]);
  // The locked row is untouched.
  expect(rowById(db, "locked")!.categoryId).toBeNull();
  expect(changeLogFor(db, "locked", "upsert")).toHaveLength(0);
});

// ── edit_transaction ─────────────────────────────────────────────────────────

test("edit_transaction refuses a reconciled (locked) row", () => {
  const db = makeDb();
  addTxn(db, "locked", -100_00, { reconciled: true, payeeName: "Amazon" });

  const res = runWriteTool(db, {
    tool: "edit_transaction",
    params: { id: "locked", amountCents: 156_000 },
  });
  const data = res.data as Extract<WriteToolData, { kind: "edit" }>;
  expect(data.after).toBeNull();
  expect(data.error).toMatch(/reconciled/i);
  expect(res.action).toBeUndefined();
  expect(rowById(db, "locked")!.amountCents).toBe(-100_00); // unchanged
});

test("edit_transaction preserves sign and its summary reflects the new amount", () => {
  const db = makeDb();
  addTxn(db, "amz", -100_00, { payeeName: "Amazon" });

  const res = runWriteTool(db, {
    tool: "edit_transaction",
    params: { id: "amz", amountCents: 156_000 }, // magnitude; expense sign kept
  });
  expect(rowById(db, "amz")!.amountCents).toBe(-156_000);
  expect(res.action?.summary).toBe("Changed Amazon to ₹1,560.00");
  expect(res.action?.undo?.tool).toBe("edit_transaction");
});

test("edit_transaction on a transfer leg propagates to its sibling", () => {
  const db = makeDb();
  // Build a transfer pair a1 -> a2 for -500.
  let groupId = "";
  db.transaction((tx) => {
    const { primary } = createTransferPair(tx, {
      id: "leg1",
      accountId: "a1",
      transferAccountId: "a2",
      amountCents: -500_00,
      date: "2026-07-01",
      createdAt: at,
      updatedAt: at,
    });
    groupId = primary.transferGroupId!;
  });
  const sibling = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.transferGroupId, groupId))
    .all()
    .find((l) => l.id !== "leg1")!;

  const res = runWriteTool(db, {
    tool: "edit_transaction",
    params: { id: "leg1", amountCents: 750_00 },
  });
  expect((res.data as { kind: string }).kind).toBe("edit");
  // Primary took the (signed) edit; sibling mirrors the negation.
  expect(rowById(db, "leg1")!.amountCents).toBe(-750_00);
  expect(rowById(db, sibling.id)!.amountCents).toBe(750_00);
});

// ── delete_transactions ──────────────────────────────────────────────────────

test("delete_transactions cascades a split parent; undo re-creates parent+children", () => {
  const db = makeDb();
  addTxn(db, "p", -100_00);
  addTxn(db, "c1", -60_00, { parentId: "p" });
  addTxn(db, "c2", -40_00, { parentId: "p" });

  const res = runWriteTool(db, {
    tool: "delete_transactions",
    params: { transactionIds: ["p"] },
  });
  const data = res.data as Extract<WriteToolData, { kind: "delete" }>;
  expect(data.deleted).toEqual(["p"]);
  expect(rowById(db, "p")).toBeUndefined();
  expect(rowById(db, "c1")).toBeUndefined();
  expect(rowById(db, "c2")).toBeUndefined();
  // Payloads captured all three so undo can re-create them.
  expect(new Set(data.payloads.map((r) => r.id))).toEqual(
    new Set(["p", "c1", "c2"]),
  );

  runWriteTool(db, {
    tool: "restore_transactions",
    params: { payloads: data.payloads },
  });
  expect(rowById(db, "p")).toBeDefined();
  expect(rowById(db, "c1")!.parentId).toBe("p");
  expect(rowById(db, "c2")!.parentId).toBe("p");
});

test("delete_transactions ungroups a group parent (children survive)", () => {
  const db = makeDb();
  addTxn(db, "g1", -50_00);
  addTxn(db, "g2", -30_00);
  // Build a group parent by hand.
  db.insert(schema.transactions)
    .values({
      id: "gp",
      accountId: "a1",
      amountCents: 0,
      date: "2026-07-01",
      isGroupParent: true,
      createdAt: at,
      updatedAt: at,
    })
    .run();
  db.update(schema.transactions).set({ groupParentId: "gp" }).where(eq(schema.transactions.id, "g1")).run();
  db.update(schema.transactions).set({ groupParentId: "gp" }).where(eq(schema.transactions.id, "g2")).run();

  const res = runWriteTool(db, {
    tool: "delete_transactions",
    params: { transactionIds: ["gp"] },
  });
  const data = res.data as Extract<WriteToolData, { kind: "delete" }>;
  expect(data.deleted).toEqual(["gp"]);
  expect(rowById(db, "gp")).toBeUndefined();
  // Children survive, unlinked.
  expect(rowById(db, "g1")!.groupParentId).toBeNull();
  expect(rowById(db, "g2")!.groupParentId).toBeNull();

  // Undo re-creates the parent AND re-links the children (payloads captured the
  // children's before-state with groupParentId set).
  runWriteTool(db, {
    tool: "restore_transactions",
    params: { payloads: data.payloads },
  });
  expect(rowById(db, "gp")).toBeDefined();
  expect(rowById(db, "g1")!.groupParentId).toBe("gp");
});

test("delete_transactions skips a reconciled row and reports it", () => {
  const db = makeDb();
  addTxn(db, "t1", -100_00);
  addTxn(db, "locked", -200_00, { reconciled: true });

  const res = runWriteTool(db, {
    tool: "delete_transactions",
    params: { transactionIds: ["t1", "locked"] },
  });
  const data = res.data as Extract<WriteToolData, { kind: "delete" }>;
  expect(data.deleted).toEqual(["t1"]);
  expect(data.skippedLocked).toEqual(["locked"]);
  expect(rowById(db, "locked")).toBeDefined();
});

// ── log_transaction ──────────────────────────────────────────────────────────

test("log_transaction books an expense and change-logs it", () => {
  const db = makeDb();
  const res: WriteToolResult = runWriteTool(db, {
    tool: "log_transaction",
    params: { amountCents: 450_00, accountName: "HDFC", categoryName: "Groceries", payeeName: "Blinkit" },
  });
  const data = res.data as Extract<WriteToolData, { kind: "log" }>;
  expect(data.id).toBeTruthy();
  const row = rowById(db, data.id!)!;
  expect(row.amountCents).toBe(-450_00); // expense negative
  expect(row.categoryId).toBe("c-groc");
  expect(row.accountId).toBe("a1");
  expect(changeLogFor(db, data.id!, "upsert")).toHaveLength(1);
  // Undo deletes the freshly-booked row.
  expect(res.action?.undo?.tool).toBe("delete_transactions");
});

test("log_transaction books income as a positive amount", () => {
  const db = makeDb();
  const res = runWriteTool(db, {
    tool: "log_transaction",
    params: { amountCents: 2000_00, isIncome: true, accountName: "HDFC" },
  });
  const data = res.data as Extract<WriteToolData, { kind: "log" }>;
  expect(rowById(db, data.id!)!.amountCents).toBe(2000_00);
});
