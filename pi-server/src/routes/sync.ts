import { and, eq, gt, isNull, ne, or } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import type { DbOrTx } from "../repos/changelog.ts";
import {
  accounts,
  budgets,
  categories,
  categoryGroups,
  changeLog,
  payees,
  recurrences,
  ruleMatches,
  rules,
  tags,
  transactions,
  transactionTags,
} from "../db/schema.ts";
import { recordChange } from "../repos/changelog.ts";

export const syncRouter = new Hono<AppEnv>();

// GET /v1/sync/changes?since=<id>&limit=500&clientId=<self>
//
// Pulls server-side change-log rows after the cursor. When the caller
// passes their own clientId, we filter out rows they originated so
// they don't echo their own pushes back at themselves.
syncRouter.get("/changes", (c) => {
  const db = c.get("db");
  const since = Number(c.req.query("since") ?? "0");
  const limit = Math.min(Number(c.req.query("limit") ?? "500"), 5000);
  const callerId = c.req.query("clientId");
  const cursor = Number.isFinite(since) ? since : 0;

  const baseFilter = gt(changeLog.id, cursor);
  const filter = callerId
    ? and(
        baseFilter,
        or(isNull(changeLog.clientId), ne(changeLog.clientId, callerId)),
      )
    : baseFilter;

  const rows = db
    .select()
    .from(changeLog)
    .where(filter)
    .orderBy(changeLog.id)
    .limit(limit)
    .all();

  // Parse payload server-side so clients don't have to JSON.parse a
  // string nested in a JSON response.
  const changes = rows.map((row) => ({
    ...row,
    payload: row.payload === null ? null : JSON.parse(row.payload),
  }));
  const newCursor = changes.length > 0 ? changes[changes.length - 1]!.id : cursor;
  return c.json({ changes, cursor: newCursor });
});

// Per-resource handlers used by /v1/sync/push to actually apply
// upserts/deletes to the data tables. Keeps the data store and the
// change log in agreement, all inside the same transaction.
type Resource =
  | "accounts"
  | "category_groups"
  | "categories"
  | "payees"
  | "transactions"
  | "tags"
  | "transaction_tags"
  | "rules"
  | "rule_matches"
  | "budgets"
  | "recurrences";

const APPLIERS: Record<
  Resource,
  {
    upsert: (tx: DbOrTx, payload: unknown) => void;
    remove: (tx: DbOrTx, id: string) => void;
  }
