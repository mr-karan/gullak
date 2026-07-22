import { createHash } from "node:crypto";

import { and, eq, getTableColumns, inArray } from "drizzle-orm";

import {
  accounts,
  budgets,
  categories,
  categoryGroups,
  payees,
  recurrences,
  syncChanges,
  syncCheckpoints,
  syncEpochs,
  syncFrontiers,
  syncLocalClocks,
  syncRegisters,
  tags,
  transactions,
  transactionTags,
} from "../db/schema.ts";
import type { DbOrTx } from "../repos/changelog.ts";
import type {
  AssignOp,
  ChangeEnvelope,
  JsonValue,
  RegisterState,
} from "./crdt.ts";
import { seedLegacyCutoverState } from "./legacy.ts";
import {
  candidateFor,
  mergeCandidate,
  normalizeRegisterState,
  projectAddWinsMembership,
  projectRegister,
  projectRemoveWinsExists,
  stableJson,
  validateChangeEnvelope,
} from "./crdt.ts";
import {
  SYNCED_RESOURCES,
  registerPolicy,
  transactionTagEntityId,
  validateKnownFieldValue,
  validateProjectedState,
} from "./resources.ts";
import { applySyncChange } from "./store.ts";

const SCHEMA_VERSION = 1;

type ResourceSnapshotDefinition = {
  resource: (typeof SYNCED_RESOURCES)[number];
  // Drizzle cannot express a useful common type for heterogeneous tables.
  // Each entry below is a concrete schema table and is checked at runtime.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  table: any;
  lifecycle: "$exists" | "$member";
  fields: readonly string[];
  defaults?: Readonly<Record<string, JsonValue>>;
  derivedFields?: readonly string[];
  entityId?: (row: Record<string, unknown>) => string;
};

const RESOURCE_SNAPSHOTS = (
  [
    {
      resource: "accounts",
      table: accounts,
      lifecycle: "$exists",
      fields: [
        "archived",
        "createdAt",
        "kind",
        "name",
        "onBudget",
        "openingBalanceCents",
        "reconciledAt",
        "reconciledBalanceCents",
        "sortOrder",
        "updatedAt",
      ],
      defaults: {
        reconciledAt: null,
        reconciledBalanceCents: null,
      },
    },
    {
      resource: "budgets",
      table: budgets,
      lifecycle: "$exists",
      fields: [
        "categoryId",
        "month",
        "rolloverCents",
        "targetCents",
        "updatedAt",
      ],
    },
    {
      resource: "categories",
      table: categories,
      lifecycle: "$exists",
      fields: [
        "color",
        "groupId",
        "hidden",
        "icon",
        "name",
        "parentId",
        "sortOrder",
        "updatedAt",
      ],
      defaults: { color: null, icon: null, parentId: null },
    },
    {
      resource: "category_groups",
      table: categoryGroups,
      lifecycle: "$exists",
      fields: ["isIncome", "name", "sortOrder"],
    },
    {
      resource: "payees",
      table: payees,
      lifecycle: "$exists",
      fields: ["learnCategories", "name", "updatedAt"],
      derivedFields: ["useCount"],
    },
    {
      resource: "recurrences",
      table: recurrences,
      lifecycle: "$exists",
      fields: [
        "accountId",
        "amountCents",
        "anchorDay",
        "cadence",
        "categoryId",
        "createdAt",
        "nextDate",
        "notes",
        "payeeId",
        "payeeName",
        "updatedAt",
      ],
      defaults: {
        anchorDay: null,
        categoryId: null,
        notes: null,
        payeeId: null,
        payeeName: null,
      },
    },
    {
      resource: "tags",
      table: tags,
      lifecycle: "$exists",
      fields: ["archived", "color", "createdAt", "name", "updatedAt"],
      defaults: { color: null },
    },
    {
      resource: "transaction_tags",
      table: transactionTags,
      lifecycle: "$member",
      fields: ["tagId", "transactionId", "updatedAt"],
      entityId: (row) =>
        transactionTagEntityId(String(row.transactionId), String(row.tagId)),
    },
    {
      resource: "transactions",
      table: transactions,
      lifecycle: "$exists",
      fields: [
        "accountId",
        "amountCents",
        "categoryId",
        "cleared",
        "createdAt",
        "date",
        "groupParentId",
        "importedId",
        "isGroupParent",
        "latitude",
        "locationName",
        "longitude",
        "notes",
        "origin",
        "originRef",
        "originalAmountCents",
        "originalCurrency",
        "parentId",
        "payeeId",
        "payeeName",
        "reconciled",
        "transferAccountId",
        "transferGroupId",
        "updatedAt",
      ],
      defaults: {
        categoryId: null,
        groupParentId: null,
        importedId: null,
        latitude: null,
        locationName: null,
        longitude: null,
        notes: null,
        originRef: null,
        originalAmountCents: null,
        originalCurrency: null,
        parentId: null,
        payeeId: null,
        payeeName: null,
        transferAccountId: null,
        transferGroupId: null,
      },
      derivedFields: ["splitTotalCents"],
    },
  ] satisfies ResourceSnapshotDefinition[]
).sort((left, right) => compareStrings(left.resource, right.resource));

