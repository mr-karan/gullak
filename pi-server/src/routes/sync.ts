import { and, eq, gte, lte, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
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
  syncEpochs,
  tags,
  transactions,
  transactionTags,
} from "../db/schema.ts";
import { isChangeRecorded, recordChange } from "../repos/changelog.ts";
import {
  SyncEpochConfigurationError,
  configuredWritableEpoch,
} from "../sync/epoch.ts";
import {
  normalizeLegacyTransactionTagMutation,
  observeLegacyClient,
} from "../sync/legacy.ts";

export const syncRouter = new Hono<AppEnv>();

function legacyProtocolGate(c: Context<AppEnv>): Response | null {
  const db = c.get("db");
  const mode = c.get("config").syncV2Mode;
  const active = db
    .select({ id: syncEpochs.id })
    .from(syncEpochs)
    .where(eq(syncEpochs.status, "active"))
    .get();
  // Durable DB state is the immediate traffic fence. This closes the operator
  // activation -> config deployment window: once the epoch commits active, no
  // v1 snapshot can be read or written even by an old server process.
  if (active !== undefined || mode === "active") {
    return c.json(
      {
        error: "upgrade_required",
        message: "Protocol-v1 snapshot sync is disabled for this sync epoch",
        requiredProtocol: 2,
      },
      426,
    );
  }
  try {
    configuredWritableEpoch(db, mode);
  } catch (error) {
    if (!(error instanceof SyncEpochConfigurationError)) throw error;
    return c.json(
      {
        error: "sync_v2_rollout_misconfigured",
        mode,
        reason: error.message,
      },
      503,
    );
  }
  return null;
}

// Negotiation is available before v2 is activated so a new app can safely
// decide whether to drain v1, wait, or bootstrap. The rollout mode is an
// explicit server config gate; merely applying the v2 schema migration never
// changes live sync behaviour.
syncRouter.get("/capabilities", (c) => {
  const db = c.get("db");
  const config = c.get("config");
  let epoch;
  try {
    epoch = configuredWritableEpoch(db, config.syncV2Mode);
  } catch (error) {
    if (!(error instanceof SyncEpochConfigurationError)) throw error;
    return c.json(
      {
        error: "sync_v2_rollout_misconfigured",
        mode: config.syncV2Mode,
        reason: error.message,
      },
      503,
    );
  }
  const v2Preferred = config.syncV2Mode !== "disabled";
  return c.json({
    preferredProtocol: v2Preferred ? 2 : 1,
    supportedProtocols: [1, 2],
    v1: {
      writes: config.syncV2Mode === "active" ? "upgrade_required" : "accepted",
    },
    v2: {
      mode: config.syncV2Mode,
      epoch: epoch?.id ?? null,
      epochStatus: epoch?.status ?? null,
      bootstrapRequired: v2Preferred,
    },
  });
});