> = {
  accounts: {
    upsert: (tx, payload) => {
      const row = payload as typeof accounts.$inferInsert;
      tx.insert(accounts).values(row).onConflictDoUpdate({
        target: accounts.id,
        set: row,
      }).run();
    },
    remove: (tx, id) => {
      tx.delete(accounts).where(eq(accounts.id, id)).run();
    },
  },
  category_groups: {
    upsert: (tx, payload) => {
      const row = payload as typeof categoryGroups.$inferInsert;
      tx.insert(categoryGroups).values(row).onConflictDoUpdate({
        target: categoryGroups.id,
        set: row,
      }).run();
    },
    remove: (tx, id) => {
      tx.delete(categoryGroups).where(eq(categoryGroups.id, id)).run();
    },
  },
  categories: {
    upsert: (tx, payload) => {
      const row = payload as typeof categories.$inferInsert;
      tx.insert(categories).values(row).onConflictDoUpdate({
        target: categories.id,
        set: row,
      }).run();
    },
    remove: (tx, id) => {
      tx.delete(categories).where(eq(categories.id, id)).run();
    },
  },
  payees: {
    upsert: (tx, payload) => {
      const row = payload as typeof payees.$inferInsert;
      tx.insert(payees).values(row).onConflictDoUpdate({
        target: payees.id,
        set: row,
      }).run();
    },
    remove: (tx, id) => {
      tx.delete(payees).where(eq(payees.id, id)).run();
    },
  },
  transactions: {
    upsert: (tx, payload) => {
      const row = payload as typeof transactions.$inferInsert;
      tx.insert(transactions).values(row).onConflictDoUpdate({
        target: transactions.id,
        set: row,
      }).run();
    },
    remove: (tx, id) => {
      tx.delete(transactions).where(eq(transactions.id, id)).run();
    },
  },
  tags: {
    upsert: (tx, payload) => {
      const row = payload as typeof tags.$inferInsert;
      tx.insert(tags).values(row).onConflictDoUpdate({
        target: tags.id,
        set: row,
      }).run();
    },
    remove: (tx, id) => {
      tx.delete(tags).where(eq(tags.id, id)).run();
    },
  },
  transaction_tags: {
    upsert: (tx, payload) => {
      const row = payload as typeof transactionTags.$inferInsert;
      tx.insert(transactionTags).values(row).onConflictDoUpdate({
        target: transactionTags.id,
        set: row,
      }).run();
    },
    remove: (tx, id) => {
      tx.delete(transactionTags).where(eq(transactionTags.id, id)).run();
    },
  },
  rules: {
    upsert: (tx, payload) => {
      const row = payload as typeof rules.$inferInsert;
      tx.insert(rules).values(row).onConflictDoUpdate({
        target: rules.id,
        set: row,
      }).run();
    },
    remove: (tx, id) => {
      tx.delete(rules).where(eq(rules.id, id)).run();
    },
  },
  rule_matches: {
    upsert: (tx, payload) => {
      const row = payload as typeof ruleMatches.$inferInsert;
      tx.insert(ruleMatches).values(row).onConflictDoUpdate({
        target: ruleMatches.id,
        set: row,
      }).run();
    },
    remove: (tx, id) => {
      tx.delete(ruleMatches).where(eq(ruleMatches.id, id)).run();
    },
  },
  budgets: {
    upsert: (tx, payload) => {
      const row = payload as typeof budgets.$inferInsert;
      tx.insert(budgets).values(row).onConflictDoUpdate({
        target: budgets.id,
        set: row,
      }).run();
    },
    remove: (tx, id) => {
      tx.delete(budgets).where(eq(budgets.id, id)).run();
    },
  },
  recurrences: {
    upsert: (tx, payload) => {
      const row = payload as typeof recurrences.$inferInsert;
      tx.insert(recurrences).values(row).onConflictDoUpdate({
        target: recurrences.id,
        set: row,
      }).run();
    },
    remove: (tx, id) => {
      tx.delete(recurrences).where(eq(recurrences.id, id)).run();
    },
  },
};

const RESOURCES = Object.keys(APPLIERS) as Resource[];

const pushBodySchema = z.object({
  clientId: z.string().min(1),
  changes: z
    .array(
      z.object({
        clientChangeId: z.string().min(1),
        resource: z.enum(RESOURCES as [Resource, ...Resource[]]),
        resourceId: z.string().min(1),
        op: z.enum(["upsert", "delete"]),
        payload: z.unknown().nullable().optional(),
      }),
    )
    .min(1),
});

// POST /v1/sync/push
//
// Apply each change to its data table AND append to change_log, all
// inside one transaction. Idempotent: a retried batch with the same
// clientId+clientChangeId tuple will be silently skipped by the
// unique index on change_log.
syncRouter.post("/push", async (c) => {
  const db = c.get("db");
  const parsed = pushBodySchema.parse(await c.req.json());
  let appliedCount = 0;
  let dedupedCount = 0;

  db.transaction((tx) => {
    for (const change of parsed.changes) {
      // Dedup gate first: if we've already seen this (clientId,
      // clientChangeId), skip both the apply and the log re-insert.
      const recorded = recordChange(tx, {
        resource: change.resource,
        resourceId: change.resourceId,
        op: change.op,
        payload: change.payload ?? undefined,
        clientId: parsed.clientId,
        clientChangeId: change.clientChangeId,
      });
      if (!recorded) {
        dedupedCount += 1;
        continue;
      }
      const applier = APPLIERS[change.resource];
      if (change.op === "upsert") {
        if (change.payload == null) {
          throw new Error(
            `Missing payload for upsert ${change.resource}/${change.resourceId}`,
          );
        }
        applier.upsert(tx, change.payload);
      } else {
        applier.remove(tx, change.resourceId);
      }
      appliedCount += 1;
    }
  });

  return c.json({
    accepted: parsed.changes.length,
    applied: appliedCount,
    deduped: dedupedCount,
  });
});