type ProjectionEntity = {
  id: string;
  fields: Record<string, JsonValue>;
};

type ProjectionResource = {
  resource: string;
  lifecycle: "$exists" | "$member";
  entities: ProjectionEntity[];
};

type ProjectionSnapshot = {
  resources: ProjectionResource[];
  canonicalJson: string;
  hash: string;
  ops: AssignOp[];
};

/** Read-only digest of the relational state covered by sync v2. */
export type SyncedProjectionDigest = {
  hash: string;
  canonicalJson: string;
  entityCounts: Record<string, number>;
};

export type PrepareGenesisOptions = {
  epochId: string;
  genesisActorId: string;
  serverActorId: string;
  createdAt?: number;
};

export type PreparedGenesis = {
  epochId: string;
  checkpointId: string;
  envelope: ChangeEnvelope | null;
  projectionHash: string;
  checkpointContentHash: string;
  creationCursor: number;
  eventCount: number;
};

export class GenesisValidationError extends Error {
  override readonly name = "GenesisValidationError";
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function requireId(value: string, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new GenesisValidationError(`${name} must be a non-empty string`);
  }
  return value;
}

function requireTimestamp(value: number | undefined): number {
  const timestamp = value ?? Date.now();
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) {
    throw new GenesisValidationError(
      "createdAt must be a non-negative safe integer",
    );
  }
  return timestamp;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function assertRegistryMatchesSchema(): void {
  const registeredResources = RESOURCE_SNAPSHOTS.map((item) => item.resource)
    .slice()
    .sort(compareStrings);
  const syncedResources = [...SYNCED_RESOURCES].sort(compareStrings);
  if (stableJson(registeredResources) !== stableJson(syncedResources)) {
    throw new GenesisValidationError(
      "genesis resource registry does not cover SYNCED_RESOURCES exactly",
    );
  }

  for (const definition of RESOURCE_SNAPSHOTS) {
    const schemaFields = Object.keys(getTableColumns(definition.table)).sort(
      compareStrings,
    );
    const snapshotFields = [
      "id",
      ...definition.fields,
      ...(definition.derivedFields ?? []),
    ].sort(compareStrings);
    if (stableJson(schemaFields) !== stableJson(snapshotFields)) {
      throw new GenesisValidationError(
        `genesis field registry is stale for ${definition.resource}`,
      );
    }
  }
}

function snapshotProjection(tx: DbOrTx): ProjectionSnapshot {
  assertRegistryMatchesSchema();
  const resources: ProjectionResource[] = [];
  const ops: AssignOp[] = [];
  const payeeNames = new Map(
    tx
      .select({ id: payees.id, name: payees.name })
      .from(payees)
      .all()
      .map((row) => [row.id, row.name]),
  );

  for (const definition of RESOURCE_SNAPSHOTS) {
    const rows = (
      tx.select().from(definition.table).all() as Record<string, unknown>[]
    ).sort((left, right) =>
      compareStrings(
        String(definition.entityId?.(left) ?? left.id),
        String(definition.entityId?.(right) ?? right.id),
      ),
    );
    const entities: ProjectionEntity[] = [];

    for (const row of rows) {
      const entityId = definition.entityId?.(row) ?? row.id;
      if (typeof entityId !== "string" || entityId.length === 0) {
        throw new GenesisValidationError(
          `${definition.resource} contains an invalid id`,
        );
      }
      const fields: Record<string, JsonValue> = {};
      ops.push({
        kind: "assign",
        resource: definition.resource,
        entityId,
        field: definition.lifecycle,
        value: true,
      });
      for (const field of definition.fields) {
        if (!(field in row) || row[field] === undefined) {
          throw new GenesisValidationError(
            `${definition.resource}/${entityId} is missing ${field}`,
          );
        }
        const value =
          field === "payeeName" && typeof row.payeeId === "string"
            ? (payeeNames.get(row.payeeId) ?? row[field])
            : row[field];
        validateKnownFieldValue(definition.resource, field, value as JsonValue);
        fields[field] = value as JsonValue;
        ops.push({
          kind: "assign",
          resource: definition.resource,
          entityId,
          field,
          value: value as JsonValue,
        });
      }
      entities.push({ id: entityId, fields });
    }
    resources.push({
      resource: definition.resource,
      lifecycle: definition.lifecycle,
      entities,
    });
  }

  const canonicalJson = stableJson(resources);
  return {
    resources,
    canonicalJson,
    hash: sha256(canonicalJson),
    ops,
  };
}

/**
 * Validate and hash the current relational projection without writing it.
 * Operator tooling uses this before creating a genesis epoch so a malformed
 * financial graph cannot be blessed into an immutable history.
 */
