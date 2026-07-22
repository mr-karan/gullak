import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";

// The agent and the WhatsApp parser both reach the model through
// llm/client.ts's chatJson. Stub that single seam so we can exercise the
// paths where AI *writes financial rows* (the log path books transactions;
// undo deletes them) without a real model.
vi.mock("../llm/client.ts", () => ({ chatJson: vi.fn() }));

import type { AppConfig } from "../config.ts";
import * as schema from "../db/schema.ts";
import { chatJson } from "../llm/client.ts";
import { dispatchMessage } from "./agent.ts";

const mockChatJson = vi.mocked(chatJson);

function makeDb() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  // A default account + category the log path can resolve against.
  const now = Date.now();
  db.insert(schema.categoryGroups)
    .values({ id: "g1", name: "Everyday", sortOrder: 0 })
    .run();
  db.insert(schema.accounts)
    .values({ id: "a1", name: "HDFC", kind: "checking", createdAt: now, updatedAt: now })
    .run();
  db.insert(schema.categories)
    .values({ id: "c1", name: "Groceries", groupId: "g1", updatedAt: now })
    .run();
  return db;
}

const config = { ai: { enabled: true } } as unknown as AppConfig;

beforeEach(() => mockChatJson.mockReset());

test("log path books a transaction and records a causal event", async () => {
  const db = makeDb();
  // A spend-verb prefix takes the deterministic "log" classify branch, so the
  // only model call is the WhatsApp parser (mocked below).
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

  const res = await dispatchMessage(db, config, {
    text: "spent 480 groceries",
    source: "whatsapp",
  });
  expect(res.queued).toBe(1);

  const txns = db.select().from(schema.transactions).all();
  expect(txns).toHaveLength(1);
  expect(txns[0]!.amountCents).toBe(-48000); // expense is negative
  expect(txns[0]!.categoryId).toBe("c1");
  expect(txns[0]!.origin).toBe("whatsapp");

  const ops = db.select().from(schema.syncChanges).all().flatMap((event) =>
    JSON.parse(event.opsJson) as Array<{ entityId: string }>,
  );
  expect(ops.some((op) => op.entityId === txns[0]!.id)).toBe(true);
});

test("income is booked as a positive amount", async () => {
  const db = makeDb();
  mockChatJson.mockResolvedValueOnce({
    items: [
      { amount_cents: 250000, is_income: true, payee: "Refund", text: "got 2500 refund" },
    ],
  });
  await dispatchMessage(db, config, { text: "got 2500 refund", source: "whatsapp" });
  const txns = db.select().from(schema.transactions).all();
  expect(txns[0]!.amountCents).toBe(250000);
});

test("undo deletes the most-recent chat-booked transaction with a tombstone", async () => {
  const db = makeDb();
  mockChatJson.mockResolvedValueOnce({
    items: [{ amount_cents: 10000, is_income: false, text: "spent 100 coffee" }],
  });
  await dispatchMessage(db, config, { text: "spent 100 coffee", source: "whatsapp" });
  expect(db.select().from(schema.transactions).all()).toHaveLength(1);

  // "undo" is fully deterministic — no model call.
  const res = await dispatchMessage(db, config, { text: "undo", source: "whatsapp" });
  expect(res.reply.toLowerCase()).toContain("deleted");
  expect(db.select().from(schema.transactions).all()).toHaveLength(0);
  const ops = db.select().from(schema.syncChanges).all().flatMap((event) =>
    JSON.parse(event.opsJson) as Array<{ field: string; value: unknown }>,
  );
  expect(ops).toContainEqual(
    expect.objectContaining({ field: "$exists", value: false }),
  );
});

test("undo refuses to touch a transaction older than the freshness window", async () => {
  const db = makeDb();
  // A stale whatsapp transaction (booked 2 hours ago) must not be undoable.
  const old = Date.now() - 2 * 60 * 60 * 1000;
  db.insert(schema.transactions)
    .values({
      id: "old",
      accountId: "a1",
      amountCents: -9999,
      date: "2026-06-01",
      origin: "whatsapp",
      createdAt: old,
      updatedAt: old,
    })
    .run();
  const res = await dispatchMessage(db, config, { text: "undo", source: "whatsapp" });
  expect(res.reply.toLowerCase()).toContain("nothing recent");
  expect(db.select().from(schema.transactions).all()).toHaveLength(1); // untouched
});

test("a message with no extractable amount books nothing", async () => {
  const db = makeDb();
  mockChatJson.mockResolvedValueOnce({ items: [] });
  const res = await dispatchMessage(db, config, {
    text: "paid the usual",
    source: "whatsapp",
  });
  expect(res.queued).toBeUndefined();
  expect(db.select().from(schema.transactions).all()).toHaveLength(0);
});
