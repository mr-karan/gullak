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
import { computeNetWorth } from "../repos/networth.ts";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeApp() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const dataDir = mkdtempSync(join(tmpdir(), "gullak-txns-"));
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

function addAccount(db: Db, id: string, openingBalanceCents = 0, archived = false) {
  db.insert(schema.accounts)
    .values({ id, name: id, openingBalanceCents, archived, createdAt: at, updatedAt: at })
    .run();
}

function addTxn(
  db: Db,
  id: string,
  accountId: string,
  amountCents: number,
  date: string,
  parentId: string | null = null,
) {
  db.insert(schema.transactions)
    .values({ id, accountId, amountCents, date, parentId, createdAt: at, updatedAt: at })
    .run();
}

async function postTxn(app: ReturnType<typeof makeApp>["app"], body: unknown) {
  return app.request("/v1/transactions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patchTxn(
  app: ReturnType<typeof makeApp>["app"],
  id: string,
  body: unknown,
) {
  return app.request(`/v1/transactions/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function deleteTxn(app: ReturnType<typeof makeApp>["app"], id: string) {
  return app.request(`/v1/transactions/${id}`, { method: "DELETE" });
}

function rowById(db: Db, id: string) {
  return db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, id))
    .get();
}

async function group(app: ReturnType<typeof makeApp>["app"], body: unknown) {
  return app.request("/v1/transactions/group", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function ungroup(app: ReturnType<typeof makeApp>["app"], parentId: string) {
  return app.request(`/v1/transactions/ungroup/${parentId}`, { method: "POST" });
}

test("group: creates a zero-amount parent and links both children", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addTxn(db, "t1", "a1", -500_00, "2026-02-01");
  addTxn(db, "t2", "a1", -300_00, "2026-02-02");

  const res = await group(app, {
    ids: ["t1", "t2"],
    date: "2026-02-01",
    payeeName: "Card payment",
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as {
    parent: { id: string; isGroupParent: boolean; amountCents: number; origin: string };
    childIds: string[];
    groupTotalCents: number;
  };

  // Parent carries NO money; its total is derived, not stored.
  expect(body.parent.isGroupParent).toBe(true);
  expect(body.parent.amountCents).toBe(0);
  expect(body.parent.origin).toBe("group");
  expect(body.groupTotalCents).toBe(-800_00);
  expect(new Set(body.childIds)).toEqual(new Set(["t1", "t2"]));

  const parentRow = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, body.parent.id))
    .get();
  expect(parentRow?.amountCents).toBe(0);
  expect(parentRow?.isGroupParent).toBe(true);

  for (const id of ["t1", "t2"]) {
    const row = db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, id))
      .get();
    expect(row?.groupParentId).toBe(body.parent.id);
  }
});

test("ungroup: clears children links, deletes parent, leaves child amounts intact", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addTxn(db, "t1", "a1", -500_00, "2026-02-01");
  addTxn(db, "t2", "a1", -300_00, "2026-02-02");
  const parentId = ((await (
    await group(app, { ids: ["t1", "t2"], date: "2026-02-01" })
  ).json()) as { parent: { id: string } }).parent.id;

  const res = await ungroup(app, parentId);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ungrouped: boolean; childIds: string[] };
  expect(body.ungrouped).toBe(true);
  expect(new Set(body.childIds)).toEqual(new Set(["t1", "t2"]));

  // Parent gone.
  expect(
    db.select().from(schema.transactions).where(eq(schema.transactions.id, parentId)).get(),
  ).toBeUndefined();

  // Children survive, unlinked, amounts untouched.
  const t1 = db.select().from(schema.transactions).where(eq(schema.transactions.id, "t1")).get();
  const t2 = db.select().from(schema.transactions).where(eq(schema.transactions.id, "t2")).get();
  expect(t1?.groupParentId).toBeNull();
  expect(t2?.groupParentId).toBeNull();
  expect(t1?.amountCents).toBe(-500_00);
  expect(t2?.amountCents).toBe(-300_00);
});

test("change_log: group emits parent+children upserts; ungroup emits child upserts + parent delete", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addTxn(db, "t1", "a1", -500_00, "2026-02-01");
  addTxn(db, "t2", "a1", -300_00, "2026-02-02");

  const parentId = ((await (
    await group(app, { ids: ["t1", "t2"], date: "2026-02-01" })
  ).json()) as { parent: { id: string } }).parent.id;

  const afterGroup = db.select().from(schema.changeLog).all();
  // parent upsert + t1 upsert + t2 upsert.
  const groupParentRows = afterGroup.filter(
    (r) => r.resourceId === parentId && r.op === "upsert",
  );
  expect(groupParentRows).toHaveLength(1);
  expect(
    afterGroup.filter((r) => r.resourceId === "t1" && r.op === "upsert"),
  ).toHaveLength(1);
  expect(
    afterGroup.filter((r) => r.resourceId === "t2" && r.op === "upsert"),
  ).toHaveLength(1);

  await ungroup(app, parentId);
  const all = db.select().from(schema.changeLog).all();
  // Parent now has a delete row.
  expect(
    all.filter((r) => r.resourceId === parentId && r.op === "delete"),
  ).toHaveLength(1);
  // Children got a second upsert (unlink).
  expect(
    all.filter((r) => r.resourceId === "t1" && r.op === "upsert"),
  ).toHaveLength(2);
  expect(
    all.filter((r) => r.resourceId === "t2" && r.op === "upsert"),
  ).toHaveLength(2);
});

test("no double-count: computeNetWorth is IDENTICAL before/after group and after ungroup", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1", 1000_00);
  addAccount(db, "a2", 0);
  addTxn(db, "t1", "a1", -500_00, "2026-02-01");
  addTxn(db, "t2", "a2", -300_00, "2026-02-02");
  addTxn(db, "t3", "a1", 200_00, "2026-02-03");

  const before = computeNetWorth(db);

  const parentId = ((await (
    await group(app, { ids: ["t1", "t2"], date: "2026-02-01" })
  ).json()) as { parent: { id: string } }).parent.id;

  const afterGroup = computeNetWorth(db);
  expect(afterGroup).toEqual(before);

  await ungroup(app, parentId);
  const afterUngroup = computeNetWorth(db);
  expect(afterUngroup).toEqual(before);
});

test("no double-count: /v1/summary is IDENTICAL before/after group and after ungroup", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1", 1000_00);
  addTxn(db, "t1", "a1", -500_00, "2026-02-01");
  addTxn(db, "t2", "a1", -300_00, "2026-02-02");
  addTxn(db, "t3", "a1", 200_00, "2026-02-03");

  const summary = async () =>
    (await (await app.request("/v1/summary")).json()) as {
      incomeCents: number;
      expenseCents: number;
      netCents: number;
    };

  const before = await summary();
  const parentId = ((await (
    await group(app, { ids: ["t1", "t2"], date: "2026-02-01" })
  ).json()) as { parent: { id: string } }).parent.id;
  expect(await summary()).toEqual(before);

  await ungroup(app, parentId);
  expect(await summary()).toEqual(before);
});

test("group rejects: <2 existing, split children, already-grouped, and group parents", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addTxn(db, "t1", "a1", -500_00, "2026-02-01");
  addTxn(db, "t2", "a1", -300_00, "2026-02-02");
  addTxn(db, "split_p", "a1", -100_00, "2026-02-04");
  addTxn(db, "split_c", "a1", -100_00, "2026-02-04", "split_p"); // split child

  // fewer than 2 exist
  expect((await group(app, { ids: ["t1", "nope"], date: "2026-02-01" })).status).toBe(400);

  // a split child cannot be grouped
  expect((await group(app, { ids: ["t1", "split_c"], date: "2026-02-01" })).status).toBe(400);

  // group t1+t2, then try to regroup an already-grouped row
  const parentId = ((await (
    await group(app, { ids: ["t1", "t2"], date: "2026-02-01" })
  ).json()) as { parent: { id: string } }).parent.id;
  expect((await group(app, { ids: ["t1", "split_p"], date: "2026-02-01" })).status).toBe(400);

  // a group parent cannot be nested into another group
  addTxn(db, "t4", "a1", -10_00, "2026-02-05");
  expect((await group(app, { ids: [parentId, "t4"], date: "2026-02-01" })).status).toBe(400);
});

test("ungroup on a non-parent id is 404", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addTxn(db, "t1", "a1", -500_00, "2026-02-01");
  expect((await ungroup(app, "t1")).status).toBe(404);
  expect((await ungroup(app, "missing")).status).toBe(404);
});

test("splits still work: a split parent (parentId-based) is unaffected by grouping", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1", 0);
  addTxn(db, "sp", "a1", -100_00, "2026-02-10");
  addTxn(db, "sc1", "a1", -60_00, "2026-02-10", "sp");
  addTxn(db, "sc2", "a1", -40_00, "2026-02-10", "sp");
  addTxn(db, "g1", "a1", -25_00, "2026-02-11");
  addTxn(db, "g2", "a1", -25_00, "2026-02-11");

  const before = computeNetWorth(db);
  await group(app, { ids: ["g1", "g2"], date: "2026-02-11" });
  // Split rows untouched; net worth unchanged (split children still excluded,
  // group parent contributes 0).
  const sp = db.select().from(schema.transactions).where(eq(schema.transactions.id, "sp")).get();
  expect(sp?.parentId).toBeNull();
  expect(sp?.groupParentId).toBeNull();
  const sc1 = db.select().from(schema.transactions).where(eq(schema.transactions.id, "sc1")).get();
  expect(sc1?.parentId).toBe("sp");
  expect(computeNetWorth(db)).toEqual(before);
});

// ── Transfers (#41): auto-mirrored linked pairs ────────────────────────────

/** Fetch both legs of the transfer that primary `id` belongs to. */
function transferLegs(db: Db, groupId: string) {
  return db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.transferGroupId, groupId))
    .all();
}

test("transfer create: yields two mirrored legs, shared group, categories nulled", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addAccount(db, "a2");

  const res = await postTxn(app, {
    accountId: "a1",
    transferAccountId: "a2",
    amountCents: -500_00, // 500 leaves a1
    date: "2026-03-01",
    notes: "rent move",
    categoryId: "cat_should_be_nulled",
  });
  expect(res.status).toBe(201);
  const primary = ((await res.json()) as { transaction: { id: string; transferGroupId: string } })
    .transaction;

  const legs = transferLegs(db, primary.transferGroupId);
  expect(legs).toHaveLength(2);

  const a1Leg = legs.find((l) => l.accountId === "a1")!;
  const a2Leg = legs.find((l) => l.accountId === "a2")!;
  expect(a1Leg).toBeDefined();
  expect(a2Leg).toBeDefined();

  // Opposite amounts that net to zero.
  expect(a1Leg.amountCents).toBe(-500_00);
  expect(a2Leg.amountCents).toBe(500_00);
  expect(a1Leg.amountCents + a2Leg.amountCents).toBe(0);

  // Shared group; each leg points at the OTHER account.
  expect(a1Leg.transferGroupId).toBe(a2Leg.transferGroupId);
  expect(a1Leg.transferAccountId).toBe("a2");
  expect(a2Leg.transferAccountId).toBe("a1");

  // Categories cleared on BOTH legs; date/notes mirrored.
  expect(a1Leg.categoryId).toBeNull();
  expect(a2Leg.categoryId).toBeNull();
  expect(a2Leg.date).toBe("2026-03-01");
  expect(a2Leg.notes).toBe("rent move");

  // Both legs emit a change_log upsert.
  const upserts = db
    .select()
    .from(schema.changeLog)
    .all()
    .filter((r) => r.op === "upsert" && r.resource === "transactions");
  expect(upserts.filter((r) => r.resourceId === a1Leg.id)).toHaveLength(1);
  expect(upserts.filter((r) => r.resourceId === a2Leg.id)).toHaveLength(1);
});

test("transfer create rejects same source and target account", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  const res = await postTxn(app, {
    accountId: "a1",
    transferAccountId: "a1",
    amountCents: -100_00,
    date: "2026-03-01",
  });
  expect(res.status).toBe(400);
});

test("transfer edit: amount/date/notes propagate to sibling, no recursion", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addAccount(db, "a2");
  const primary = ((await (
    await postTxn(app, {
      accountId: "a1",
      transferAccountId: "a2",
      amountCents: -500_00,
      date: "2026-03-01",
      notes: "orig",
    })
  ).json()) as { transaction: { id: string; transferGroupId: string } }).transaction;

  const legs = transferLegs(db, primary.transferGroupId);
  const primaryLeg = legs.find((l) => l.id === primary.id)!;
  const siblingId = legs.find((l) => l.id !== primary.id)!.id;

  const changeLogBefore = db.select().from(schema.changeLog).all().length;

  // Edit amount + date + notes, and try to sneak a category back on.
  const res = await patchTxn(app, primaryLeg.id, {
    amountCents: -750_00,
    date: "2026-03-05",
    notes: "updated",
    categoryId: "cat_should_be_nulled",
  });
  expect(res.status).toBe(200);

  const primaryAfter = rowById(db, primaryLeg.id)!;
  const siblingAfter = rowById(db, siblingId)!;

  // Primary took the edit; category forced null despite the body.
  expect(primaryAfter.amountCents).toBe(-750_00);
  expect(primaryAfter.categoryId).toBeNull();
  expect(primaryAfter.date).toBe("2026-03-05");
  expect(primaryAfter.notes).toBe("updated");

  // Sibling mirrors: negated amount, same date/notes, category null.
  expect(siblingAfter.amountCents).toBe(750_00);
  expect(siblingAfter.categoryId).toBeNull();
  expect(siblingAfter.date).toBe("2026-03-05");
  expect(siblingAfter.notes).toBe("updated");
  expect(primaryAfter.amountCents + siblingAfter.amountCents).toBe(0);

  // Exactly one propagation: one PATCH → one primary upsert + one sibling
  // upsert = two new change_log rows, no runaway recursion.
  const changeLogAfter = db.select().from(schema.changeLog).all().length;
  expect(changeLogAfter - changeLogBefore).toBe(2);

  // Editing the OTHER leg propagates back symmetrically (still one hop).
  const res2 = await patchTxn(app, siblingId, { amountCents: 200_00 });
  expect(res2.status).toBe(200);
  expect(rowById(db, siblingId)!.amountCents).toBe(200_00);
  expect(rowById(db, primaryLeg.id)!.amountCents).toBe(-200_00);
  const changeLogFinal = db.select().from(schema.changeLog).all().length;
  expect(changeLogFinal - changeLogAfter).toBe(2);
});

test("transfer delete: removing either leg removes both + logs two deletes", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addAccount(db, "a2");
  const primary = ((await (
    await postTxn(app, {
      accountId: "a1",
      transferAccountId: "a2",
      amountCents: -500_00,
      date: "2026-03-01",
    })
  ).json()) as { transaction: { id: string; transferGroupId: string } }).transaction;
  const legs = transferLegs(db, primary.transferGroupId);
  const siblingId = legs.find((l) => l.id !== primary.id)!.id;

  const res = await deleteTxn(app, siblingId); // delete the mirror leg
  expect(res.status).toBe(200);

  // Both legs gone.
  expect(rowById(db, primary.id)).toBeUndefined();
  expect(rowById(db, siblingId)).toBeUndefined();

  const deletes = db
    .select()
    .from(schema.changeLog)
    .all()
    .filter((r) => r.op === "delete" && r.resource === "transactions");
  expect(deletes.filter((r) => r.resourceId === primary.id)).toHaveLength(1);
  expect(deletes.filter((r) => r.resourceId === siblingId)).toHaveLength(1);
});

test("no double-count: a transfer leaves computeNetWorth unchanged", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1", 1000_00);
  addAccount(db, "a2", 500_00);
  addTxn(db, "t1", "a1", -100_00, "2026-03-01");

  const before = computeNetWorth(db);

  await postTxn(app, {
    accountId: "a1",
    transferAccountId: "a2",
    amountCents: -300_00,
    date: "2026-03-02",
  });

  // The mirror negates the primary, so net worth is identical.
  expect(computeNetWorth(db)).toEqual(before);
});

test("non-transfer create/patch/delete still behave as before (regression)", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");

  // Create: single row, single change_log upsert, no sibling.
  const created = ((await (
    await postTxn(app, {
      accountId: "a1",
      amountCents: -250_00,
      date: "2026-03-01",
      categoryId: "cat1",
    })
  ).json()) as { transaction: { id: string } }).transaction;
  const row = rowById(db, created.id)!;
  expect(row.amountCents).toBe(-250_00);
  expect(row.categoryId).toBe("cat1"); // NOT nulled — plain txn keeps its category
  expect(row.transferGroupId).toBeNull();
  expect(
    db
      .select()
      .from(schema.transactions)
      .all()
      .filter((r) => r.accountId === "a1"),
  ).toHaveLength(1);

  // Patch: category survives, only one row exists.
  await patchTxn(app, created.id, { amountCents: -260_00, categoryId: "cat2" });
  const patched = rowById(db, created.id)!;
  expect(patched.amountCents).toBe(-260_00);
  expect(patched.categoryId).toBe("cat2");
  expect(db.select().from(schema.transactions).all()).toHaveLength(1);

  // Delete: exactly one row removed, one change_log delete.
  const del = await deleteTxn(app, created.id);
  expect(del.status).toBe(200);
  expect(rowById(db, created.id)).toBeUndefined();
  expect(
    db
      .select()
      .from(schema.changeLog)
      .all()
      .filter((r) => r.op === "delete" && r.resourceId === created.id),
  ).toHaveLength(1);
});
