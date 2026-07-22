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
  for (const d of tmpDirs.splice(0))
    rmSync(d, { recursive: true, force: true });
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

function addAccount(
  db: Db,
  id: string,
  openingBalanceCents = 0,
  archived = false,
) {
  db.insert(schema.accounts)
    .values({
      id,
      name: id,
      openingBalanceCents,
      archived,
      createdAt: at,
      updatedAt: at,
    })
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
    .values({
      id,
      accountId,
      amountCents,
      date,
      parentId,
      createdAt: at,
      updatedAt: at,
    })
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

type TestSyncOp = {
  resource: string;
  entityId: string;
  field: string;
  value: unknown;
};

function syncOps(db: Db): TestSyncOp[] {
  return db.select().from(schema.syncChanges).all().flatMap(
    (event) => JSON.parse(event.opsJson) as TestSyncOp[],
  );
}

function lastSyncOps(db: Db): TestSyncOp[] {
  const event = db.select().from(schema.syncChanges).all().at(-1);
  return event === undefined ? [] : (JSON.parse(event.opsJson) as TestSyncOp[]);
}

async function group(app: ReturnType<typeof makeApp>["app"], body: unknown) {
  return app.request("/v1/transactions/group", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function ungroup(
  app: ReturnType<typeof makeApp>["app"],
  parentId: string,
) {
  return app.request(`/v1/transactions/ungroup/${parentId}`, {
    method: "POST",
  });
}

test("linked payee rename updates canonical entity and every derived cache", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  db.insert(schema.payees)
    .values({ id: "p1", name: "Payu Retail", updatedAt: at })
    .run();
  for (const id of ["dyson", "other"]) {
    db.insert(schema.transactions)
      .values({
        id,
        accountId: "a1",
        payeeId: "p1",
        payeeName: "Payu Retail",
        amountCents: -100,
        date: "2026-07-21",
        createdAt: at,
        updatedAt: at,
      })
      .run();
  }

  const renamed = await patchTxn(app, "dyson", { payeeName: "Dyson V15" });
  expect(renamed.status).toBe(200);
  expect(
    ((await renamed.json()) as { transaction: { payeeName: string } })
      .transaction.payeeName,
  ).toBe("Dyson V15");
  expect(
    db.select().from(schema.payees).where(eq(schema.payees.id, "p1")).get()
      ?.name,
  ).toBe("Dyson V15");
  expect(
    db
      .select()
      .from(schema.transactions)
      .all()
      .map((row) => row.payeeName),
  ).toEqual(["Dyson V15", "Dyson V15"]);

  const noteEdit = await patchTxn(app, "dyson", { notes: "probe" });
  expect(noteEdit.status).toBe(200);
  expect(rowById(db, "dyson")?.payeeName).toBe("Dyson V15");
  expect(syncOps(db)).toContainEqual(
    expect.objectContaining({ resource: "payees", entityId: "p1", field: "name" }),
  );
});

test("clearing a linked payee requires an explicit detach command", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  db.insert(schema.payees)
    .values({ id: "p1", name: "Payu", updatedAt: at })
    .run();
  db.insert(schema.transactions)
    .values({
      id: "t1",
      accountId: "a1",
      payeeId: "p1",
      payeeName: "Payu",
      amountCents: -100,
      date: "2026-07-21",
      createdAt: at,
      updatedAt: at,
    })
    .run();

  expect((await patchTxn(app, "t1", { payeeName: null })).status).toBe(400);
  expect(
    (
      await patchTxn(app, "t1", {
        payeeId: null,
        payeeName: "Detached label",
      })
    ).status,
  ).toBe(200);
  expect(rowById(db, "t1")).toMatchObject({
    payeeId: null,
    payeeName: "Detached label",
  });
});

test("PATCH has no POST defaults that rewrite untouched fields", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  db.insert(schema.transactions)
    .values({
      id: "t1",
      accountId: "a1",
      amountCents: -100,
      date: "2026-07-21",
      notes: null,
      cleared: true,
      origin: "sms",
      createdAt: at,
      updatedAt: at,
    })
    .run();

  expect((await patchTxn(app, "t1", { notes: "probe" })).status).toBe(200);
  expect(rowById(db, "t1")).toMatchObject({
    notes: "probe",
    cleared: true,
    origin: "sms",
  });
});

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
    parent: {
      id: string;
      isGroupParent: boolean;
      amountCents: number;
      origin: string;
    };
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
  const parentId = (
    (await (
      await group(app, { ids: ["t1", "t2"], date: "2026-02-01" })
    ).json()) as { parent: { id: string } }
  ).parent.id;

  const res = await ungroup(app, parentId);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { ungrouped: boolean; childIds: string[] };
  expect(body.ungrouped).toBe(true);
  expect(new Set(body.childIds)).toEqual(new Set(["t1", "t2"]));

  // Parent gone.
  expect(
    db
      .select()
      .from(schema.transactions)
      .where(eq(schema.transactions.id, parentId))
      .get(),
  ).toBeUndefined();

  // Children survive, unlinked, amounts untouched.
  const t1 = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, "t1"))
    .get();
  const t2 = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, "t2"))
    .get();
  expect(t1?.groupParentId).toBeNull();
  expect(t2?.groupParentId).toBeNull();
  expect(t1?.amountCents).toBe(-500_00);
  expect(t2?.amountCents).toBe(-300_00);
});

