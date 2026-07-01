import { and, eq, gt, lte, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import type { DbOrTx } from "../repos/changelog.ts";
import { runExport } from "../destinations/run.ts";
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
import { isChangeRecorded, recordChange } from "../repos/changelog.ts";

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

  // Scan the window by id (INCLUDING the caller's own rows) so the cursor can
  // advance past self-originated rows. Self rows are filtered from `changes`
  // below, but the cursor moves to the last scanned id — otherwise a page that
  // is entirely self-originated returns empty and the cursor never advances,
  // forcing endless re-scans from the same point.
  const windowRows = db
    .select()
    .from(changeLog)
    .where(baseFilter)
    .orderBy(changeLog.id)
    .limit(limit)
    .all();

  const visible = callerId
    ? windowRows.filter(
        (row) => row.clientId === null || row.clientId !== callerId,
      )
    : windowRows;

  // Parse payload server-side so clients don't have to JSON.parse a
  // string nested in a JSON response.
  const changes = visible.map((row) => ({
    ...row,
    payload: row.payload === null ? null : JSON.parse(row.payload),
  }));
  const newCursor =
    windowRows.length > 0 ? windowRows[windowRows.length - 1]!.id : cursor;
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

// SQL-level last-write-wins for the synced resources that carry updated_at:
// an upsert only overwrites when the incoming row is newer-or-equal, and a
// delete only fires when the client's tombstone time is >= the stored row.
// Single statement, no read — stale offline pushes can no longer clobber.
//
// Each method returns whether the data table actually changed: RETURNING emits
// a row only for an applied insert/update/delete, so a stale no-op (setWhere
// false, or a guarded delete that matched nothing) returns false. The push
// handler uses this to record a change_log row ONLY for mutations that won.
type Applier = {
  upsert: (tx: DbOrTx, payload: unknown) => boolean;
  remove: (tx: DbOrTx, id: string, payload?: unknown) => boolean;
};

function lwwApplier(table: any): Applier {
  return {
    upsert: (tx, payload) => {
      const row = payload as Record<string, unknown>;
      return (
        tx
          .insert(table)
          .values(row)
          .onConflictDoUpdate({
            target: table.id,
            set: row,
            setWhere: sql`excluded.updated_at >= ${table.updatedAt}`,
          })
          .returning({ id: table.id })
          .all().length > 0
      );
    },
    remove: (tx, id, payload) => {
      const ts = (payload as { updatedAt?: unknown } | null | undefined)
        ?.updatedAt;
      return (
        tx
          .delete(table)
          .where(
            typeof ts === "number"
              ? and(eq(table.id, id), lte(table.updatedAt, ts))
              : eq(table.id, id),
          )
          .returning({ id: table.id })
          .all().length > 0
      );
    },
  };
}

const APPLIERS: Record<Resource, Applier> = {
  accounts: lwwApplier(accounts),
  category_groups: {
    // Category groups carry no updated_at, so they always apply unconditionally.
    upsert: (tx, payload) => {
      const row = payload as typeof categoryGroups.$inferInsert;
      tx.insert(categoryGroups).values(row).onConflictDoUpdate({
        target: categoryGroups.id,
        set: row,
      }).run();
      return true;
    },
    remove: (tx, id) => {
      tx.delete(categoryGroups).where(eq(categoryGroups.id, id)).run();
      return true;
    },
  },
  categories: lwwApplier(categories),
  payees: lwwApplier(payees),
  transactions: lwwApplier(transactions),
  tags: lwwApplier(tags),
  transaction_tags: lwwApplier(transactionTags),
  rules: lwwApplier(rules),
  rule_matches: lwwApplier(ruleMatches),
  budgets: lwwApplier(budgets),
  recurrences: lwwApplier(recurrences),
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
// For each change: dedup retries, apply the data mutation (conditional LWW),
// and append change_log ONLY when the mutation actually won — all inside one
// transaction. Idempotent: a retried batch with the same clientId+
// clientChangeId tuple is skipped before touching data tables. A new-but-stale
// write (older updatedAt than the server row) applies nothing and emits no
// change_log row, so losing writes don't propagate to other clients.
syncRouter.post("/push", async (c) => {
  const db = c.get("db");
  const config = c.get("config");
  const parsed = pushBodySchema.parse(await c.req.json());
  let appliedCount = 0;
  let dedupedCount = 0;
  let staleCount = 0;

  db.transaction((tx) => {
    for (const change of parsed.changes) {
      // 1. Idempotency gate: already-processed retry → skip entirely.
      if (isChangeRecorded(tx, parsed.clientId, change.clientChangeId)) {
        dedupedCount += 1;
        continue;
      }

      // 2. Apply the data mutation. `changed` is false for a stale no-op.
      const applier = APPLIERS[change.resource];
      let changed: boolean;
      if (change.op === "upsert") {
        if (change.payload == null) {
          throw new Error(
            `Missing payload for upsert ${change.resource}/${change.resourceId}`,
          );
        }
        changed = applier.upsert(tx, change.payload);
      } else {
        changed = applier.remove(tx, change.resourceId, change.payload);
      }

      // 3. Record the change only when it actually mutated server state, so a
      //    losing stale write neither advances the changelog nor echoes to
      //    other clients as a (stale) change.
      if (!changed) {
        staleCount += 1;
        continue;
      }
      recordChange(tx, {
        resource: change.resource,
        resourceId: change.resourceId,
        op: change.op,
        payload: change.payload ?? undefined,
        clientId: parsed.clientId,
        clientChangeId: change.clientChangeId,
      });
      appliedCount += 1;
    }
  });

  // Fan out to every enabled destination (Google Sheet, Actual Budget, …)
  // after a successful sync. Fire-and-forget so the client's push isn't blocked
  // on the external round-trips; each destination upserts by a stable id, so an
  // occasional extra run is harmless. runExport no-ops for any destination
  // that isn't configured.
  if (appliedCount > 0) {
    void runExport(db, config).catch((e) =>
      console.warn(`export push failed: ${e}`),
    );
  }

  return c.json({
    accepted: parsed.changes.length,
    applied: appliedCount,
    deduped: dedupedCount,
    stale: staleCount,
  });
});
