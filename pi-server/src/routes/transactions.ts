import { and, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { transactions } from "../db/schema.ts";
import { newId, nowMs, recordChange } from "../repos/changelog.ts";
import { learnCategory } from "../rules/learn.ts";
import {
  createTransferPair,
  deletePair,
  findSibling,
  propagateEdit,
} from "../transactions/transfers.ts";
import { nameField, textField } from "./_fields.ts";

const upsertSchema = z.object({
  id: z.string().min(1).optional(),
  accountId: z.string().min(1),
  categoryId: z.string().nullable().optional(),
  payeeId: z.string().nullable().optional(),
  payeeName: nameField.nullable().optional(),
  amountCents: z.number().int(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: textField.nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  locationName: textField.nullable().optional(),
  cleared: z.boolean().default(false),
  origin: z.string().max(64).default("manual"),
  originRef: z.string().max(256).nullable().optional(),
  transferAccountId: z.string().nullable().optional(),
  transferGroupId: z.string().nullable().optional(),
  parentId: z.string().nullable().optional(),
  splitTotalCents: z.number().int().nullable().optional(),
  originalAmountCents: z.number().int().nullable().optional(),
  originalCurrency: z.string().max(8).nullable().optional(),
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const groupSchema = z.object({
  ids: z.array(z.string().min(1)).min(2),
  date: z.string().regex(DATE_RE),
  payeeName: nameField.nullable().optional(),
  categoryId: z.string().nullable().optional(),
});

export const transactionsRouter = new Hono<AppEnv>();

transactionsRouter.get("/", (c) => {
  const db = c.get("db");
  // Clamp limit to a sane range; a NaN/huge/negative value can't blow up the query.
  const rawLimit = Number(c.req.query("limit") ?? "200");
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 1000)
    : 200;
  const startDate = c.req.query("startDate");
  const endDate = c.req.query("endDate");
  const accountId = c.req.query("accountId");
  if (
    (startDate && !DATE_RE.test(startDate)) ||
    (endDate && !DATE_RE.test(endDate))
  ) {
    return c.json({ error: "startDate/endDate must be YYYY-MM-DD" }, 400);
  }
  const where = [
    startDate ? gte(transactions.date, startDate) : undefined,
    endDate ? lte(transactions.date, endDate) : undefined,
    accountId ? eq(transactions.accountId, accountId) : undefined,
  ].filter((x): x is NonNullable<typeof x> => x !== undefined);
  let q = db
    .select()
    .from(transactions)
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(limit);
  if (where.length > 0) q = q.where(and(...where)) as typeof q;
  return c.json({ transactions: q.all() });
});

// Grouping (#46): collapse N independent txns under one virtual parent. The
// parent NEVER carries money — amountCents is always 0 so no aggregation query
// can double-count it. Children keep their own rows/amounts and stay counted
// (they keep parentId IS NULL). The group total is DERIVED from children by
// clients, never stored. Registered before the /:id routes so the static paths
// win the match.
transactionsRouter.post("/group", async (c) => {
  const db = c.get("db");
  const parsed = groupSchema.parse(await c.req.json());
  const uniqueIds = [...new Set(parsed.ids)];

  const found = db
    .select()
    .from(transactions)
    .where(inArray(transactions.id, uniqueIds))
    .all();
  const byId = new Map(found.map((r) => [r.id, r]));
  // Preserve caller order so accountId comes from the first requested child.
  const rows = uniqueIds
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r !== undefined);

  if (rows.length < 2) {
    return c.json(
      { error: "Need at least 2 existing transactions to group" },
      400,
    );
  }
  for (const r of rows) {
    if (r.isGroupParent) {
      return c.json({ error: "Cannot group a group parent" }, 400);
    }
    if (r.groupParentId) {
      return c.json({ error: "Transaction is already grouped" }, 400);
    }
    if (r.parentId) {
      return c.json({ error: "Cannot group a split child" }, 400);
    }
  }

  const parentId = newId();
  const at = nowMs();
  const groupTotalCents = rows.reduce((sum, r) => sum + r.amountCents, 0);
  const parent = {
    id: parentId,
    accountId: rows[0]!.accountId,
    categoryId: parsed.categoryId ?? null,
    payeeId: null,
    payeeName: parsed.payeeName ?? "Group",
    amountCents: 0,
    date: parsed.date,
    notes: null,
    latitude: null,
    longitude: null,
    locationName: null,
    cleared: false,
    reconciled: false,
    origin: "group",
    originRef: null,
    importedId: null,
    transferAccountId: null,
    transferGroupId: null,
    parentId: null,
    splitTotalCents: null,
    groupParentId: null,
    isGroupParent: true,
    originalAmountCents: null,
    originalCurrency: null,
    createdAt: at,
    updatedAt: at,
  };

  db.transaction((tx) => {
    tx.insert(transactions).values(parent).run();
    recordChange(tx, {
      resource: "transactions",
      resourceId: parentId,
      op: "upsert",
      payload: parent,
    });
    for (const r of rows) {
      const next = { ...r, groupParentId: parentId, updatedAt: at };
      tx.update(transactions).set(next).where(eq(transactions.id, r.id)).run();
      recordChange(tx, {
        resource: "transactions",
        resourceId: r.id,
        op: "upsert",
        payload: next,
      });
    }
  });

  return c.json({ parent, childIds: rows.map((r) => r.id), groupTotalCents }, 201);
});

transactionsRouter.post("/ungroup/:parentId", (c) => {
  const db = c.get("db");
  const parentId = c.req.param("parentId");
  const parent = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, parentId))
    .get();
  if (!parent || !parent.isGroupParent) {
    return c.json({ error: "Not a group parent" }, 404);
  }

  const children = db
    .select()
    .from(transactions)
    .where(eq(transactions.groupParentId, parentId))
    .all();
  const at = nowMs();

  db.transaction((tx) => {
    for (const ch of children) {
      const next = { ...ch, groupParentId: null, updatedAt: at };
      tx.update(transactions).set(next).where(eq(transactions.id, ch.id)).run();
      recordChange(tx, {
        resource: "transactions",
        resourceId: ch.id,
        op: "upsert",
        payload: next,
      });
    }
    tx.delete(transactions).where(eq(transactions.id, parentId)).run();
    recordChange(tx, {
      resource: "transactions",
      resourceId: parentId,
      op: "delete",
    });
  });

  return c.json({ ungrouped: true, childIds: children.map((ch) => ch.id) });
});