export function syncedProjectionDigest(
  db: DbOrTx,
  options: { allowLegacyTransactionTagIds?: boolean } = {},
): SyncedProjectionDigest {
  validateProjectedState(db, options);
  const snapshot = snapshotProjection(db);
  return {
    hash: snapshot.hash,
    canonicalJson: snapshot.canonicalJson,
    entityCounts: Object.fromEntries(
      snapshot.resources.map((resource) => [
        resource.resource,
        resource.entities.length,
      ]),
    ),
  };
}

/** Cutover-only physical-key migration. The relation pair is the CRDT's
 * logical identity; random legacy ids would otherwise allow two concurrent
 * adds of the same pair to collide at SQLite's unique-pair constraint. */
function normalizeTransactionTagPhysicalIds(tx: DbOrTx): void {
  const rows = tx.select().from(transactionTags).all();
  for (const row of rows) {
    const canonicalId = transactionTagEntityId(row.transactionId, row.tagId);
    if (row.id === canonicalId) continue;
    const collision = tx
      .select({ id: transactionTags.id })
      .from(transactionTags)
      .where(eq(transactionTags.id, canonicalId))
      .get();
    if (collision !== undefined) {
      throw new GenesisValidationError(
        `transaction tag identity collision for ${row.transactionId}/${row.tagId}`,
      );
    }
    tx.update(transactionTags)
      .set({ id: canonicalId })
      .where(eq(transactionTags.id, row.id))
      .run();
  }
}

function checkpointRegistersJson(tx: DbOrTx, epochId: string): string {
  const rows = tx
    .select()
    .from(syncRegisters)
    .where(eq(syncRegisters.epoch, epochId))
    .all()
    .sort((left, right) => {
      const resource = compareStrings(left.resource, right.resource);
      if (resource !== 0) return resource;
      const entity = compareStrings(left.entityId, right.entityId);
      if (entity !== 0) return entity;
      return compareStrings(left.field, right.field);
    })
    .map((row) => ({
      resource: row.resource,
      entityId: row.entityId,
      field: row.field,
      policy: row.policy,
      candidates: JSON.parse(row.candidatesJson) as JsonValue,
      visibleValue:
        row.visibleValueJson === null
          ? null
          : (JSON.parse(row.visibleValueJson) as JsonValue),
      updatedCursor: row.updatedCursor,
    }));
  return stableJson(rows);
}

function checkpointFrontierJson(tx: DbOrTx, epochId: string): string {
  const frontier: Record<string, number> = Object.create(null);
  for (const row of tx
    .select()
    .from(syncFrontiers)
    .where(eq(syncFrontiers.epoch, epochId))
    .all()
    .sort((left, right) => compareStrings(left.actorId, right.actorId))) {
    frontier[row.actorId] = row.contiguousSequence;
  }
  return stableJson(frontier);
}

type CheckpointRegister = {
  resource: string;
  entityId: string;
  field: string;
  policy: string;
  candidates: RegisterState;
  visibleValue: JsonValue;
  updatedCursor: number;
};

type FoldFrontier = {
  contiguousSequence: number;
  integratedCursor: number;
};

type FoldState = {
  registers: Map<string, CheckpointRegister>;
  frontiers: Map<string, FoldFrontier>;
  lamports: Map<string, number>;
};

type StoredChange = {
  transportCursor: number;
  changeId: string;
  epoch: string;
  actorId: string;
  sequence: number;
  lamport: number;
  wallTimeMs: number;
  schemaVersion: number;
  contextJson: string;
  opsJson: string;
  envelopeJson: string;
  contentHash: string;
};

function registerKey(
  resource: string,
  entityId: string,
  field: string,
): string {
  return stableJson([resource, entityId, field]);
}

function dotKey(actorId: string, sequence: number): string {
  return stableJson([actorId, sequence]);
}

function projectedVisibleValue(
  policy: string,
  state: RegisterState,
): JsonValue {
  if (policy === "remove_wins") return projectRemoveWinsExists(state);
  if (policy === "add_wins") return projectAddWinsMembership(state);
  if (policy !== "mvr") {
    throw new GenesisValidationError(`unsupported checkpoint policy ${policy}`);
  }
  const projection = projectRegister(state);
  if (projection.winner === null || projection.value === undefined) {
    throw new GenesisValidationError("checkpoint contains an empty register");
  }
  return projection.value;
}

function canonicalRegisterRows(
  registers: Iterable<CheckpointRegister>,
): string {
  return stableJson(
    [...registers]
      .sort((left, right) => {
        const resource = compareStrings(left.resource, right.resource);
        if (resource !== 0) return resource;
        const entity = compareStrings(left.entityId, right.entityId);
        if (entity !== 0) return entity;
        return compareStrings(left.field, right.field);
      })
      .map((row) => ({
        resource: row.resource,
        entityId: row.entityId,
        field: row.field,
        policy: row.policy,
        candidates: normalizeRegisterState(row.candidates),
        visibleValue: row.visibleValue,
        updatedCursor: row.updatedCursor,
      })),
  );
}

