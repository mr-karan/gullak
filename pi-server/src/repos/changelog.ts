import { AsyncLocalStorage } from "node:async_hooks";

import type { Db } from "../db/index.ts";
import {
  type ServerMutation,
  authorServerCommand,
} from "../sync/server_writer.ts";
import { isSyncedResource } from "../sync/resources.ts";
import { ensureActiveEpoch } from "../sync/active_epoch.ts";

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
}

type CommandCollector = {
  tx: DbOrTx;
  mutations: Map<string, ServerMutation>;
};

const commandContext = new AsyncLocalStorage<CommandCollector>();

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
  ensureActiveEpoch(db);
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

/// Records one semantic mutation in the current command's immutable CRDT
/// envelope. The relational write and event authoring share one transaction.
export function recordChange(db: DbOrTx, args: RecordChangeArgs): boolean {
  if (commandContext.getStore() === undefined) ensureActiveEpoch(db);
  return db.transaction((tx) => recordChangeInTransaction(tx, args));
}

function recordChangeInTransaction(
  tx: DbOrTx,
  args: RecordChangeArgs,
): boolean {
  if (!isSyncedResource(args.resource)) return false;

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

export function nowMs(): number {
  return Date.now();
}

export function newId(): string {
  return crypto.randomUUID();
}
