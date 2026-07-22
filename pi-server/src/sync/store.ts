import { createHash } from "node:crypto";

import { and, eq, or, sql } from "drizzle-orm";

import {
  syncChanges,
  syncEpochs,
  syncFrontiers,
  syncLocalClocks,
  syncRegisters,
} from "../db/schema.ts";
import type { DbOrTx } from "../repos/changelog.ts";
import {
  type Candidate,
  type ChangeEnvelope,
  type RegisterState,
  CrdtValidationError,
  candidateFor,
  canonicalChangeJson,
  canonicalRegisterJson,
  mergeCandidate,
  normalizeRegisterState,
  projectAddWinsMembership,
  projectRegister,
  projectRemoveWinsExists,
  stableJson,
  validateChangeEnvelope,
} from "./crdt.ts";
import {
  ProjectionValidationError,
  isSyncedResource,
  registerPolicy,
  validateKnownFieldValue,
} from "./resources.ts";

export type RegisterPolicy = ReturnType<typeof registerPolicy>;

export type RegisterConflictSummary = {
  resource: string;
  entityId: string;
  field: string;
  policy: RegisterPolicy;
  candidateCount: number;
  winner: Candidate;
};

export type MissingDependency = {
  actorId: string;
  requiredSequence: number;
  acceptedSequence: number;
};

type ResultBase = {
  transportCursor: number | null;
  conflicts: RegisterConflictSummary[];
};

export type ApplyChangeResult =
  | (ResultBase & {
      status: "accepted";
      transportCursor: number;
      contentHash: string;
    })
  | (ResultBase & {
      status: "duplicate";
      transportCursor: number;
      contentHash: string;
    })
  | (ResultBase & {
      status: "gap";
      retryable: true;
      actorId: string;
      expectedSequence: number;
      receivedSequence: number;
    })
  | (ResultBase & {
      status: "dependency_gap";
      retryable: true;
      missingDependencies: MissingDependency[];
    })
  | (ResultBase & {
      status: "rejected";
      code:
        | "invalid_envelope"
        | "invalid_source"
        | "wrong_epoch"
        | "identity_reuse"
        | "invalid_context"
        | "invalid_lamport"
        | "unsupported_schema"
        | "sequence_reuse";
      reason: string;
    });

export type ApplyChangeOptions = {
  source: string;
  acceptedAt?: number;
};

type AcceptedChange = {
  envelope: ChangeEnvelope;
  envelopeJson: string;
  contentHash: string;
};

function rejected(
  code: Extract<ApplyChangeResult, { status: "rejected" }>["code"],
  reason: string,
): ApplyChangeResult {
  return {
    status: "rejected",
    code,
    reason,
    transportCursor: null,
    conflicts: [],
  };
}

function positiveTimestamp(value: number | undefined): number {
  const timestamp = value ?? Date.now();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new CrdtValidationError(
      "acceptedAt must be a non-negative safe integer",
    );
  }
  return timestamp;
}

function prepareChange(value: unknown): AcceptedChange | ApplyChangeResult {
  try {
    const envelope = validateChangeEnvelope(value);
    const envelopeJson = canonicalChangeJson(envelope);
    return {
      envelope,
      envelopeJson,
      contentHash: createHash("sha256").update(envelopeJson).digest("hex"),
    };
  } catch (error) {
    if (
      error instanceof CrdtValidationError ||
      error instanceof ProjectionValidationError
    ) {
      return rejected("invalid_envelope", error.message);
    }
    throw error;
  }
}

function validateProjectionOps(
  envelope: ChangeEnvelope,
): ApplyChangeResult | null {
  try {
    for (const op of envelope.ops) {
      const policy = registerPolicy(op.resource, op.field);
      if (!isSyncedResource(op.resource)) {
        throw new ProjectionValidationError(
          `unsupported synced resource ${op.resource}`,
        );
      }
      validateKnownFieldValue(op.resource, op.field, op.value);
      if (policy !== "mvr" && typeof op.value !== "boolean") {
        throw new ProjectionValidationError(
          `${op.resource}.${op.field} must be boolean`,
        );
      }
    }
    return null;
  } catch (error) {
    if (error instanceof ProjectionValidationError) {
      return rejected("invalid_envelope", error.message);
    }
    throw error;
  }
}

