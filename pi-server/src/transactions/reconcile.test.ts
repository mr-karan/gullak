import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test } from "vitest";

import { createApp } from "../app.ts";
import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import * as schema from "../db/schema.ts";
import { computeClearedBalance, reconcileAccount } from "./reconcile.ts";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeApp() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const dataDir = mkdtempSync(join(tmpdir(), "gullak-recon-"));
  tmpDirs.push(dataDir);
  const config = {
    dataDir,
    sheets: { syncIntervalMinutes: 0 },
    ai: { enabled: false },
    rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
  } as unknown as AppConfig;
  return { app: createApp({ db, config }), db };
}

const at = 1_700_000_000_000;

function addAccount(db: Db, id: string, openingBalanceCents = 0) {
  db.insert(schema.accounts)
    .values({ id, name: id, openingBalanceCents, createdAt: at, updatedAt: at })
    .run();
}

function addTxn(
  db: Db,
  opts: {
    id: string;
    accountId: string;
    amountCents: number;
    date?: string;
    cleared?: boolean;
    reconciled?: boolean;
    parentId?: string | null;
    isGroupParent?: boolean;
  },
) {
  db.insert(schema.transactions)
    .values({
      id: opts.id,
      accountId: opts.accountId,
      amountCents: opts.amountCents,
      date: opts.date ?? "2026-02-01",
      cleared: opts.cleared ?? false,
      reconciled: opts.reconciled ?? false,
      parentId: opts.parentId ?? null,
      isGroupParent: opts.isGroupParent ?? false,
      createdAt: at,
      updatedAt: at,
    })
    .run();
}

function rowById(db: Db, id: string) {
  return db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .get();
}

function accountById(db: Db, id: string) {
  return db.select().from(schema.accounts).where(eq(schema.accounts.id, id)).get();
}

async function reconcile(app: ReturnType<typeof makeApp>["app"], id: string, body: unknown) {
  return app.request(`/v1/accounts/${id}/reconcile`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ── Cleared balance math ────────────────────────────────────────────────────

test("cleared balance: opening + cleared only; uncleared, split children excluded; group parent 0 harmless", () => {
  const { db } = makeApp();
  addAccount(db, "a1", 1000_00);
  addTxn(db, { id: "cleared", accountId: "a1", amountCents: -200_00, cleared: true });
  addTxn(db, { id: "uncleared", accountId: "a1", amountCents: -500_00, cleared: false });
  addTxn(db, { id: "sp", accountId: "a1", amountCents: -100_00, cleared: true }); // top-level split parent
  addTxn(db, { id: "sc", accountId: "a1", amountCents: -60_00, cleared: true, parentId: "sp" }); // child excluded
  addTxn(db, { id: "gp", accountId: "a1", amountCents: 0, cleared: true, isGroupParent: true }); // 0, harmless

  // 1000 - 200 - 100 = 700 (uncleared and split child excluded; group parent 0).
  expect(computeClearedBalance(db, "a1")).toBe(700_00);
});

test("cleared balance: missing account contributes a 0 opening", () => {
  const { db } = makeApp();
  expect(computeClearedBalance(db, "nope")).toBe(0);
});

// ── diff == 0 → lock, no adjustment ─────────────────────────────────────────

test("diff==0: all cleared txns get reconciled=true, account stamped, no adjustment", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1", 0);
  addTxn(db, { id: "c1", accountId: "a1", amountCents: -300_00, cleared: true });
  addTxn(db, { id: "u1", accountId: "a1", amountCents: -900_00, cleared: false });

  const res = await reconcile(app, "a1", { targetBalanceCents: -300_00 });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    clearedCents: number;
    diffCents: number;
    locked: boolean;
    adjustmentId: string | null;
    reconciledCount: number;
  };
  expect(body.clearedCents).toBe(-300_00);
  expect(body.diffCents).toBe(0);
  expect(body.locked).toBe(true);
  expect(body.adjustmentId).toBeNull();
  expect(body.reconciledCount).toBe(1);

  expect(rowById(db, "c1")!.reconciled).toBe(true);
  // Uncleared row is left alone.
  expect(rowById(db, "u1")!.reconciled).toBe(false);

  const acct = accountById(db, "a1")!;
  expect(acct.reconciledBalanceCents).toBe(-300_00);
  expect(acct.reconciledAt).not.toBeNull();
});