// GET /v1/sync/changes?since=<id>&limit=500&clientId=<self>
//
// Pulls server-side change-log rows after the cursor. When the caller
// passes their own clientId, we filter out rows they originated so
// they don't echo their own pushes back at themselves.
syncRouter.get("/changes", (c) => {
  const db = c.get("db");
  const blocked = legacyProtocolGate(c);
  if (blocked !== null) return blocked;
  const since = Number(c.req.query("since") ?? "0");
  const limit = Math.min(Number(c.req.query("limit") ?? "500"), 5000);
  const callerId = c.req.query("clientId");
  const cursor = Number.isFinite(since) ? since : 0;
  if (callerId) {
    const observed = observeLegacyClient(db, callerId);
    if (!observed.accepted) {
      return c.json(
        {
          error: "legacy_inventory_sealed",
          message: "This legacy client is not in the sealed cutover inventory",
        },
        409,
      );
    }
  }

  const baseFilter = gte(changeLog.id, cursor);

  // Scan the window by id (INCLUDING the caller's own rows) so the cursor can
  // advance past self-originated rows. Self rows are filtered from `changes`
  // below, but the cursor moves to the last scanned id — otherwise a page that
  // is entirely self-originated returns empty and the cursor never advances,
  // forcing endless re-scans from the same point.
  //
  // Inclusive (gte) prevents the boundary-gap bug where a row landing exactly
  // at the cursor is permanently skipped. The phone re-applies the last row
  // idempotently (LWW upsert by id).
  const windowRows = db
    .select()
    .from(changeLog)
    .where(baseFilter)
    .orderBy(changeLog.id)
    .limit(limit)
    .all();

  const callerVisible = callerId
    ? windowRows.filter(
        (row) => row.clientId === null || row.clientId !== callerId,
      )
    : windowRows;

  // Rules are intentionally non-replicated configuration in v2. Do not feed
  // historical rule/rule_match snapshots to old phones during the cutover
  // drain: production contains legacy payload shapes that current clients
  // cannot materialize, and one such permanent failure would hold the v1
  // cursor forever. The scan cursor still advances across these rows.
  const visible = callerVisible.filter(
    (row) => row.resource !== "rules" && row.resource !== "rule_matches",
  );

  // Parse payload server-side so clients don't have to JSON.parse a string
  // nested in a JSON response. A corrupt permanent payload is quarantined by
  // omission while the independently-scanned cursor advances past it. Sending
  // a null upsert would make v1 phones hold their cursor forever.
  const changes = visible.flatMap((row) => {
    if (row.payload === null) return [{ ...row, payload: null }];
    try {
      return [{ ...row, payload: JSON.parse(row.payload) }];
    } catch {
      console.warn(
        JSON.stringify({
          event: "sync_v1_pull_payload_quarantined",
          changeLogId: row.id,
          resource: row.resource,
          resourceId: row.resourceId,
          reason: "invalid_json",
        }),
      );
      return [];
    }
  });
  // Cursor is the last scanned row id. With the inclusive gte filter,
  // the next pull re-processes this row (safe — applies are idempotent).
  // The phone's allApplied guard decides whether to actually advance.
  const newCursor =
    windowRows.length > 0 ? windowRows[windowRows.length - 1]!.id : cursor;
  if (callerId) observeLegacyClient(db, callerId, { pullCursor: newCursor });
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
      tx.insert(categoryGroups)
        .values(row)
        .onConflictDoUpdate({
          target: categoryGroups.id,
          set: row,
        })
        .run();
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
  const blocked = legacyProtocolGate(c);
  if (blocked !== null) return blocked;
  const parsed = pushBodySchema.parse(await c.req.json());
  const observed = observeLegacyClient(db, parsed.clientId, { pushed: true });
  if (!observed.accepted) {
    return c.json(
      {
        error: "legacy_inventory_sealed",
        message: "This legacy client is not in the sealed cutover inventory",
      },
      409,
    );
  }
  let appliedCount = 0;
  let dedupedCount = 0;
  let staleCount = 0;

  db.transaction((tx) => {
    for (const change of parsed.changes) {
      const normalized =
        change.resource === "transaction_tags"
          ? {
              ...change,
              ...normalizeLegacyTransactionTagMutation(tx, change),
            }
          : change;
      // 1. Idempotency gate: already-processed retry → skip entirely.
      if (isChangeRecorded(tx, parsed.clientId, change.clientChangeId)) {
        dedupedCount += 1;
        continue;
      }

      // 2. Apply the data mutation. `changed` is false for a stale no-op.
      const applier = APPLIERS[normalized.resource];
      let changed: boolean;
      if (normalized.op === "upsert") {
        if (normalized.payload == null) {
          throw new Error(
            `Missing payload for upsert ${normalized.resource}/${normalized.resourceId}`,
          );
        }
        changed = applier.upsert(tx, normalized.payload);
      } else {
        changed = applier.remove(
          tx,
          normalized.resourceId,
          normalized.payload,
        );
      }

      // TODO(#39): on-device SMS/manual categorizations arrive here as
      // `transactions` upserts carrying a categoryId. Ideally each such applied
      // upsert would trigger learnCategory(db, {...}) to auto-learn a
      // payee→category rule — but this loop runs inside one broad db.transaction
      // over the whole batch, and learnCategory does its own reads+writes
      // (on `rules`) against `db`, not this `tx`. Nesting those writes here is
      // not clean/safe (shared connection, mid-batch state), so it is
      // deliberately deferred. The web-register (transactions PATCH) and agent
      // (handleLog) categorize paths ARE hooked; learned rules then apply to new
      // SMS drafts via runRules on the ingest path.

      // 3. Record the change only when it actually mutated server state, so a
      //    losing stale write neither advances the changelog nor echoes to
      //    other clients as a (stale) change.
      if (!changed) {
        staleCount += 1;
        continue;
      }
      recordChange(tx, {
        resource: normalized.resource,
        resourceId: normalized.resourceId,
        op: normalized.op,
        payload: normalized.payload ?? undefined,
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