export function canonicalChangeHash(value: ChangeEnvelope | unknown): string {
  return createHash("sha256").update(canonicalChangeJson(value)).digest("hex");
}

function visibleValueJson(
  state: RegisterState,
  policy: RegisterPolicy,
): string {
  if (policy === "remove_wins") {
    return stableJson(projectRemoveWinsExists(state));
  }
  if (policy === "add_wins") {
    return stableJson(projectAddWinsMembership(state));
  }
  const projection = projectRegister(state);
  if (projection.winner === null) {
    throw new Error("an applied assignment produced an empty register");
  }
  return stableJson(projection.value);
}

function mergeOp(
  tx: DbOrTx,
  change: ChangeEnvelope,
  op: ChangeEnvelope["ops"][number],
  transportCursor: number,
  acceptedAt: number,
): RegisterConflictSummary | null {
  const policy = registerPolicy(op.resource, op.field);
  const existing = tx
    .select({
      policy: syncRegisters.policy,
      candidatesJson: syncRegisters.candidatesJson,
    })
    .from(syncRegisters)
    .where(
      and(
        eq(syncRegisters.epoch, change.epoch),
        eq(syncRegisters.resource, op.resource),
        eq(syncRegisters.entityId, op.entityId),
        eq(syncRegisters.field, op.field),
      ),
    )
    .limit(1)
    .all()[0];

  if (existing !== undefined && existing.policy !== policy) {
    throw new Error(
      `register policy mismatch for ${op.resource}/${op.entityId}/${op.field}`,
    );
  }

  let state: RegisterState = { candidates: [] };
  if (existing !== undefined) {
    state = normalizeRegisterState(JSON.parse(existing.candidatesJson));
  }
  state = mergeCandidate(state, candidateFor(change, op));
  const candidatesJson = canonicalRegisterJson(state);
  const visibleJson = visibleValueJson(state, policy);

  tx.insert(syncRegisters)
    .values({
      epoch: change.epoch,
      resource: op.resource,
      entityId: op.entityId,
      field: op.field,
      policy,
      candidatesJson,
      visibleValueJson: visibleJson,
      updatedCursor: transportCursor,
      updatedAt: acceptedAt,
    })
    .onConflictDoUpdate({
      target: [
        syncRegisters.epoch,
        syncRegisters.resource,
        syncRegisters.entityId,
        syncRegisters.field,
      ],
      set: {
        candidatesJson,
        visibleValueJson: visibleJson,
        updatedCursor: transportCursor,
        updatedAt: acceptedAt,
      },
    })
    .run();

  const projection = projectRegister(state);
  if (projection.conflict === null) return null;
  return {
    resource: op.resource,
    entityId: op.entityId,
    field: op.field,
    policy,
    candidateCount: state.candidates.length,
    winner: projection.conflict.winner,
  };
}

