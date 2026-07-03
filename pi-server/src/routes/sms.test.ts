import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, expect, test, vi } from "vitest";

// The reprocess route re-enriches a confirmed SMS and PATCHes its linked
// transaction. Mock only parseSms (the model call) — keep validateCandidate
// and everything else real so the staleness guard and payee/category apply
// logic are exercised for real.
vi.mock("../ai/sms_parser.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../ai/sms_parser.ts")>()),
  parseSms: vi.fn(),
}));

import { createApp } from "../app.ts";
import type { AppConfig } from "../config.ts";
import { parseSms } from "../ai/sms_parser.ts";
import * as schema from "../db/schema.ts";

const mockParseSms = vi.mocked(parseSms);

function makeApp() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const now = Date.now();
  db.insert(schema.categories)
    .values({ id: "c1", name: "Groceries", groupId: "g1", updatedAt: now })
    .run();
  const config = {
    ai: { enabled: true },
    rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
    sheets: { syncIntervalMinutes: 0 },
  } as unknown as AppConfig;
  return { app: createApp({ db, config }), db };
}

function candidate() {
  return {
    status: "transaction",
    isTransaction: true,
    candidate: {
      amountCents: -48000,
      isIncome: false,
      payee: "Blinkit",
      categoryId: "c1",
      accountHint: null,
      date: "2026-06-01",
      confidence: 0.9,
    },
  } as unknown as Awaited<ReturnType<typeof parseSms>>;
}

function seedTxn(db: ReturnType<typeof makeApp>["db"], updatedAt: number) {
  db.insert(schema.transactions)
    .values({
      id: "t1",
      accountId: "a1",
      amountCents: -48000,
      date: "2026-06-01",
      origin: "sms",
      createdAt: 500,
      updatedAt,
    })
    .run();
}

function seedSms(
  db: ReturnType<typeof makeApp>["db"],
  baseTransactionUpdatedAt: number,
) {
  db.insert(schema.smsMessages)
    .values({
      id: "s1",
      sender: "HDFC",
      body: "debited 480 at BLINKIT",
      receivedAt: 1000,
      linkedTransactionId: "t1",
      baseTransactionUpdatedAt,
      status: "pending",
      createdAt: 500,
      updatedAt: 500,
    })
    .run();
}

function reprocess(app: ReturnType<typeof makeApp>["app"]) {
  return app.request("/v1/sms/reprocess", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ smsIds: ["s1"] }),
  });
}

beforeEach(() => mockParseSms.mockReset());

test("reprocess applies payee + category to the linked transaction", async () => {
  const { app, db } = makeApp();
  seedTxn(db, 1000);
  seedSms(db, 1000); // base matches the txn's updatedAt → not stale
  mockParseSms.mockResolvedValue(candidate());

  const res = await reprocess(app);
  const body = (await res.json()) as { enriched: number; staleSkipped: number };
  expect(body.enriched).toBe(1);
  expect(body.staleSkipped).toBe(0);

  const txn = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, "t1"))
    .get();
  expect(txn?.payeeName).toBe("Blinkit");
  expect(txn?.categoryId).toBe("c1");
  // A change_log row is recorded so the phone pulls the enrichment.
  const changed = db
    .select()
    .from(schema.changeLog)
    .where(eq(schema.changeLog.resourceId, "t1"))
    .all();
  expect(changed.some((c) => c.op === "upsert")).toBe(true);
});

test("reprocess refuses to clobber a transaction edited after confirm", async () => {
  const { app, db } = makeApp();
  // The txn moved past the confirm-time snapshot → a manual edit happened.
  seedTxn(db, 5000);
  seedSms(db, 1000);
  mockParseSms.mockResolvedValue(candidate());

  const res = await reprocess(app);
  const body = (await res.json()) as { enriched: number; staleSkipped: number };
  expect(body.staleSkipped).toBe(1);
  expect(body.enriched).toBe(0);

  const txn = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, "t1"))
    .get();
  expect(txn?.payeeName).toBeNull(); // untouched
  const sms = db
    .select()
    .from(schema.smsMessages)
    .where(eq(schema.smsMessages.id, "s1"))
    .get();
  expect(sms?.status).toBe("stale_skipped");
});
