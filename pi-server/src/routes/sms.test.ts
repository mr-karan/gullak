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

// --- POST /v1/sms/ingest (iOS auto-capture path) ----------------------------

function ingest(app: ReturnType<typeof makeApp>["app"], body: string) {
  return app.request("/v1/sms/ingest", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sender: "HDFCBK", body, receivedAt: 1_700_000_000_000 }),
  });
}

test("ingest queues a reviewable candidate for a bank SMS (no txn written)", async () => {
  const { app, db } = makeApp();
  mockParseSms.mockResolvedValue(candidate());

  const res = await ingest(app, "Spent Rs 480 at Blinkit via HDFC");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string; id: string };
  expect(body.status).toBe("transaction");
  expect(body.id).toBeTruthy();

  // A candidate row is queued for the phone to import, tagged source=sms.
  const rows = db.select().from(schema.whatsappInboxCandidates).all();
  expect(rows).toHaveLength(1);
  expect(rows[0]!.source).toBe("sms");
  expect(rows[0]!.sourceUser).toBe("HDFCBK");
  expect(rows[0]!.status).toBe("pending");
  expect(JSON.parse(rows[0]!.candidateJson).payee).toBe("Blinkit");

  // Draft-safe: no financial row is written.
  expect(db.select().from(schema.transactions).all()).toHaveLength(0);
  // Not a financial mutation → no change_log entry.
  expect(db.select().from(schema.changeLog).all()).toHaveLength(0);
});

test("ingest enriches a matching transaction instead of queuing a duplicate (#38)", async () => {
  const { app, db } = makeApp();
  // An account whose name matches the candidate's accountHint exactly, plus an
  // existing manual txn (no payee) for the same amount/date/account.
  const now = Date.now();
  db.insert(schema.accounts)
    .values({ id: "a1", name: "HDFC", createdAt: now, updatedAt: now })
    .run();
  db.insert(schema.transactions)
    .values({
      id: "t-existing",
      accountId: "a1",
      amountCents: -48000,
      date: "2026-06-01",
      origin: "manual",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  mockParseSms.mockResolvedValue({
    status: "transaction",
    isTransaction: true,
    candidate: {
      amountCents: 48000,
      isIncome: false,
      payee: "Blinkit",
      categoryId: "c1",
      accountHint: "HDFC",
      bankRef: "REF123",
      date: "2026-06-01",
      confidence: 0.9,
    },
  } as unknown as Awaited<ReturnType<typeof parseSms>>);

  const res = await ingest(app, "Spent Rs 480 at Blinkit via HDFC");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string; matchedId: string };
  expect(body.status).toBe("matched");
  expect(body.matchedId).toBe("t-existing");

  // No duplicate draft queued.
  expect(db.select().from(schema.whatsappInboxCandidates).all()).toHaveLength(0);

  // The existing txn was enriched: empty payee filled, importedId stamped.
  const txn = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, "t-existing"))
    .get();
  expect(txn?.payeeName).toBe("Blinkit");
  expect(txn?.importedId).toBe("sms:ref:REF123");
  // A change_log row is recorded so the phone converges.
  const changed = db
    .select()
    .from(schema.changeLog)
    .where(eq(schema.changeLog.resourceId, "t-existing"))
    .all();
  expect(changed.some((c) => c.op === "upsert")).toBe(true);
});

test("ingest does not overwrite a user-set payee on match (#38)", async () => {
  const { app, db } = makeApp();
  const now = Date.now();
  db.insert(schema.accounts)
    .values({ id: "a1", name: "HDFC", createdAt: now, updatedAt: now })
    .run();
  db.insert(schema.transactions)
    .values({
      id: "t-existing",
      accountId: "a1",
      amountCents: -48000,
      date: "2026-06-01",
      payeeName: "My Payee",
      origin: "manual",
      createdAt: now,
      updatedAt: now,
    })
    .run();

  mockParseSms.mockResolvedValue({
    status: "transaction",
    isTransaction: true,
    candidate: {
      amountCents: 48000,
      isIncome: false,
      payee: "Blinkit",
      categoryId: "c1",
      accountHint: "HDFC",
      bankRef: null,
      date: "2026-06-01",
      confidence: 0.9,
    },
  } as unknown as Awaited<ReturnType<typeof parseSms>>);

  const res = await ingest(app, "Spent Rs 480 at Blinkit via HDFC");
  const body = (await res.json()) as { status: string; matchedId: string };
  expect(body.status).toBe("matched");

  const txn = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, "t-existing"))
    .get();
  expect(txn?.payeeName).toBe("My Payee"); // preserved, not clobbered
});

test("ingest ignores a non-transaction SMS without queuing anything", async () => {
  const { app, db } = makeApp();
  mockParseSms.mockResolvedValue({
    status: "not_a_txn",
    isTransaction: false,
    candidate: null,
  } as unknown as Awaited<ReturnType<typeof parseSms>>);

  const res = await ingest(app, "Your OTP is 123456");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string; ignored: boolean };
  expect(body.ignored).toBe(true);
  expect(db.select().from(schema.whatsappInboxCandidates).all()).toHaveLength(0);
});

test("ingest auto-captures a content parse_failed as feedback (nothing queued)", async () => {
  const { app, db } = makeApp();
  mockParseSms.mockResolvedValue({
    status: "parse_failed",
    isTransaction: false,
    candidate: null,
    error: "no candidate",
  } as unknown as Awaited<ReturnType<typeof parseSms>>);

  const res = await ingest(app, "garbled non-transaction text");
  expect(res.status).toBe(200);
  const body = (await res.json()) as { status: string; ignored: boolean };
  expect(body.ignored).toBe(true);

  // No candidate queued ...
  expect(db.select().from(schema.whatsappInboxCandidates).all()).toHaveLength(0);
  // ... but the failure is auto-captured (no manual "Send feedback" needed).
  const fb = db.select().from(schema.feedbackEvents).all();
  expect(fb).toHaveLength(1);
  expect(fb[0]!.kind).toBe("sms_parse_failure");
  expect(JSON.parse(fb[0]!.payload).operational).toBe(false);
});