function parseCheckpointRegisters(
  value: string,
): Map<string, CheckpointRegister> {
  const parsed = JSON.parse(value) as unknown;
  if (!Array.isArray(parsed)) {
    throw new GenesisValidationError("checkpoint registers must be an array");
  }
  const registers = new Map<string, CheckpointRegister>();
  for (const raw of parsed) {
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new GenesisValidationError("checkpoint register must be an object");
    }
    const row = raw as Record<string, unknown>;
    if (
      typeof row.resource !== "string" ||
      typeof row.entityId !== "string" ||
      typeof row.field !== "string" ||
      typeof row.policy !== "string" ||
      !Number.isSafeInteger(row.updatedCursor) ||
      (row.updatedCursor as number) < 0
    ) {
      throw new GenesisValidationError(
        "checkpoint register metadata is invalid",
      );
    }
    const policy = registerPolicy(row.resource, row.field);
    if (row.policy !== policy) {
      throw new GenesisValidationError("checkpoint register policy is invalid");
    }
    const candidates = normalizeRegisterState(row.candidates);
    const visibleValue = projectedVisibleValue(policy, candidates);
    if (stableJson(visibleValue) !== stableJson(row.visibleValue)) {
      throw new GenesisValidationError(
        "checkpoint register visible value does not match its candidates",
      );
    }
    const register: CheckpointRegister = {
      resource: row.resource,
      entityId: row.entityId,
      field: row.field,
      policy,
      candidates,
      visibleValue,
      updatedCursor: row.updatedCursor as number,
    };
    const key = registerKey(
      register.resource,
      register.entityId,
      register.field,
    );
    if (registers.has(key)) {
      throw new GenesisValidationError(
        "checkpoint contains duplicate registers",
      );
    }
    registers.set(key, register);
  }
  return registers;
}

function parseCheckpointFrontier(value: string): Record<string, number> {
  const parsed = JSON.parse(value) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new GenesisValidationError("checkpoint frontier must be an object");
  }
  const frontier: Record<string, number> = Object.create(null);
  for (const [actorId, sequence] of Object.entries(parsed)) {
    if (
      actorId.length === 0 ||
      !Number.isSafeInteger(sequence) ||
      (sequence as number) < 1
    ) {
      throw new GenesisValidationError("checkpoint frontier is invalid");
    }
    frontier[actorId] = sequence as number;
  }
  return frontier;
}

function validateStoredEnvelope(row: StoredChange): ChangeEnvelope {
  const envelope = validateChangeEnvelope(JSON.parse(row.envelopeJson));
  if (
    stableJson(envelope) !== row.envelopeJson ||
    sha256(row.envelopeJson) !== row.contentHash ||
    stableJson(envelope.context) !== row.contextJson ||
    stableJson(envelope.ops) !== row.opsJson ||
    envelope.changeId !== row.changeId ||
    envelope.epoch !== row.epoch ||
    envelope.actorId !== row.actorId ||
    envelope.sequence !== row.sequence ||
    envelope.lamport !== row.lamport ||
    envelope.wallTimeMs !== row.wallTimeMs ||
    envelope.schemaVersion !== row.schemaVersion
  ) {
    throw new GenesisValidationError(
      `stored change ${row.changeId} does not match its canonical envelope`,
    );
  }
  return envelope;
}

function foldStoredChange(state: FoldState, row: StoredChange): void {
  const envelope = validateStoredEnvelope(row);
  const current = state.frontiers.get(envelope.actorId);
  const expectedSequence = (current?.contiguousSequence ?? 0) + 1;
  if (envelope.sequence !== expectedSequence) {
    throw new GenesisValidationError(
      `stored change ${envelope.changeId} is not contiguous`,
    );
  }

  let maxDependencyLamport = 0;
  for (const [actorId, sequence] of Object.entries(envelope.context)) {
    const accepted = state.frontiers.get(actorId)?.contiguousSequence ?? 0;
    const dependencyLamport = state.lamports.get(dotKey(actorId, sequence));
    if (accepted < sequence || dependencyLamport === undefined) {
      throw new GenesisValidationError(
        `stored change ${envelope.changeId} has an unsatisfied dependency`,
      );
    }
    maxDependencyLamport = Math.max(maxDependencyLamport, dependencyLamport);
  }
  if (envelope.lamport !== maxDependencyLamport + 1) {
    throw new GenesisValidationError(
      `stored change ${envelope.changeId} has an invalid Lamport value`,
    );
  }

  for (const op of envelope.ops) {
    const policy = registerPolicy(op.resource, op.field);
    validateKnownFieldValue(
      op.resource as (typeof SYNCED_RESOURCES)[number],
      op.field,
      op.value,
    );
    const key = registerKey(op.resource, op.entityId, op.field);
    const existing = state.registers.get(key);
    if (existing !== undefined && existing.policy !== policy) {
      throw new GenesisValidationError(`register policy drift for ${key}`);
    }
    const candidates = mergeCandidate(
      existing?.candidates ?? { candidates: [] },
      candidateFor(envelope, op),
    );
    state.registers.set(key, {
      resource: op.resource,
      entityId: op.entityId,
      field: op.field,
      policy,
      candidates,
      visibleValue: projectedVisibleValue(policy, candidates),
      updatedCursor: row.transportCursor,
    });
  }
  state.frontiers.set(envelope.actorId, {
    contiguousSequence: envelope.sequence,
    integratedCursor: row.transportCursor,
  });
  state.lamports.set(
    dotKey(envelope.actorId, envelope.sequence),
    envelope.lamport,
  );
}

