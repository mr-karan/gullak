import { isDeepStrictEqual } from "node:util";

import { and, asc, eq } from "drizzle-orm";

import {
  syncEpochs,
  syncFrontiers,
  syncLocalClocks,
  syncRegisters,
} from "../db/schema.ts";
import type { DbOrTx } from "../repos/changelog.ts";
import type { AssignOp, ChangeEnvelope, JsonValue } from "./crdt.ts";
import {
  ProjectionValidationError,
  isSyncedResource,
  knownReplicatedFields,
  snapshotForEntity,
  lifecycleField,
  materializeChangeTargets,
} from "./resources.ts";
import {
  type ApplyChangeResult,
  type RegisterConflictSummary,
  applySyncChange,
} from "./store.ts";

export type ServerMutation = {
  resource: string;
  entityId: string;
  op: "upsert" | "delete";
  /** Patch intent for updates; complete known fields for a create. */
  payload?: Readonly<Record<string, unknown>>;
};

export type ServerCommandMetadata = {
  source?: string;
  wallTimeMs?: number;
  acceptedAt?: number;
};

export type AuthorServerCommandResult =
  | {
      status: "noop";
      epoch: string;
      conflicts: [];
      transportCursor: null;
    }
  | {
      status: "accepted";
      epoch: string;
      envelope: ChangeEnvelope;
      conflicts: RegisterConflictSummary[];
      transportCursor: number;
    };

export class ServerWriterError extends Error {
  override readonly name = "ServerWriterError";
}

function requireAuditTime(value: number | undefined): number {
  const timestamp = value ?? Date.now();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new ServerWriterError(
      "wallTimeMs and acceptedAt must be non-negative safe integers",
    );
  }
  return timestamp;
}

