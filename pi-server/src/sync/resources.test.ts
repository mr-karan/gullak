import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, expect, test } from "vitest";

import * as schema from "../db/schema.ts";
import type { Db } from "../db/index.ts";
import {
  materializeChangeTargets,
  materializeEntity,
  registerPolicy,
  transactionTagEntityId,
  validateKnownFieldValue,
  validateProjectedState,
} from "./resources.ts";

let db: Db;

beforeEach(() => {
  const sqlite = new Database(":memory:");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
});

function register(field: string, visibleValueJson: string) {
  db.insert(schema.syncRegisters)
    .values({
      epoch: "e1",
      resource: "accounts",
      entityId: "a1",
      field,
      policy: registerPolicy("accounts", field),
      candidatesJson: '{"candidates":[]}',
      visibleValueJson,
      updatedCursor: 1,
    })
    .run();
}

test("materializes a typed entity while retaining unknown registers", () => {
  register("$exists", "true");
  register("name", '"Current"');
  register("kind", '"checking"');
  register("openingBalanceCents", "0");
  register("onBudget", "true");
  register("archived", "false");
  register("sortOrder", "0");
  register("createdAt", "1");
  register("updatedAt", "2");
  register("future.field", '{"opaque":true}');

  materializeEntity(db, "e1", "accounts", "a1");
  const row = db
    .select()
    .from(schema.accounts)
    .where(eq(schema.accounts.id, "a1"))
    .get();
  expect(row).toMatchObject({ id: "a1", name: "Current", updatedAt: 2 });
  expect(
    db
      .select()
      .from(schema.syncRegisters)
      .where(eq(schema.syncRegisters.field, "future.field"))
      .get(),
  ).toBeDefined();
});

test("remove-wins projection deletes the materialized entity", () => {
  db.insert(schema.accounts)
    .values({
      id: "a1",
      name: "Current",
      kind: "checking",
      openingBalanceCents: 0,
      onBudget: true,
      archived: false,
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 1,
    })
    .run();
  register("$exists", "false");
  materializeEntity(db, "e1", "accounts", "a1");
  expect(
    db.select().from(schema.accounts).where(eq(schema.accounts.id, "a1")).get(),
  ).toBeUndefined();
});

test("known money and nullability violations fail closed", () => {
  expect(() =>
    validateKnownFieldValue("transactions", "amountCents", 1.2),
  ).toThrow(/integer/);
  expect(() =>
    validateKnownFieldValue("transactions", "accountId", null),
  ).toThrow(/cannot be null/);
  expect(() =>
    validateKnownFieldValue("transactions", "notes", null),
  ).not.toThrow();
  expect(() =>
    validateKnownFieldValue("transactions", "splitTotalCents", 100),
  ).toThrow(/derived/);
  expect(() => validateKnownFieldValue("payees", "useCount", 5)).toThrow(
    /derived/,
  );
});

test("reserved fields are policy checked", () => {
  expect(registerPolicy("transactions", "$exists")).toBe("remove_wins");
  expect(registerPolicy("transaction_tags", "$member")).toBe("add_wins");
  expect(() => registerPolicy("transactions", "$member")).toThrow(/reserved/);
});

test("derived money, payee caches, and usage counts are deterministic", () => {
  db.insert(schema.accounts)
    .values({ id: "a1", name: "A", kind: "checking" })
    .run();
  db.insert(schema.payees)
    .values({ id: "p1", name: "Dyson V15", useCount: 99 })
    .run();
  const base = {
    accountId: "a1",
    date: "2026-07-22",
    cleared: false,
    reconciled: false,
    origin: "manual",
    isGroupParent: false,
  };
  db.insert(schema.transactions)
    .values([
      {
        ...base,
        id: "split",
        amountCents: -999,
        splitTotalCents: -999,
        payeeId: "p1",
        payeeName: "Payu Retail",
      },
      { ...base, id: "split-a", amountCents: -60, parentId: "split" },
      { ...base, id: "split-b", amountCents: -40, parentId: "split" },
      {
        ...base,
        id: "group",
        amountCents: -999,
        isGroupParent: true,
      },
      {
        ...base,
        id: "group-a",
        amountCents: -30,
        groupParentId: "group",
        payeeId: "p1",
        payeeName: "Payu Retail",
      },
      {
        ...base,
        id: "group-b",
        amountCents: -20,
        groupParentId: "group",
        payeeId: "p1",
        payeeName: "Payu Retail",
      },
    ])
    .run();

  materializeChangeTargets(db, "unused-epoch", []);

  const rows = new Map(
    db
      .select()
      .from(schema.transactions)
      .all()
      .map((row) => [row.id, row]),
  );
  expect(rows.get("split")).toMatchObject({
    amountCents: -100,
    splitTotalCents: -100,
    payeeName: "Dyson V15",
  });
  expect(rows.get("group")).toMatchObject({ amountCents: 0 });
  expect(rows.get("group-a")).toMatchObject({ payeeName: "Dyson V15" });
  expect(db.select().from(schema.payees).get()).toMatchObject({ useCount: 3 });
});

test("transaction-tag relation identity is deterministic and enforced", () => {
  db.insert(schema.accounts)
    .values({ id: "a1", name: "A", kind: "checking" })
    .run();
  db.insert(schema.transactions)
    .values({ id: "t1", accountId: "a1", amountCents: -1, date: "2026-07-22" })
    .run();
  db.insert(schema.tags).values({ id: "tag1", name: "Home" }).run();
  db.insert(schema.transactionTags)
    .values({ id: "legacy-random", transactionId: "t1", tagId: "tag1" })
    .run();

  expect(transactionTagEntityId("t1", "tag1")).toBe('tt:["t1","tag1"]');
  expect(() => validateProjectedState(db)).toThrow(/logical id/);
  expect(() =>
    validateProjectedState(db, { allowNonCanonicalTransactionTagIds: true }),
  ).not.toThrow();
});
