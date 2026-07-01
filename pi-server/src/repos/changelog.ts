import { and, eq } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import { changeLog } from "../db/schema.ts";

export type ChangeOp = "upsert" | "delete";

// Derive the transaction type from the active Db so it tracks the driver
// (better-sqlite3's run() returns a RunResult, not bun-sqlite's void) instead of
// pinning the run-result type and breaking when the runtime changes.
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// Drizzle's transaction callback hands back a tx object with the same
// query surface as the top-level Db. Helpers accept either so route
// handlers can wrap write+log in one transaction.
export type DbOrTx = Db | Tx;

interface RecordChangeArgs {
  resource: string;
  resourceId: string;
  op: ChangeOp;
  payload?: unknown;
  clientId?: string | null;
  clientChangeId?: string | null;
}

/// Append-only mutation log so sync clients can pull deltas after a
/// cursor. Every successful write goes through here. Returns true on
/// insert; false if dedupe (matching client_id + client_change_id)
/// suppressed it. Uses RETURNING + .all() to detect suppression driver-
/// independently rather than relying on a run()-affected-rows count.
export function recordChange(db: DbOrTx, args: RecordChangeArgs): boolean {
  const inserted = db
    .insert(changeLog)
    .values({
      resource: args.resource,
      resourceId: args.resourceId,
      op: args.op,
      payload: args.payload === undefined ? null : JSON.stringify(args.payload),
      clientId: args.clientId ?? null,
      clientChangeId: args.clientChangeId ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: changeLog.id })
    .all();
  return inserted.length > 0;
}

/// Idempotency probe: has this (clientId, clientChangeId) tuple already been
/// applied? Lets the push handler dedup retries BEFORE touching data tables,
/// so it can separate "already processed" from "new but stale/no-op" and only
/// record a change_log row when the data mutation actually wins.
export function isChangeRecorded(
  db: DbOrTx,
  clientId: string,
  clientChangeId: string,
): boolean {
  const found = db
    .select({ id: changeLog.id })
    .from(changeLog)
    .where(
      and(
        eq(changeLog.clientId, clientId),
        eq(changeLog.clientChangeId, clientChangeId),
      ),
    )
    .limit(1)
    .all();
  return found.length > 0;
}

export function nowMs(): number {
  return Date.now();
}

export function newId(): string {
  return crypto.randomUUID();
}