transactionsRouter.get("/:id", (c) => {
  const db = c.get("db");
  const row = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, c.req.param("id")))
    .get();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ transaction: row });
});

transactionsRouter.post("/", async (c) => {
  const db = c.get("db");
  const parsed = upsertSchema.parse(await c.req.json());
  const id = parsed.id ?? newId();
  const at = nowMs();
  const row = {
    id,
    accountId: parsed.accountId,
    categoryId: parsed.categoryId ?? null,
    payeeId: parsed.payeeId ?? null,
    payeeName: parsed.payeeName ?? null,
    amountCents: parsed.amountCents,
    date: parsed.date,
    notes: parsed.notes ?? null,
    latitude: parsed.latitude ?? null,
    longitude: parsed.longitude ?? null,
    locationName: parsed.locationName ?? null,
    cleared: parsed.cleared,
    origin: parsed.origin,
    originRef: parsed.originRef ?? null,
    transferAccountId: parsed.transferAccountId ?? null,
    transferGroupId: parsed.transferGroupId ?? null,
    parentId: parsed.parentId ?? null,
    splitTotalCents: parsed.splitTotalCents ?? null,
    originalAmountCents: parsed.originalAmountCents ?? null,
    originalCurrency: parsed.originalCurrency ?? null,
    createdAt: at,
    updatedAt: at,
  };

  // Transfer create (#41): when the body names a target account, this is a
  // transfer, not a plain txn. The helper mirrors it into the target account
  // (negated amount, shared transferGroupId, categories cleared) and writes
  // BOTH legs + change_log rows in one transaction. We return the primary leg.
  if (row.transferAccountId) {
    if (row.transferAccountId === row.accountId) {
      return c.json(
        { error: "transferAccountId must differ from accountId" },
        400,
      );
    }
    let primary = row;
    db.transaction((tx) => {
      primary = createTransferPair(tx, row).primary as typeof row;
    });
    return c.json({ transaction: primary }, 201);
  }

  db.transaction((tx) => {
    tx.insert(transactions).values(row).onConflictDoUpdate({
      target: transactions.id,
      set: row,
    }).run();
    recordChange(tx, {
      resource: "transactions",
      resourceId: id,
      op: "upsert",
      payload: row,
    });
  });
  return c.json({ transaction: row }, 201);
});