test("group and ungroup each emit one atomic multi-entity event", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addTxn(db, "t1", "a1", -500_00, "2026-02-01");
  addTxn(db, "t2", "a1", -300_00, "2026-02-02");

  const parentId = (
    (await (
      await group(app, { ids: ["t1", "t2"], date: "2026-02-01" })
    ).json()) as { parent: { id: string } }
  ).parent.id;

  const groupedEvents = db.select().from(schema.syncChanges).all();
  expect(groupedEvents).toHaveLength(2);
  const groupedIds = new Set(lastSyncOps(db).map((op) => op.entityId));
  expect(groupedIds).toEqual(new Set([parentId, "t1", "t2"]));

  await ungroup(app, parentId);
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(3);
  expect(syncOps(db)).toContainEqual(
    expect.objectContaining({ entityId: parentId, field: "$exists", value: false }),
  );
  expect(syncOps(db)).toContainEqual(
    expect.objectContaining({ entityId: "t1", field: "groupParentId", value: null }),
  );
  expect(syncOps(db)).toContainEqual(
    expect.objectContaining({ entityId: "t2", field: "groupParentId", value: null }),
  );
});

test("no double-count: computeNetWorth is IDENTICAL before/after group and after ungroup", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1", 1000_00);
  addAccount(db, "a2", 0);
  addTxn(db, "t1", "a1", -500_00, "2026-02-01");
  addTxn(db, "t2", "a2", -300_00, "2026-02-02");
  addTxn(db, "t3", "a1", 200_00, "2026-02-03");

  const before = computeNetWorth(db);

  const parentId = (
    (await (
      await group(app, { ids: ["t1", "t2"], date: "2026-02-01" })
    ).json()) as { parent: { id: string } }
  ).parent.id;

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
  const parentId = (
    (await (
      await group(app, { ids: ["t1", "t2"], date: "2026-02-01" })
    ).json()) as { parent: { id: string } }
  ).parent.id;
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
  addTxn(db, "split_c", "a1", -50_00, "2026-02-04", "split_p"); // split child
  addTxn(db, "split_c2", "a1", -50_00, "2026-02-04", "split_p");
  db.update(schema.transactions)
    .set({ splitTotalCents: -100_00 })
    .where(eq(schema.transactions.id, "split_p"))
    .run();

  // fewer than 2 exist
  expect(
    (await group(app, { ids: ["t1", "nope"], date: "2026-02-01" })).status,
  ).toBe(400);

  // a split child cannot be grouped
  expect(
    (await group(app, { ids: ["t1", "split_c"], date: "2026-02-01" })).status,
  ).toBe(400);

  // group t1+t2, then try to regroup an already-grouped row
  const parentId = (
    (await (
      await group(app, { ids: ["t1", "t2"], date: "2026-02-01" })
    ).json()) as { parent: { id: string } }
  ).parent.id;
  expect(
    (await group(app, { ids: ["t1", "split_p"], date: "2026-02-01" })).status,
  ).toBe(400);

  // a group parent cannot be nested into another group
  addTxn(db, "t4", "a1", -10_00, "2026-02-05");
  expect(
    (await group(app, { ids: [parentId, "t4"], date: "2026-02-01" })).status,
  ).toBe(400);
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
  db.update(schema.transactions)
    .set({ splitTotalCents: -100_00 })
    .where(eq(schema.transactions.id, "sp"))
    .run();
  addTxn(db, "g1", "a1", -25_00, "2026-02-11");
  addTxn(db, "g2", "a1", -25_00, "2026-02-11");

  const before = computeNetWorth(db);
  await group(app, { ids: ["g1", "g2"], date: "2026-02-11" });
  // Split rows untouched; net worth unchanged (split children still excluded,
  // group parent contributes 0).
  const sp = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, "sp"))
    .get();
  expect(sp?.parentId).toBeNull();
  expect(sp?.groupParentId).toBeNull();
  const sc1 = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.id, "sc1"))
    .get();
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
  const primary = (
    (await res.json()) as {
      transaction: { id: string; transferGroupId: string };
    }
  ).transaction;

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

  expect(db.select().from(schema.syncChanges).all()).toHaveLength(2);
  expect(new Set(lastSyncOps(db).map((op) => op.entityId))).toEqual(
    new Set([a1Leg.id, a2Leg.id]),
  );
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
  const primary = (
    (await (
      await postTxn(app, {
        accountId: "a1",
        transferAccountId: "a2",
        amountCents: -500_00,
        date: "2026-03-01",
        notes: "orig",
      })
    ).json()) as { transaction: { id: string; transferGroupId: string } }
  ).transaction;

  const legs = transferLegs(db, primary.transferGroupId);
  const primaryLeg = legs.find((l) => l.id === primary.id)!;
  const siblingId = legs.find((l) => l.id !== primary.id)!.id;

  const eventsBefore = db.select().from(schema.syncChanges).all().length;

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

  // One PATCH authors one compound event containing both legs.
  const eventsAfter = db.select().from(schema.syncChanges).all().length;
  expect(eventsAfter - eventsBefore).toBe(1);

  // Editing the OTHER leg propagates back symmetrically (still one hop).
  const res2 = await patchTxn(app, siblingId, { amountCents: 200_00 });
  expect(res2.status).toBe(200);
  expect(rowById(db, siblingId)!.amountCents).toBe(200_00);
  expect(rowById(db, primaryLeg.id)!.amountCents).toBe(-200_00);
  const eventsFinal = db.select().from(schema.syncChanges).all().length;
  expect(eventsFinal - eventsAfter).toBe(1);
});