function applyPreparedChange(
  tx: DbOrTx,
  prepared: AcceptedChange,
  source: string,
  acceptedAt: number,
): ApplyChangeResult {
  const { envelope, envelopeJson, contentHash } = prepared;

  const identityMatch = tx
    .select({
      transportCursor: syncChanges.transportCursor,
      changeId: syncChanges.changeId,
      actorId: syncChanges.actorId,
      sequence: syncChanges.sequence,
      contentHash: syncChanges.contentHash,
    })
    .from(syncChanges)
    .where(
      or(
        eq(syncChanges.changeId, envelope.changeId),
        and(
          eq(syncChanges.actorId, envelope.actorId),
          eq(syncChanges.sequence, envelope.sequence),
        ),
      ),
    )
    .limit(1)
    .all()[0];

  if (identityMatch !== undefined) {
    if (
      identityMatch.changeId === envelope.changeId &&
      identityMatch.actorId === envelope.actorId &&
      identityMatch.sequence === envelope.sequence &&
      identityMatch.contentHash === contentHash
    ) {
      return {
        status: "duplicate",
        transportCursor: identityMatch.transportCursor,
        contentHash,
        conflicts: [],
      };
    }
    return rejected(
      "identity_reuse",
      "changeId or actor sequence was already accepted with different bytes",
    );
  }

  const epoch = tx
    .select({
      status: syncEpochs.status,
      schemaVersion: syncEpochs.schemaVersion,
    })
    .from(syncEpochs)
    .where(eq(syncEpochs.id, envelope.epoch))
    .limit(1)
    .all()[0];
  if (epoch === undefined || !["active", "preparing"].includes(epoch.status)) {
    return rejected(
      "wrong_epoch",
      `epoch ${envelope.epoch} is not active or preparing`,
    );
  }
  if (envelope.schemaVersion !== epoch.schemaVersion) {
    return rejected(
      "unsupported_schema",
      `schema version ${envelope.schemaVersion} is not supported by epoch ${envelope.epoch} ` +
        `(expected ${epoch.schemaVersion})`,
    );
  }
  const projectionRejection = validateProjectionOps(envelope);
  if (projectionRejection !== null) return projectionRejection;

  const frontier = tx
    .select({ sequence: syncFrontiers.contiguousSequence })
    .from(syncFrontiers)
    .where(
      and(
        eq(syncFrontiers.epoch, envelope.epoch),
        eq(syncFrontiers.actorId, envelope.actorId),
      ),
    )
    .limit(1)
    .all()[0];
  const expectedSequence = (frontier?.sequence ?? 0) + 1;
  if (envelope.sequence > expectedSequence) {
    return {
      status: "gap",
      retryable: true,
      actorId: envelope.actorId,
      expectedSequence,
      receivedSequence: envelope.sequence,
      transportCursor: null,
      conflicts: [],
    };
  }
  if (envelope.sequence < expectedSequence) {
    return rejected(
      "sequence_reuse",
      `sequence ${envelope.sequence} is behind frontier ${frontier?.sequence ?? 0}`,
    );
  }

  const dependencyRows = Object.entries(envelope.context).map(
    ([actorId, requiredSequence]) => {
      const dependencyFrontier = tx
        .select({ sequence: syncFrontiers.contiguousSequence })
        .from(syncFrontiers)
        .where(
          and(
            eq(syncFrontiers.epoch, envelope.epoch),
            eq(syncFrontiers.actorId, actorId),
          ),
        )
        .limit(1)
        .all()[0];
      return {
        actorId,
        requiredSequence,
        acceptedSequence: dependencyFrontier?.sequence ?? 0,
      };
    },
  );
  const missingDependencies = dependencyRows.filter(
    (dependency) => dependency.acceptedSequence < dependency.requiredSequence,
  );
  if (missingDependencies.length > 0) {
    return {
      status: "dependency_gap",
      retryable: true,
      missingDependencies,
      transportCursor: null,
      conflicts: [],
    };
  }

  let maxDependencyLamport = 0;
  for (const dependency of dependencyRows) {
    const dependencyChange = tx
      .select({
        lamport: syncChanges.lamport,
        contextJson: syncChanges.contextJson,
      })
      .from(syncChanges)
      .where(
        and(
          eq(syncChanges.epoch, envelope.epoch),
          eq(syncChanges.actorId, dependency.actorId),
          eq(syncChanges.sequence, dependency.requiredSequence),
        ),
      )
      .limit(1)
      .all()[0];
    if (dependencyChange === undefined) {
      throw new Error(
        `frontier contains missing dependency ${dependency.actorId}:${dependency.requiredSequence}`,
      );
    }
    const inheritedContext = JSON.parse(dependencyChange.contextJson) as Record<
      string,
      unknown
    >;
    for (const [ancestorActorId, ancestorSequence] of Object.entries(
      inheritedContext,
    )) {
      if (
        !Number.isSafeInteger(ancestorSequence) ||
        (ancestorSequence as number) < 1
      ) {
        throw new Error(
          `stored dependency ${dependency.actorId}:${dependency.requiredSequence} has invalid context`,
        );
      }
      if (
        (envelope.context[ancestorActorId] ?? 0) < (ancestorSequence as number)
      ) {
        return rejected(
          "invalid_context",
          `context is not transitively closed: ${dependency.actorId}:${dependency.requiredSequence} ` +
            `requires ${ancestorActorId}:${ancestorSequence as number}`,
        );
      }
    }
    maxDependencyLamport = Math.max(
      maxDependencyLamport,
      dependencyChange.lamport,
    );
  }
  const expectedLamport = maxDependencyLamport + 1;
  if (envelope.lamport !== expectedLamport) {
    return rejected(
      "invalid_lamport",
      `lamport ${envelope.lamport} must equal ${expectedLamport} for its causal context`,
    );
  }

  const inserted = tx
    .insert(syncChanges)
    .values({
      changeId: envelope.changeId,
      epoch: envelope.epoch,
      actorId: envelope.actorId,
      sequence: envelope.sequence,
      lamport: envelope.lamport,
      wallTimeMs: envelope.wallTimeMs,
      schemaVersion: envelope.schemaVersion,
      contextJson: stableJson(envelope.context),
      opsJson: stableJson(envelope.ops),
      envelopeJson,
      contentHash,
      source,
      acceptedAt,
    })
    .returning({ transportCursor: syncChanges.transportCursor })
    .all()[0];
  if (inserted === undefined) {
    throw new Error("sync change insert returned no cursor");
  }

  const conflicts: RegisterConflictSummary[] = [];
  for (const op of envelope.ops) {
    const conflict = mergeOp(
      tx,
      envelope,
      op,
      inserted.transportCursor,
      acceptedAt,
    );
    if (conflict !== null) conflicts.push(conflict);
  }

  tx.insert(syncFrontiers)
    .values({
      epoch: envelope.epoch,
      actorId: envelope.actorId,
      contiguousSequence: envelope.sequence,
      integratedCursor: inserted.transportCursor,
      updatedAt: acceptedAt,
    })
    .onConflictDoUpdate({
      target: [syncFrontiers.epoch, syncFrontiers.actorId],
      set: {
        contiguousSequence: envelope.sequence,
        integratedCursor: inserted.transportCursor,
        updatedAt: acceptedAt,
      },
    })
    .run();

  const observedClocks = tx
    .update(syncLocalClocks)
    .set({
      lamport: sql`max(${syncLocalClocks.lamport}, ${envelope.lamport})`,
      integratedCursor: sql`max(${syncLocalClocks.integratedCursor}, ${inserted.transportCursor})`,
      updatedAt: acceptedAt,
    })
    .where(eq(syncLocalClocks.epoch, envelope.epoch))
    .returning({ epoch: syncLocalClocks.epoch })
    .all();
  if (observedClocks.length !== 1) {
    throw new Error(`epoch ${envelope.epoch} has no initialized local clock`);
  }

  return {
    status: "accepted",
    transportCursor: inserted.transportCursor,
    contentHash,
    conflicts,
  };
}

/**
 * Validates and atomically integrates one immutable v2 change. A top-level DB
 * starts a transaction; an existing transaction creates a nested savepoint.
 * All better-sqlite3/Drizzle calls are intentionally synchronous.
 */
export function applySyncChange(
  db: DbOrTx,
  value: unknown,
  options: ApplyChangeOptions,
): ApplyChangeResult {
  let acceptedAt: number;
  let prepared: AcceptedChange | ApplyChangeResult;
  try {
    acceptedAt = positiveTimestamp(options.acceptedAt);
    if (typeof options.source !== "string" || options.source.length === 0) {
      return rejected("invalid_source", "source must be a non-empty string");
    }
    prepared = prepareChange(value);
  } catch (error) {
    if (error instanceof CrdtValidationError) {
      return rejected("invalid_envelope", error.message);
    }
    throw error;
  }
  if ("status" in prepared) return prepared;

  return db.transaction((tx) =>
    applyPreparedChange(tx, prepared, options.source, acceptedAt),
  );
}
