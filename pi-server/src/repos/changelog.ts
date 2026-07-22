import { and, eq, inArray } from "drizzle-orm";
import { AsyncLocalStorage } from "node:async_hooks";

import type { Db } from "../db/index.ts";
import { changeLog, syncEpochs } from "../db/schema.ts";
import {
  type ServerMutation,
  authorServerCommand,
} from "../sync/server_writer.ts";
import { isSyncedResource } from "../sync/resources.ts";

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

type CommandCollector = {
  tx: DbOrTx;
  mutations: Map<string, ServerMutation>;
};

const commandContext = new AsyncLocalStorage<CommandCollector>();

function writableV2Epoch(db: DbOrTx): boolean {
  return (
    db
      .select({ id: syncEpochs.id })
      .from(syncEpochs)
      .where(inArray(syncEpochs.status, ["preparing", "active"]))
      .limit(1)
      .get() !== undefined
  );
}

function addMutation(
  collector: CommandCollector,
  mutation: ServerMutation,
): void {
  const key = `${mutation.resource}\u0000${mutation.entityId}`;
  const previous = collector.mutations.get(key);
  if (previous?.op === "upsert" && mutation.op === "upsert") {
    collector.mutations.set(key, {
      ...mutation,
      payload: { ...(previous.payload ?? {}), ...(mutation.payload ?? {}) },
    });
    return;
  }
  collector.mutations.set(key, mutation);
}

/**
 * Runs one trusted domain command and authors all recordChange calls it makes
 * as one atomic CRDT envelope. Nested commands reuse the outer collector.
 * The callback must remain synchronous: better-sqlite3 transactions cannot be
 * held across an await.
 */
export function recordCommand<T>(db: DbOrTx, callback: (tx: DbOrTx) => T): T {
  const parent = commandContext.getStore();
  if (parent !== undefined) return db.transaction(callback);
  return db.transaction((tx) => {
    const collector: CommandCollector = { tx, mutations: new Map() };
    return commandContext.run(collector, () => {
      const result = callback(tx);
      if (collector.mutations.size > 0) {
        authorServerCommand(tx, [...collector.mutations.values()]);
      }
      return result;
    });
  });
}

/// Append-only mutation log so sync clients can pull deltas after a
/// cursor. Every successful write goes through here. Returns true on
/// insert; false if dedupe (matching client_id + client_change_id)
/// suppressed it. Uses RETURNING + .all() to detect suppression driver-
/// independently rather than relying on a run()-affected-rows count.
export function recordChange(db: DbOrTx, args: RecordChangeArgs): boolean {
  return db.transaction((tx) => recordChangeInTransaction(tx, args));
}

function recordChangeInTransaction(
  tx: DbOrTx,
  args: RecordChangeArgs,
): boolean {
  const inserted = tx
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
  const changed = inserted.length > 0;
  // A preparing epoch is a real shadow history. Server and legacy-client
  // writes must enter it so activation cannot open a history gap.
  if (!changed || !writableV2Epoch(tx) || !isSyncedResource(args.resource)) {
    return changed;
  }

  const mutation: ServerMutation = {
    resource: args.resource,
    entityId: args.resourceId,
    op: args.op,
    ...(args.payload !== undefined &&
    args.payload !== null &&
    typeof args.payload === "object" &&
    !Array.isArray(args.payload)
      ? { payload: args.payload as Record<string, unknown> }
      : {}),
  };
  const collector = commandContext.getStore();
  if (collector !== undefined) addMutation(collector, mutation);
  else authorServerCommand(tx, [mutation]);
  return true;
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