test("transfer delete: removing either leg removes both + logs two deletes", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addAccount(db, "a2");
  const primary = (
    (await (
      await postTxn(app, {
        accountId: "a1",
        transferAccountId: "a2",
        amountCents: -500_00,
        date: "2026-03-01",
      })
    ).json()) as { transaction: { id: string; transferGroupId: string } }
  ).transaction;
  const legs = transferLegs(db, primary.transferGroupId);
  const siblingId = legs.find((l) => l.id !== primary.id)!.id;

  const res = await deleteTxn(app, siblingId); // delete the mirror leg
  expect(res.status).toBe(200);

  // Both legs gone.
  expect(rowById(db, primary.id)).toBeUndefined();
  expect(rowById(db, siblingId)).toBeUndefined();

  const deletes = syncOps(db).filter(
    (op) => op.field === "$exists" && op.value === false,
  );
  expect(deletes.some((op) => op.entityId === primary.id)).toBe(true);
  expect(deletes.some((op) => op.entityId === siblingId)).toBe(true);
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
  db.insert(schema.categoryGroups)
    .values({ id: "g1", name: "Everyday", sortOrder: 0 })
    .run();
  db.insert(schema.categories)
    .values({ id: "cat1", name: "One", groupId: "g1" })
    .run();
  db.insert(schema.categories)
    .values({ id: "cat2", name: "Two", groupId: "g1" })
    .run();

  // Create: single row, one event target, no sibling.
  const created = (
    (await (
      await postTxn(app, {
        accountId: "a1",
        amountCents: -250_00,
        date: "2026-03-01",
        categoryId: "cat1",
      })
    ).json()) as { transaction: { id: string } }
  ).transaction;
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

  // Delete: exactly one row removed and one lifecycle tombstone authored.
  const del = await deleteTxn(app, created.id);
  expect(del.status).toBe(200);
  expect(rowById(db, created.id)).toBeUndefined();
  expect(syncOps(db)).toContainEqual(
    expect.objectContaining({
      entityId: created.id,
      field: "$exists",
      value: false,
    }),
  );
});

// ── FIX 6/7: /v1/summary excludes splits and transfers ─────────────────────

async function summaryOf(app: ReturnType<typeof makeApp>["app"]) {
  return (await (await app.request("/v1/summary")).json()) as {
    incomeCents: number;
    expenseCents: number;
    netCents: number;
  };
}

test("FIX 6: /v1/summary counts a split parent once, not parent+children", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addTxn(db, "sp", "a1", -100_00, "2026-02-10");
  addTxn(db, "sc1", "a1", -60_00, "2026-02-10", "sp");
  addTxn(db, "sc2", "a1", -40_00, "2026-02-10", "sp");

  const s = await summaryOf(app);
  // Net is -100 (parent only), NOT -200 (parent + both children).
  expect(s.expenseCents).toBe(-100_00);
  expect(s.netCents).toBe(-100_00);
});