transactionsRouter.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const raw = await c.req.json();
  // Reconciliation lock (#42): force can arrive as ?force=true or force:true in
  // the body. Zod strips the extra `force` key when parsing the partial.
  const forced =
    c.req.query("force") === "true" ||
    (raw != null && typeof raw === "object" && (raw as { force?: unknown }).force === true);
  const partial = upsertSchema.partial().parse(raw);
  const existing = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  // Lock check goes FIRST — before transfer propagation — so a locked leg can't
  // be edited without force.
  if (existing.reconciled && !forced) {
    return c.json(
      { error: "Transaction is reconciled (locked). Pass force=true to override." },
      409,
    );
  }
  const next = { ...existing, ...partial, updatedAt: nowMs() };

  // Transfer edit (#41): when the target is part of a transfer, keep its
  // sibling in lock-step — amount negated, date/notes mirrored, category null
  // on both legs — in one transaction. propagateEdit writes the sibling
  // directly (not via this route), so there is no recursion.
  //
  // v1 limitation: PATCH cannot convert a transfer to/from a plain txn or move
  // it to different accounts. Any attempt to change transferAccountId /
  // transferGroupId on an existing transfer is ignored (the linkage is frozen).
  if (existing.transferGroupId) {
    next.transferGroupId = existing.transferGroupId;
    next.transferAccountId = existing.transferAccountId;
    next.categoryId = null;
    const sibling = findSibling(db, existing);
    db.transaction((tx) => {
      tx.update(transactions).set(next).where(eq(transactions.id, id)).run();
      recordChange(tx, {
        resource: "transactions",
        resourceId: id,
        op: "upsert",
        payload: next,
      });
      // Guard half-linked legacy data: if the sibling is missing, treat this
      // as a normal row and skip propagation rather than crash.
      if (sibling) propagateEdit(tx, next, sibling);
    });
    return c.json({ transaction: next });
  }

  db.transaction((tx) => {
    tx.update(transactions).set(next).where(eq(transactions.id, id)).run();
    recordChange(tx, {
      resource: "transactions",
      resourceId: id,
      op: "upsert",
      payload: next,
    });
  });

  // #39: when this edit set a category, auto-learn a payee→category rule from
  // the payee's recent history. This is the primary server-side categorize path
  // (web register inline edit). Best-effort and run AFTER the write commits so
  // the just-categorized row is counted; it never throws into this handler.
  if (partial.categoryId != null && next.categoryId != null) {
    learnCategory(db, {
      payeeId: next.payeeId,
      payeeName: next.payeeName,
      categoryId: next.categoryId,
    });
  }

  return c.json({ transaction: next });
});

transactionsRouter.delete("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const existing = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();
  if (!existing) return c.json({ error: "Not found" }, 404);

  // Reconciliation lock (#42): a reconciled row is frozen unless ?force=true.
  // Check FIRST, before transfer handling, so a locked leg can't be deleted.
  if (existing.reconciled && c.req.query("force") !== "true") {
    return c.json(
      { error: "Transaction is reconciled (locked). Pass force=true to override." },
      409,
    );
  }

  // Transfer delete (#41): removing either leg removes BOTH, with a change_log
  // delete for each, in one transaction. A missing sibling (legacy half-link)
  // is tolerated — deletePair just removes the one row it has.
  if (existing.transferGroupId) {
    const sibling = findSibling(db, existing);
    db.transaction((tx) => {
      deletePair(tx, existing, sibling);
    });
    return c.json({ deleted: true, id });
  }

  db.transaction((tx) => {
    tx.delete(transactions).where(eq(transactions.id, id)).run();
    recordChange(tx, {
      resource: "transactions",
      resourceId: id,
      op: "delete",
    });
  });
  return c.json({ deleted: true, id });
});