function parseVisible(value: string): JsonValue {
  try {
    return JSON.parse(value) as JsonValue;
  } catch (error) {
    throw new ServerWriterError(
      `stored register has invalid visible JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function buildMutationOps(
  tx: DbOrTx,
  epoch: string,
  mutation: ServerMutation,
): AssignOp[] {
  if (!isSyncedResource(mutation.resource)) {
    throw new ProjectionValidationError(
      `unsupported synced resource ${mutation.resource}`,
    );
  }
  if (mutation.entityId.length === 0) {
    throw new ServerWriterError("server mutation entityId must be non-empty");
  }

  const currentRows = tx
    .select({
      field: syncRegisters.field,
      visibleValueJson: syncRegisters.visibleValueJson,
    })
    .from(syncRegisters)
    .where(
      and(
        eq(syncRegisters.epoch, epoch),
        eq(syncRegisters.resource, mutation.resource),
        eq(syncRegisters.entityId, mutation.entityId),
      ),
    )
    .all();
  const current = new Map(
    currentRows.map((row) => [
      row.field,
      row.visibleValueJson === null
        ? undefined
        : parseVisible(row.visibleValueJson),
    ]),
  );
  const lifecycle = lifecycleField(mutation.resource);
  const ops: AssignOp[] = [];

  if (mutation.op === "delete") {
    if (current.get(lifecycle) === true) {
      ops.push({
        kind: "assign",
        resource: mutation.resource,
        entityId: mutation.entityId,
        field: lifecycle,
        value: false,
      });
    }
    return ops;
  }

  if (mutation.op !== "upsert") {
    throw new ServerWriterError(
      `unsupported server mutation op ${mutation.op}`,
    );
  }
  if (current.get(lifecycle) !== true) {
    ops.push({
      kind: "assign",
      resource: mutation.resource,
      entityId: mutation.entityId,
      field: lifecycle,
      value: true,
    });
  }

  // The first immutable create must be replayable into an empty projection.
  // Server routes often rely on SQLite defaults in the relational insert; a
  // partial payload would otherwise look valid only because that row already
  // exists locally. Read the complete post-command row exactly once for the
  // first create. Revives and updates remain intent patches.
  let payload = mutation.payload ?? {};
  if (!current.has(lifecycle)) {
    const snapshot = snapshotForEntity(
      tx,
      mutation.resource,
      mutation.entityId,
    );
    // Direct callers may deliberately author a complete create before the
    // relational row exists; materialization below validates completeness.
    // Normal domain writers insert first, so their SQLite-defaulted row is the
    // authoritative complete create payload.
    if (snapshot.op === "upsert") {
      payload = { ...snapshot.payload, ...(mutation.payload ?? {}) };
    }
  }
  for (const field of knownReplicatedFields(mutation.resource)) {
    if (!Object.hasOwn(payload, field)) continue;
    const value = payload[field] as JsonValue;
    if (isDeepStrictEqual(current.get(field), value)) continue;
    ops.push({
      kind: "assign",
      resource: mutation.resource,
      entityId: mutation.entityId,
      field,
      value,
    });
  }
  return ops;
}

function requireAccepted(
  result: ApplyChangeResult,
): Extract<ApplyChangeResult, { status: "accepted" }> {
  if (result.status !== "accepted") {
    throw new ServerWriterError(
      `trusted server change was not accepted: ${result.status}${
        result.status === "rejected" ? `/${result.code}: ${result.reason}` : ""
      }`,
    );
  }
  return result;
}

/**
 * Authors one immutable CRDT change for an entire trusted domain command.
 * Calling with an existing transaction keeps event admission, projection, and
 * the domain command under one outer transaction via a nested savepoint.
 */
export function authorServerCommand(
  db: DbOrTx,
  mutations: readonly ServerMutation[],
  metadata: ServerCommandMetadata = {},
): AuthorServerCommandResult {
  const wallTimeMs = requireAuditTime(metadata.wallTimeMs);
  const acceptedAt = requireAuditTime(metadata.acceptedAt ?? wallTimeMs);
  const source = metadata.source ?? "server";

  return db.transaction((tx) => {
    const writableEpochs = tx
      .select({
        id: syncEpochs.id,
        schemaVersion: syncEpochs.schemaVersion,
        status: syncEpochs.status,
      })
      .from(syncEpochs)
      .where(eq(syncEpochs.status, "active"))
      .all();
    if (writableEpochs.length !== 1) {
      throw new ServerWriterError(
        `expected exactly one writable sync epoch, found ${writableEpochs.length}`,
      );
    }
    const activeEpoch = writableEpochs[0];
    if (activeEpoch === undefined) {
      throw new ServerWriterError("writable sync epoch disappeared");
    }

    const clock = tx
      .select()
      .from(syncLocalClocks)
      .where(eq(syncLocalClocks.epoch, activeEpoch.id))
      .limit(1)
      .all()[0];
    if (clock === undefined) {
      throw new ServerWriterError(
        `active epoch ${activeEpoch.id} has no server local clock`,
      );
    }

    const uniqueTargets = new Set<string>();
    const ops: AssignOp[] = [];
    for (const mutation of mutations) {
      const target = `${mutation.resource}\u0000${mutation.entityId}`;
      if (uniqueTargets.has(target)) {
        throw new ServerWriterError(
          `server command repeats target ${mutation.resource}/${mutation.entityId}`,
        );
      }
      uniqueTargets.add(target);
      ops.push(...buildMutationOps(tx, activeEpoch.id, mutation));
    }

    if (ops.length === 0) {
      return {
        status: "noop",
        epoch: activeEpoch.id,
        conflicts: [],
        transportCursor: null,
      };
    }

    const frontiers = tx
      .select({
        actorId: syncFrontiers.actorId,
        sequence: syncFrontiers.contiguousSequence,
      })
      .from(syncFrontiers)
      .where(eq(syncFrontiers.epoch, activeEpoch.id))
      .orderBy(asc(syncFrontiers.actorId))
      .all();
    const context = Object.fromEntries(
      frontiers
        .filter((frontier) => frontier.sequence > 0)
        .map((frontier) => [frontier.actorId, frontier.sequence]),
    );
    const serverFrontier =
      frontiers.find((frontier) => frontier.actorId === clock.actorId)
        ?.sequence ?? 0;
    if (clock.nextSequence !== serverFrontier + 1) {
      throw new ServerWriterError(
        `server sequence allocator ${clock.nextSequence} disagrees with frontier ${serverFrontier}`,
      );
    }

    const envelope: ChangeEnvelope = {
      protocol: 2,
      epoch: activeEpoch.id,
      changeId: `${clock.actorId}:${clock.nextSequence}`,
      actorId: clock.actorId,
      sequence: clock.nextSequence,
      context,
      lamport: clock.lamport + 1,
      wallTimeMs,
      schemaVersion: activeEpoch.schemaVersion,
      ops,
    };
    const accepted = requireAccepted(
      applySyncChange(tx, envelope, { source, acceptedAt }),
    );

    materializeChangeTargets(
      tx,
      activeEpoch.id,
      mutations.map((mutation) => ({
        resource: mutation.resource,
        entityId: mutation.entityId,
      })),
      {},
    );

    const advanced = tx
      .update(syncLocalClocks)
      .set({
        nextSequence: clock.nextSequence + 1,
        lamport: envelope.lamport,
        integratedCursor: accepted.transportCursor,
        updatedAt: acceptedAt,
      })
      .where(
        and(
          eq(syncLocalClocks.epoch, activeEpoch.id),
          eq(syncLocalClocks.nextSequence, clock.nextSequence),
        ),
      )
      .returning({ epoch: syncLocalClocks.epoch })
      .all();
    if (advanced.length !== 1) {
      throw new ServerWriterError(
        "server sequence allocator changed concurrently",
      );
    }

    return {
      status: "accepted",
      epoch: activeEpoch.id,
      envelope,
      conflicts: accepted.conflicts,
      transportCursor: accepted.transportCursor,
    };
  });
}
