import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { SQLiteTransaction } from "drizzle-orm/sqlite-core";

import type { Db } from "../db/index.ts";
import { changeLog } from "../db/schema.ts";
import type * as schema from "../db/schema.ts";

export type ChangeOp = "upsert" | "delete";

type Tx = SQLiteTransaction<
  "sync",
  void,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

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
/// suppressed it. Uses RETURNING to detect suppression since the
/// bun-sqlite driver's run() returns void.
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

export function nowMs(): number {
  return Date.now();
}

export function newId(): string {
  return crypto.randomUUID();
}