test("FIX 7: /v1/summary excludes transfer legs from income and expense", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addAccount(db, "a2");
  addTxn(db, "spend", "a1", -200_00, "2026-02-01"); // a real expense to anchor

  await postTxn(app, {
    accountId: "a1",
    transferAccountId: "a2",
    amountCents: -500_00,
    date: "2026-02-02",
  });

  const s = await summaryOf(app);
  // The -500 out leg and +500 mirror leg both drop out.
  expect(s.expenseCents).toBe(-200_00);
  expect(s.incomeCents).toBe(0);
  expect(s.netCents).toBe(-200_00);
});

// ── FIX 11: group-parent amount invariant at the write layer ────────────────

test("FIX 11: PATCH cannot give a group parent real money", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addTxn(db, "t1", "a1", -500_00, "2026-02-01");
  addTxn(db, "t2", "a1", -300_00, "2026-02-02");
  const parentId = (
    (await (
      await group(app, { ids: ["t1", "t2"], date: "2026-02-01" })
    ).json()) as { parent: { id: string } }
  ).parent.id;

  // A non-zero amount is rejected; the parent stays at 0.
  const res = await patchTxn(app, parentId, { amountCents: -800_00 });
  expect(res.status).toBe(400);
  expect(rowById(db, parentId)!.amountCents).toBe(0);

  // Other fields remain patchable; amount is still forced to 0.
  const res2 = await patchTxn(app, parentId, { payeeName: "Renamed group" });
  expect(res2.status).toBe(200);
  const row = rowById(db, parentId)!;
  expect(row.amountCents).toBe(0);
  expect(row.payeeName).toBe("Renamed group");
  expect(row.isGroupParent).toBe(true);
});

test("FIX 11: POST overwriting a group parent forces amountCents back to 0", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addTxn(db, "t1", "a1", -500_00, "2026-02-01");
  addTxn(db, "t2", "a1", -300_00, "2026-02-02");
  const parentId = (
    (await (
      await group(app, { ids: ["t1", "t2"], date: "2026-02-01" })
    ).json()) as { parent: { id: string } }
  ).parent.id;

  const res = await postTxn(app, {
    id: parentId,
    accountId: "a1",
    amountCents: -800_00,
    date: "2026-02-01",
  });
  expect(res.status).toBe(201);
  const row = rowById(db, parentId)!;
  expect(row.amountCents).toBe(0); // forced, not -800
  expect(row.isGroupParent).toBe(true); // flag preserved
});

// ── FIX 2: reconcile lock covers BOTH transfer legs ─────────────────────────

test("FIX 2: a reconciled transfer sibling blocks PATCH/DELETE of the unlocked leg", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addAccount(db, "a2");
  const primary = (
    (await (
      await postTxn(app, {
        accountId: "a1",
        transferAccountId: "a2",
        amountCents: -500_00,
        date: "2026-03-01",
      })
    ).json()) as { transaction: { id: string; transferGroupId: string } }
  ).transaction;
  const legs = transferLegs(db, primary.transferGroupId);
  const aLeg = legs.find((l) => l.id === primary.id)!; // unlocked
  const bLeg = legs.find((l) => l.id !== primary.id)!; // will be locked

  // Reconcile (lock) only the B leg.
  db.update(schema.transactions)
    .set({ reconciled: true, cleared: true })
    .where(eq(schema.transactions.id, bLeg.id))
    .run();

  // PATCH the unlocked A leg → blocked by the locked sibling.
  const res = await patchTxn(app, aLeg.id, { amountCents: -600_00 });
  expect(res.status).toBe(409);
  expect(rowById(db, aLeg.id)!.amountCents).toBe(-500_00); // unchanged

  // force=true overrides.
  const resF = await patchTxn(app, aLeg.id, {
    amountCents: -600_00,
    force: true,
  });
  expect(resF.status).toBe(200);
  expect(rowById(db, aLeg.id)!.amountCents).toBe(-600_00);

  // DELETE the unlocked A leg → blocked without force.
  const del = await deleteTxn(app, aLeg.id);
  expect(del.status).toBe(409);
  expect(rowById(db, aLeg.id)).toBeDefined();

  // force=true deletes both legs.
  const delF = await app.request(`/v1/transactions/${aLeg.id}?force=true`, {
    method: "DELETE",
  });
  expect(delF.status).toBe(200);
  expect(rowById(db, aLeg.id)).toBeUndefined();
  expect(rowById(db, bLeg.id)).toBeUndefined();
});