function canonicalFrontiers(frontiers: Map<string, FoldFrontier>): string {
  return stableJson(
    [...frontiers.entries()]
      .sort(([left], [right]) => compareStrings(left, right))
      .map(([actorId, frontier]) => ({ actorId, ...frontier })),
  );
}

function projectionFromFold(
  registers: Map<string, CheckpointRegister>,
): ProjectionSnapshot {
  const resources: ProjectionResource[] = [];
  for (const definition of RESOURCE_SNAPSHOTS) {
    const lifecycleRows = [...registers.values()].filter(
      (row) =>
        row.resource === definition.resource &&
        row.field === definition.lifecycle &&
        row.visibleValue === true,
    );
    const entities = lifecycleRows
      .map((lifecycle): ProjectionEntity => {
        const fields: Record<string, JsonValue> = {};
        for (const field of definition.fields) {
          const register = registers.get(
            registerKey(definition.resource, lifecycle.entityId, field),
          );
          const defaults = definition.defaults as
            Readonly<Record<string, JsonValue>> | undefined;
          const value =
            register === undefined ? defaults?.[field] : register.visibleValue;
          if (value === undefined) {
            throw new GenesisValidationError(
              `${definition.resource}/${lifecycle.entityId} fold is missing ${field}`,
            );
          }
          validateKnownFieldValue(definition.resource, field, value);
          fields[field] = value;
        }
        return { id: lifecycle.entityId, fields };
      })
      .sort((left, right) => compareStrings(left.id, right.id));
    resources.push({
      resource: definition.resource,
      lifecycle: definition.lifecycle,
      entities,
    });
  }

  // These are deterministic materialized fields, not independently mutable
  // state. Apply the same fold used by resources.ts before comparing with the
  // live relational projection.
  const byResource = new Map(resources.map((row) => [row.resource, row]));
  const payeeNames = new Map(
    (byResource.get("payees")?.entities ?? []).map((entity) => [
      entity.id,
      entity.fields.name,
    ]),
  );
  const transactionEntities = byResource.get("transactions")?.entities ?? [];
  const splitSums = new Map<string, number>();
  for (const entity of transactionEntities) {
    const parentId = entity.fields.parentId;
    if (typeof parentId !== "string") continue;
    const amount = entity.fields.amountCents;
    if (typeof amount !== "number" || !Number.isSafeInteger(amount)) {
      throw new GenesisValidationError(
        `transactions/${entity.id} fold has invalid amountCents`,
      );
    }
    const total = (splitSums.get(parentId) ?? 0) + amount;
    if (!Number.isSafeInteger(total)) {
      throw new GenesisValidationError(
        `split children of ${parentId} exceed safe integer money range`,
      );
    }
    splitSums.set(parentId, total);
  }
  for (const entity of transactionEntities) {
    if (entity.fields.isGroupParent === true) entity.fields.amountCents = 0;
    else if (splitSums.has(entity.id)) {
      entity.fields.amountCents = splitSums.get(entity.id)!;
    }
    const payeeId = entity.fields.payeeId;
    if (typeof payeeId === "string" && payeeNames.has(payeeId)) {
      entity.fields.payeeName = payeeNames.get(payeeId)!;
    }
  }
  for (const entity of byResource.get("recurrences")?.entities ?? []) {
    const payeeId = entity.fields.payeeId;
    if (typeof payeeId === "string" && payeeNames.has(payeeId)) {
      entity.fields.payeeName = payeeNames.get(payeeId)!;
    }
  }

  const canonicalJson = stableJson(resources);
  return {
    resources,
    canonicalJson,
    hash: sha256(canonicalJson),
    ops: [],
  };
}