// ── diff != 0 + createAdjustment → adjustment then lock ─────────────────────

test("diff!=0 + createAdjustment: adjustment created (amount=diff), cleared+reconciled, cleared==target, all locked", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1", 0);
  addTxn(db, { id: "c1", accountId: "a1", amountCents: -300_00, cleared: true });

  const res = await reconcile(app, "a1", {
    targetBalanceCents: -500_00,
    createAdjustment: true,
    asOf: "2026-06-01",
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    clearedCents: number;
    diffCents: number;
    locked: boolean;
    adjustmentId: string | null;
    reconciledCount: number;
  };
  expect(body.clearedCents).toBe(-300_00);
  expect(body.diffCents).toBe(-200_00);
  expect(body.locked).toBe(true);
  expect(body.adjustmentId).not.toBeNull();
  expect(body.reconciledCount).toBe(1); // c1 flipped; adjustment born reconciled

  const adj = rowById(db, body.adjustmentId!)!;
  expect(adj.amountCents).toBe(-200_00);
  expect(adj.cleared).toBe(true);
  expect(adj.reconciled).toBe(true);
  expect(adj.categoryId).toBeNull();
  expect(adj.payeeName).toBe("Reconciliation adjustment");
  expect(adj.notes).toBe("Reconciliation adjustment");
  expect(adj.origin).toBe("reconcile");
  expect(adj.date).toBe("2026-06-01");

  // Cleared balance now equals target; c1 locked.
  expect(computeClearedBalance(db, "a1")).toBe(-500_00);
  expect(rowById(db, "c1")!.reconciled).toBe(true);
  expect(accountById(db, "a1")!.reconciledBalanceCents).toBe(-500_00);
});

// ── diff != 0 without createAdjustment → nothing locked ─────────────────────

test("diff!=0 without createAdjustment: nothing locked, correct diff returned", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1", 0);
  addTxn(db, { id: "c1", accountId: "a1", amountCents: -300_00, cleared: true });

  const res = await reconcile(app, "a1", { targetBalanceCents: -500_00 });
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    diffCents: number;
    locked: boolean;
    adjustmentId: string | null;
    reconciledCount: number;
  };
  expect(body.diffCents).toBe(-200_00);
  expect(body.locked).toBe(false);
  expect(body.adjustmentId).toBeNull();
  expect(body.reconciledCount).toBe(0);

  // Nothing changed.
  expect(rowById(db, "c1")!.reconciled).toBe(false);
  expect(accountById(db, "a1")!.reconciledBalanceCents).toBeNull();
  // No adjustment row created (still exactly one txn).
  expect(db.select().from(schema.transactions).all()).toHaveLength(1);
});

// ── Adjustment sign ─────────────────────────────────────────────────────────

test("adjustment sign: target > cleared → positive; target < cleared → negative", async () => {
  const { app, db } = makeApp();
  addAccount(db, "pos", 0);
  addTxn(db, { id: "pc", accountId: "pos", amountCents: -300_00, cleared: true });
  addAccount(db, "neg", 0);
  addTxn(db, { id: "nc", accountId: "neg", amountCents: -300_00, cleared: true });

  // target (-100) > cleared (-300) → positive adjustment (+200).
  const posBody = (await (
    await reconcile(app, "pos", { targetBalanceCents: -100_00, createAdjustment: true })
  ).json()) as { adjustmentId: string };
  expect(rowById(db, posBody.adjustmentId)!.amountCents).toBe(200_00);

  // target (-500) < cleared (-300) → negative adjustment (-200).
  const negBody = (await (
    await reconcile(app, "neg", { targetBalanceCents: -500_00, createAdjustment: true })
  ).json()) as { adjustmentId: string };
  expect(rowById(db, negBody.adjustmentId)!.amountCents).toBe(-200_00);
});