// ── FIX 9: PATCH must not move a transfer leg to another account ─────────────

test("FIX 9: PATCH cannot move a transfer leg to another account", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addAccount(db, "a2");
  addAccount(db, "a3");
  const primary = (
    (await (
      await postTxn(app, {
        accountId: "a1",
        transferAccountId: "a2",
        amountCents: -500_00,
        date: "2026-03-01",
      })
    ).json()) as { transaction: { id: string; transferGroupId: string } }
  ).transaction;

  const res = await patchTxn(app, primary.id, {
    accountId: "a3",
    notes: "moved?",
  });
  expect(res.status).toBe(200);

  const row = rowById(db, primary.id)!;
  expect(row.accountId).toBe("a1"); // frozen despite the body
  expect(row.notes).toBe("moved?"); // other edits still apply
  expect(row.transferAccountId).toBe("a2");

  // Sibling linkage stays consistent: it still points back at a1.
  const sibling = transferLegs(db, primary.transferGroupId).find(
    (l) => l.id !== primary.id,
  )!;
  expect(sibling.transferAccountId).toBe("a1");
  expect(sibling.accountId).toBe("a2");
});

// ── FIX 8: transfer create validation ───────────────────────────────────────

test("FIX 8: transfer to a nonexistent target account is 400 (nothing written)", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  const res = await postTxn(app, {
    accountId: "a1",
    transferAccountId: "ghost",
    amountCents: -100_00,
    date: "2026-03-01",
  });
  expect(res.status).toBe(400);
  expect(db.select().from(schema.transactions).all()).toHaveLength(0);
});

test("FIX 8: transfer from a nonexistent primary account is 400", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a2");
  const res = await postTxn(app, {
    accountId: "ghost",
    transferAccountId: "a2",
    amountCents: -100_00,
    date: "2026-03-01",
  });
  expect(res.status).toBe(400);
  expect(db.select().from(schema.transactions).all()).toHaveLength(0);
});

test("FIX 8: parentId/splitTotalCents are stripped on a transfer create", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addAccount(db, "a2");
  const primary = (
    (await (
      await postTxn(app, {
        accountId: "a1",
        transferAccountId: "a2",
        amountCents: -500_00,
        date: "2026-03-01",
        parentId: "some-parent",
        splitTotalCents: 999_00,
      })
    ).json()) as { transaction: { transferGroupId: string } }
  ).transaction;

  const legs = transferLegs(db, primary.transferGroupId);
  expect(legs).toHaveLength(2);
  for (const l of legs) {
    expect(l.parentId).toBeNull();
    expect(l.splitTotalCents).toBeNull();
  }
});

test("#47: deleting a split parent cascades its children + emits a tombstone for each", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  // Split parent -100 carries the money; two children hold the category split.
  addTxn(db, "p", "a1", -10000, "2026-07-10");
  addTxn(db, "c1", "a1", -6000, "2026-07-10", "p");
  addTxn(db, "c2", "a1", -4000, "2026-07-10", "p");
  db.update(schema.transactions)
    .set({ splitTotalCents: -10000 })
    .where(eq(schema.transactions.id, "p"))
    .run();

  const res = await deleteTxn(app, "p");
  expect(res.status).toBe(200);

  // Parent and both children are gone — no orphan rows left behind.
  expect(rowById(db, "p")).toBeUndefined();
  expect(rowById(db, "c1")).toBeUndefined();
  expect(rowById(db, "c2")).toBeUndefined();

  const deletes = syncOps(db)
    .filter((op) => op.resource === "transactions" && op.field === "$exists" && op.value === false)
    .map((op) => op.entityId);
  expect(new Set(deletes)).toEqual(new Set(["p", "c1", "c2"]));
});

test("#47: deleting a group parent ungroups its children (they survive, groupParentId cleared)", async () => {
  const { app, db } = makeApp();
  addAccount(db, "a1");
  addTxn(db, "g1", "a1", -5000, "2026-07-10");
  addTxn(db, "g2", "a1", -3000, "2026-07-11");
  const parentId = (
    (await (
      await app.request("/v1/transactions/group", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ids: ["g1", "g2"],
          date: "2026-07-10",
          payeeName: "Card payment",
        }),
      })
    ).json()) as { parent: { id: string } }
  ).parent.id;

  const res = await deleteTxn(app, parentId);
  expect(res.status).toBe(200);

  // The virtual parent is gone; the real child txns survive with no dangling link.
  expect(rowById(db, parentId)).toBeUndefined();
  expect(rowById(db, "g1")?.groupParentId).toBeNull();
  expect(rowById(db, "g2")?.groupParentId).toBeNull();
});