function assertLiveStoreMatchesCheckpointTail(
  tx: DbOrTx,
  checkpoint: typeof syncCheckpoints.$inferSelect,
): FoldState {
  const checkpointRegisters = parseCheckpointRegisters(
    checkpoint.registersJson,
  );
  const checkpointFrontier = parseCheckpointFrontier(checkpoint.frontierJson);
  const allChanges = tx
    .select()
    .from(syncChanges)
    .where(eq(syncChanges.epoch, checkpoint.epoch))
    .all()
    .sort((left, right) => left.transportCursor - right.transportCursor);
  const prefix = allChanges.filter(
    (row) => row.transportCursor <= checkpoint.creationCursor,
  );
  if (prefix.length !== checkpoint.eventCount) {
    throw new GenesisValidationError(
      "checkpoint event count does not match its change prefix",
    );
  }

  const state: FoldState = {
    registers: new Map(),
    frontiers: new Map(),
    lamports: new Map(),
  };
  for (const row of prefix) foldStoredChange(state, row);
  const foldedFrontier = Object.fromEntries(
    [...state.frontiers.entries()].map(([actorId, frontier]) => [
      actorId,
      frontier.contiguousSequence,
    ]),
  );
  if (stableJson(foldedFrontier) !== stableJson(checkpointFrontier)) {
    throw new GenesisValidationError(
      "checkpoint frontier does not match its change prefix",
    );
  }
  if (
    canonicalRegisterRows(state.registers.values()) !==
    canonicalRegisterRows(checkpointRegisters.values())
  ) {
    throw new GenesisValidationError(
      "checkpoint registers do not match its change prefix",
    );
  }

  // Continue the deterministic fold from the verified checkpoint state.
  state.registers = checkpointRegisters;
  for (const row of allChanges) {
    if (row.transportCursor > checkpoint.creationCursor) {
      foldStoredChange(state, row);
    }
  }

  const liveRegisters = tx
    .select()
    .from(syncRegisters)
    .where(eq(syncRegisters.epoch, checkpoint.epoch))
    .all()
    .map((row): CheckpointRegister => {
      const candidates = normalizeRegisterState(JSON.parse(row.candidatesJson));
      return {
        resource: row.resource,
        entityId: row.entityId,
        field: row.field,
        policy: row.policy,
        candidates,
        visibleValue:
          row.visibleValueJson === null
            ? null
            : (JSON.parse(row.visibleValueJson) as JsonValue),
        updatedCursor: row.updatedCursor,
      };
    });
  if (
    canonicalRegisterRows(state.registers.values()) !==
    canonicalRegisterRows(liveRegisters)
  ) {
    throw new GenesisValidationError(
      "live registers do not match checkpoint plus change tail",
    );
  }

  const liveFrontiers = new Map(
    tx
      .select()
      .from(syncFrontiers)
      .where(eq(syncFrontiers.epoch, checkpoint.epoch))
      .all()
      .map(
        (row) =>
          [
            row.actorId,
            {
              contiguousSequence: row.contiguousSequence,
              integratedCursor: row.integratedCursor,
            },
          ] as const,
      ),
  );
  if (
    canonicalFrontiers(state.frontiers) !== canonicalFrontiers(liveFrontiers)
  ) {
    throw new GenesisValidationError(
      "live frontiers do not match checkpoint plus change tail",
    );
  }
  return state;
}

type CheckpointHashFields = {
  epoch: string;
  schemaVersion: number;
  frontierJson: string;
  registersJson: string;
  projectionHash: string;
  creationCursor: number;
  eventCount: number;
  isGenesis: boolean;
};

function checkpointContentHash(fields: CheckpointHashFields): string {
  return sha256(
    stableJson({
      epoch: fields.epoch,
      schemaVersion: fields.schemaVersion,
      frontier: JSON.parse(fields.frontierJson) as JsonValue,
      registers: JSON.parse(fields.registersJson) as JsonValue,
      projectionHash: fields.projectionHash,
      creationCursor: fields.creationCursor,
      eventCount: fields.eventCount,
      isGenesis: fields.isGenesis,
    }),
  );
}

export type EpochIntegrityAudit = {
  epochId: string;
  epochStatus: string | null;
  checkpointId: string | null;
  checkpointContentHash: string | null;
  computedCheckpointContentHash: string | null;
  checkpointHashValid: boolean;
  checkpointProjectionHash: string | null;
  relationalProjectionHash: string | null;
  foldedProjectionHash: string | null;
  liveStoreMatchesFold: boolean;
  clean: boolean;
  errors: string[];
};

/**
 * Recompute every activation-critical digest without mutating the database.
 * This is deliberately separate from activatePreparedEpoch so `audit` and
 * `--dry-run` can be used against a mounted backup or production database.
 */