// ── change_log ──────────────────────────────────────────────────────────────

test("change_log: reconcile emits upserts for each locked txn + account + adjustment", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1", 0);
  addTxn(db, { id: "c1", accountId: "a1", amountCents: -300_00, cleared: true });
  addTxn(db, { id: "c2", accountId: "a1", amountCents: -50_00, cleared: true });

  const body = (await (
    await reconcile(app, "a1", { targetBalanceCents: -500_00, createAdjustment: true })
  ).json()) as { adjustmentId: string };

  const log = db.select().from(schema.changeLog).all();
  // Each pre-existing cleared txn locked.
  expect(log.filter((r) => r.resource === "transactions" && r.resourceId === "c1" && r.op === "upsert")).toHaveLength(1);
  expect(log.filter((r) => r.resource === "transactions" && r.resourceId === "c2" && r.op === "upsert")).toHaveLength(1);
  // The adjustment.
  expect(
    log.filter((r) => r.resource === "transactions" && r.resourceId === body.adjustmentId && r.op === "upsert"),
  ).toHaveLength(1);
  // The account.
  expect(log.filter((r) => r.resource === "accounts" && r.resourceId === "a1" && r.op === "upsert")).toHaveLength(1);
});

test("reconcile on a missing account is 404", async () => {
  const { app } = makeApp();
  expect((await reconcile(app, "missing", { targetBalanceCents: 0 })).status).toBe(404);
});

// ── Lock: PATCH / DELETE guard ──────────────────────────────────────────────

async function patchTxn(app: ReturnType<typeof makeApp>["app"], id: string, body: unknown, force = false) {
  return app.request(`/v1/transactions/${id}${force ? "?force=true" : ""}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("lock: PATCH a reconciled txn → 409; force=true → 200; DELETE → 409; force=true → 200", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1", 0);
  addTxn(db, { id: "r1", accountId: "a1", amountCents: -100_00, cleared: true, reconciled: true });
  addTxn(db, { id: "r2", accountId: "a1", amountCents: -100_00, cleared: true, reconciled: true });

  // PATCH blocked.
  expect((await patchTxn(app, "r1", { amountCents: -150_00 })).status).toBe(409);
  expect(rowById(db, "r1")!.amountCents).toBe(-100_00);

  // PATCH with ?force=true works.
  expect((await patchTxn(app, "r1", { amountCents: -150_00 }, true)).status).toBe(200);
  expect(rowById(db, "r1")!.amountCents).toBe(-150_00);

  // PATCH with force:true in the body also works.
  const bodyForce = await app.request(`/v1/transactions/r1`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ amountCents: -175_00, force: true }),
  });
  expect(bodyForce.status).toBe(200);
  expect(rowById(db, "r1")!.amountCents).toBe(-175_00);

  // DELETE blocked, then forced.
  expect((await app.request(`/v1/transactions/r2`, { method: "DELETE" })).status).toBe(409);
  expect(rowById(db, "r2")).toBeDefined();
  expect((await app.request(`/v1/transactions/r2?force=true`, { method: "DELETE" })).status).toBe(200);
  expect(rowById(db, "r2")).toBeUndefined();
});

test("lock: a non-reconciled txn PATCH/DELETE is unaffected (regression)", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1", 0);
  addTxn(db, { id: "n1", accountId: "a1", amountCents: -100_00, cleared: true, reconciled: false });
  expect((await patchTxn(app, "n1", { amountCents: -120_00 })).status).toBe(200);
  expect(rowById(db, "n1")!.amountCents).toBe(-120_00);
  expect((await app.request(`/v1/transactions/n1`, { method: "DELETE" })).status).toBe(200);
  expect(rowById(db, "n1")).toBeUndefined();
});