export function auditEpochIntegrity(
  db: DbOrTx,
  epochIdValue: string,
): EpochIntegrityAudit {
  const epochId = requireId(epochIdValue, "epochId");
  const errors: string[] = [];
  const epoch = db
    .select()
    .from(syncEpochs)
    .where(eq(syncEpochs.id, epochId))
    .get();
  const checkpoints = db
    .select()
    .from(syncCheckpoints)
    .where(
      and(
        eq(syncCheckpoints.epoch, epochId),
        eq(syncCheckpoints.isGenesis, true),
      ),
    )
    .all();
  const checkpoint = checkpoints.length === 1 ? checkpoints[0]! : null;
  if (epoch === undefined) errors.push(`epoch ${epochId} does not exist`);
  if (checkpoints.length !== 1) {
    errors.push(
      `epoch ${epochId} has ${checkpoints.length} genesis checkpoints; expected exactly one`,
    );
  } else if (checkpoint?.verifiedAt === null) {
    errors.push(`epoch ${epochId} genesis checkpoint is not verified`);
  }

  let computedCheckpointContentHash: string | null = null;
  let checkpointHashValid = false;
  let relationalProjectionHash: string | null = null;
  let foldedProjectionHash: string | null = null;
  let liveStoreMatchesFold = false;

  if (checkpoint !== null) {
    try {
      computedCheckpointContentHash = checkpointContentHash({
        epoch: checkpoint.epoch,
        schemaVersion: checkpoint.schemaVersion,
        frontierJson: checkpoint.frontierJson,
        registersJson: checkpoint.registersJson,
        projectionHash: checkpoint.projectionHash,
        creationCursor: checkpoint.creationCursor,
        eventCount: checkpoint.eventCount,
        isGenesis: checkpoint.isGenesis,
      });
      checkpointHashValid =
        computedCheckpointContentHash === checkpoint.contentHash;
      if (!checkpointHashValid) errors.push("checkpoint content hash mismatch");
    } catch (error) {
      errors.push(
        `checkpoint content could not be hashed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      validateProjectedState(db, {
        allowLegacyTransactionTagIds: epoch?.status === "preparing",
      });
      relationalProjectionHash = snapshotProjection(db).hash;
    } catch (error) {
      errors.push(
        `relational projection invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      const folded = assertLiveStoreMatchesCheckpointTail(db, checkpoint);
      foldedProjectionHash = projectionFromFold(folded.registers).hash;
      liveStoreMatchesFold = true;
    } catch (error) {
      errors.push(
        `CRDT store does not match checkpoint plus tail: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    if (
      relationalProjectionHash !== null &&
      foldedProjectionHash !== null &&
      relationalProjectionHash !== foldedProjectionHash
    ) {
      errors.push("relational and folded projection hashes differ");
    }
  }

  return {
    epochId,
    epochStatus: epoch?.status ?? null,
    checkpointId: checkpoint?.id ?? null,
    checkpointContentHash: checkpoint?.contentHash ?? null,
    computedCheckpointContentHash,
    checkpointHashValid,
    checkpointProjectionHash: checkpoint?.projectionHash ?? null,
    relationalProjectionHash,
    foldedProjectionHash,
    liveStoreMatchesFold,
    clean: errors.length === 0,
    errors,
  };
}

/**
 * Creates a shadow CRDT epoch from the current relational projection.
 * Everything, including verification and the complete checkpoint, commits in
 * one SQLite transaction. The epoch intentionally remains `preparing`.
 */
export function prepareGenesis(
  db: DbOrTx,
  options: PrepareGenesisOptions,
): PreparedGenesis {
  const epochId = requireId(options.epochId, "epochId");
  const genesisActorId = requireId(options.genesisActorId, "genesisActorId");
  const serverActorId = requireId(options.serverActorId, "serverActorId");
  if (genesisActorId === serverActorId) {
    throw new GenesisValidationError(
      "genesisActorId and serverActorId must be distinct",
    );
  }
  const createdAt = requireTimestamp(options.createdAt);

  return db.transaction((tx) => {
    validateProjectedState(tx, { allowLegacyTransactionTagIds: true });
    seedLegacyCutoverState(tx);
    const before = snapshotProjection(tx);
    tx.insert(syncEpochs)
      .values({
        id: epochId,
        protocol: 2,
        schemaVersion: SCHEMA_VERSION,
        status: "preparing",
        createdAt,
      })
      .run();
    tx.insert(syncLocalClocks)
      .values({
        epoch: epochId,
        actorId: serverActorId,
        nextSequence: 1,
        lamport: 0,
        integratedCursor: 0,
        updatedAt: createdAt,
      })
      .run();

    let envelope: ChangeEnvelope | null = null;
    let creationCursor = 0;
    if (before.ops.length > 0) {
      envelope = {
        protocol: 2,
        epoch: epochId,
        changeId: `${genesisActorId}:1`,
        actorId: genesisActorId,
        sequence: 1,
        context: {},
        lamport: 1,
        wallTimeMs: createdAt,
        schemaVersion: SCHEMA_VERSION,
        ops: before.ops,
      };
      const applied = applySyncChange(tx, envelope, {
        source: "genesis",
        acceptedAt: createdAt,
      });
      if (applied.status !== "accepted") {
        throw new GenesisValidationError(
          `genesis change was not accepted: ${applied.status}`,
        );
      }
      creationCursor = applied.transportCursor;
    }

    const after = snapshotProjection(tx);
    if (
      after.hash !== before.hash ||
      after.canonicalJson !== before.canonicalJson
    ) {
      throw new GenesisValidationError(
        "genesis changed the synced relational projection",
      );
    }

    const frontierJson = checkpointFrontierJson(tx, epochId);
    const registersJson = checkpointRegistersJson(tx, epochId);
    const eventCount = tx
      .select({ transportCursor: syncChanges.transportCursor })
      .from(syncChanges)
      .where(eq(syncChanges.epoch, epochId))
      .all().length;
    const checkpointId = `${epochId}:genesis`;
    const checkpointFields: CheckpointHashFields = {
      epoch: epochId,
      schemaVersion: SCHEMA_VERSION,
      frontierJson,
      registersJson,
      projectionHash: before.hash,
      creationCursor,
      eventCount,
      isGenesis: true,
    };
    const contentHash = checkpointContentHash(checkpointFields);

    tx.insert(syncCheckpoints)
      .values({
        id: checkpointId,
        ...checkpointFields,
        contentHash,
        createdAt,
        verifiedAt: createdAt,
      })
      .run();

    return {
      epochId,
      checkpointId,
      envelope,
      projectionHash: before.hash,
      checkpointContentHash: contentHash,
      creationCursor,
      eventCount,
    };
  });
}

export type ActivatedEpoch = {
  epochId: string;
  activatedAt: number;
  projectionHash: string;
  checkpointId: string;
};

/** Activates only a still-verified, drift-free prepared epoch. */
export function activatePreparedEpoch(
  db: DbOrTx,
  epochIdValue: string,
): ActivatedEpoch {
  const epochId = requireId(epochIdValue, "epochId");
  return db.transaction((tx) => {
    const epoch = tx
      .select()
      .from(syncEpochs)
      .where(eq(syncEpochs.id, epochId))
      .get();
    if (epoch === undefined || epoch.status !== "preparing") {
      throw new GenesisValidationError(
        `epoch ${epochId} is not in preparing status`,
      );
    }
    const writableEpochs = tx
      .select({ id: syncEpochs.id, status: syncEpochs.status })
      .from(syncEpochs)
      .where(inArray(syncEpochs.status, ["preparing", "active"]))
      .all();
    const otherActive = writableEpochs.find(
      (candidate) => candidate.id !== epochId && candidate.status === "active",
    );
    if (otherActive !== undefined) {
      throw new GenesisValidationError(
        `epoch ${otherActive.id} is already active`,
      );
    }
    if (writableEpochs.length !== 1 || writableEpochs[0]?.id !== epochId) {
      throw new GenesisValidationError(
        `epoch ${epochId} is not the only writable epoch`,
      );
    }

    const checkpoints = tx
      .select()
      .from(syncCheckpoints)
      .where(
        and(
          eq(syncCheckpoints.epoch, epochId),
          eq(syncCheckpoints.isGenesis, true),
        ),
      )
      .all();
    if (checkpoints.length !== 1 || checkpoints[0]?.verifiedAt === null) {
      throw new GenesisValidationError(
        `epoch ${epochId} has no unique verified genesis checkpoint`,
      );
    }
    const checkpoint = checkpoints[0];
    if (checkpoint === undefined) {
      throw new GenesisValidationError("verified checkpoint disappeared");
    }
    const expectedContentHash = checkpointContentHash({
      epoch: checkpoint.epoch,
      schemaVersion: checkpoint.schemaVersion,
      frontierJson: checkpoint.frontierJson,
      registersJson: checkpoint.registersJson,
      projectionHash: checkpoint.projectionHash,
      creationCursor: checkpoint.creationCursor,
      eventCount: checkpoint.eventCount,
      isGenesis: checkpoint.isGenesis,
    });
    if (expectedContentHash !== checkpoint.contentHash) {
      throw new GenesisValidationError(
        `epoch ${epochId} checkpoint content hash does not verify`,
      );
    }
    const folded = assertLiveStoreMatchesCheckpointTail(tx, checkpoint);

    normalizeTransactionTagPhysicalIds(tx);
    validateProjectedState(tx);
    const currentProjection = snapshotProjection(tx);
    const foldedProjection = projectionFromFold(folded.registers);
    if (
      currentProjection.hash !== foldedProjection.hash ||
      currentProjection.canonicalJson !== foldedProjection.canonicalJson
    ) {
      throw new GenesisValidationError(
        `epoch ${epochId} projection drifted: relational projection does not match its full CRDT fold`,
      );
    }

    const activatedAt = Date.now();
    tx.update(syncEpochs)
      .set({ status: "active", activatedAt })
      .where(
        and(eq(syncEpochs.id, epochId), eq(syncEpochs.status, "preparing")),
      )
      .run();
    return {
      epochId,
      activatedAt,
      projectionHash: currentProjection.hash,
      checkpointId: checkpoint.id,
    };
  });
}
