import { createHash, randomUUID } from "node:crypto";
import { createReadStream, realpathSync, statSync } from "node:fs";

import Database from "better-sqlite3";
import { eq, inArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../db/schema.ts";

import {
  changeLog,
  syncChanges,
  syncCheckpoints,
  syncClients,
  syncEpochs,
  syncFrontiers,
  syncLegacyClients,
  syncQuarantine,
  syncRegisters,
  tags,
  transactionTags,
  transactions,
} from "../db/schema.ts";
import {
  type DbOrTx,
  recordChange,
  recordCommand,
} from "../repos/changelog.ts";
import {
  activatePreparedEpoch,
  auditEpochIntegrity,
  prepareGenesis,
  rawSyncedProjectionDigest,
  syncedProjectionDigest,
} from "./genesis.ts";

export type BackupProof = {
  path: string;
  sha256: string;
  /** Live database path; when supplied, the proof must name another file. */
  databasePath?: string;
};

export class SyncV2OperatorError extends Error {
  override readonly name = "SyncV2OperatorError";
}

export type OperatorStatus = ReturnType<typeof collectSyncV2Status>;

export type ClientReadiness = {
  epochId: string;
  headCursor: number;
  expectedFrontier: Record<string, number>;
  checkpointId: string | null;
  ready: boolean;
  clients: Array<{
    actorId: string;
    ready: boolean;
    errors: string[];
    acknowledgedCursor: number;
    acknowledgedFrontier: unknown;
  }>;
  errors: string[];
};

export type LegacyClientReadiness = {
  epochId: string;
  inventorySealedAt: number | null;
  headCursor: number;
  ready: boolean;
  clients: Array<{
    clientId: string;
    status: string;
    migratedActorId: string | null;
    drainedV1Head: number | null;
    ready: boolean;
  }>;
  errors: string[];
};

/** Durable/procedural proof that every explicitly inventoried v1 replica has
 * either attested an empty outbox at the exact current head or was explicitly
 * retired. Unknown v1 ids are rejected once the inventory is sealed. */
export function collectLegacyClientReadiness(
  db: DbOrTx,
  epochId: string,
): LegacyClientReadiness {
  const epoch = db
    .select({ sealedAt: syncEpochs.legacyInventorySealedAt })
    .from(syncEpochs)
    .where(eq(syncEpochs.id, epochId))
    .get();
  const headCursor =
    db
      .select({ cursor: sql<number>`coalesce(max(${changeLog.id}), 0)` })
      .from(changeLog)
      .get()?.cursor ?? 0;
  const rows = db.select().from(syncLegacyClients).all();
  const errors: string[] = [];
  if (epoch?.sealedAt === null || epoch?.sealedAt === undefined) {
    errors.push("legacy client inventory is not sealed");
  }
  const clients = rows.map((row) => {
    const ready =
      row.status === "retired" ||
      (row.status === "drained" &&
        row.migratedActorId !== null &&
        row.drainedV1Head !== null);
    if (!ready) {
      errors.push(
        `${row.clientId}: status=${row.status}, migratedActor=${row.migratedActorId ?? "none"}, drainedHead=${row.drainedV1Head ?? "none"}, currentHead=${headCursor}`,
      );
    }
    return {
      clientId: row.clientId,
      status: row.status,
      migratedActorId: row.migratedActorId,
      drainedV1Head: row.drainedV1Head,
      ready,
    };
  });
  return {
    epochId,
    inventorySealedAt: epoch?.sealedAt ?? null,
    headCursor,
    ready: errors.length === 0,
    clients,
    errors,
  };
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { invalidJson: true };
  }
}

function expectedConfigMode(
  epochs: Array<{ status: string }>,
): "disabled" | "preparing" | "active" | "invalid" {
  const writable = epochs.filter((row) =>
    ["preparing", "active"].includes(row.status),
  );
  if (writable.length === 0) return "disabled";
  if (writable.length !== 1) return "invalid";
  return writable[0]!.status === "active" ? "active" : "preparing";
}

function canonicalObject(value: unknown): string {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return JSON.stringify(value);
  }
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
}

/** Exact durable proof that every live v2 replica has integrated this epoch. */
export function collectClientReadiness(
  db: DbOrTx,
  epochId: string,
): ClientReadiness {
  const headCursor =
    db
      .select({
        cursor: sql<number>`coalesce(max(${syncChanges.transportCursor}), 0)`,
      })
      .from(syncChanges)
      .where(eq(syncChanges.epoch, epochId))
      .get()?.cursor ?? 0;
  const expectedFrontier = Object.fromEntries(
    db
      .select({
        actorId: syncFrontiers.actorId,
        sequence: syncFrontiers.contiguousSequence,
      })
      .from(syncFrontiers)
      .where(eq(syncFrontiers.epoch, epochId))
      .all()
      .sort((left, right) => left.actorId.localeCompare(right.actorId))
      .map((row) => [row.actorId, row.sequence]),
  );
  const genesis = db
    .select({ id: syncCheckpoints.id, verifiedAt: syncCheckpoints.verifiedAt })
    .from(syncCheckpoints)
    .where(
      sql`${syncCheckpoints.epoch} = ${epochId} AND ${syncCheckpoints.isGenesis} = 1`,
    )
    .all();
  const checkpointId =
    genesis.length === 1 && genesis[0]?.verifiedAt !== null
      ? genesis[0]!.id
      : null;
  const liveClients = db
    .select()
    .from(syncClients)
    .where(sql`${syncClients.status} != 'retired'`)
    .all();
  const errors: string[] = [];
  if (checkpointId === null)
    errors.push("no unique verified genesis checkpoint");
  if (liveClients.length === 0) {
    errors.push("no live v2 client has acknowledged the prepared epoch");
  }
  const expectedFrontierJson = canonicalObject(expectedFrontier);
  const clients = liveClients.map((client) => {
    const clientErrors: string[] = [];
    const acknowledgedFrontier = parseJson(client.acknowledgedFrontierJson);
    if (client.protocolVersion !== 2) clientErrors.push("protocol is not v2");
    if (client.epoch !== epochId) clientErrors.push("bound to another epoch");
    if (client.status !== "active") clientErrors.push("client is not active");
    if (client.bootstrapCheckpointId !== checkpointId) {
      clientErrors.push("genesis checkpoint not acknowledged");
    }
    if (client.acknowledgedCursor !== headCursor) {
      clientErrors.push(
        `cursor ${client.acknowledgedCursor} does not equal head ${headCursor}`,
      );
    }
    if (canonicalObject(acknowledgedFrontier) !== expectedFrontierJson) {
      clientErrors.push("frontier does not exactly equal server frontier");
    }
    return {
      actorId: client.actorId,
      ready: clientErrors.length === 0,
      errors: clientErrors,
      acknowledgedCursor: client.acknowledgedCursor,
      acknowledgedFrontier,
    };
  });
  for (const client of clients) {
    if (!client.ready) {
      errors.push(`${client.actorId}: ${client.errors.join(", ")}`);
    }
  }
  return {
    epochId,
    headCursor,
    expectedFrontier,
    checkpointId,
    ready: errors.length === 0,
    clients,
    errors,
  };
}

/** A complete read-only rollout report. No cursors, acknowledgements, or rows change. */
export function collectSyncV2Status(db: DbOrTx, configuredMode: string) {
  const epochs = db
    .select()
    .from(syncEpochs)
    .orderBy(syncEpochs.createdAt)
    .all();
  const checkpoints = db
    .select()
    .from(syncCheckpoints)
    .orderBy(syncCheckpoints.creationCursor)
    .all();
  const eventStats = new Map(
    db
      .select({
        epoch: syncChanges.epoch,
        eventCount: sql<number>`count(*)`,
        headCursor: sql<number>`coalesce(max(${syncChanges.transportCursor}), 0)`,
      })
      .from(syncChanges)
      .groupBy(syncChanges.epoch)
      .all()
      .map((row) => [row.epoch, row]),
  );
  const registerStats = new Map(
    db
      .select({
        epoch: syncRegisters.epoch,
        registerCount: sql<number>`count(*)`,
        conflictRegisterCount: sql<number>`coalesce(sum(case when json_array_length(${syncRegisters.candidatesJson}, '$.candidates') > 1 then 1 else 0 end), 0)`,
      })
      .from(syncRegisters)
      .groupBy(syncRegisters.epoch)
      .all()
      .map((row) => [row.epoch, row]),
  );
  const frontiers = db.select().from(syncFrontiers).all();
  const clients = db.select().from(syncClients).all();
  const quarantine = db.select().from(syncQuarantine).all();
  const legacyRows = db
    .select({
      head: sql<number>`coalesce(max(${changeLog.id}), 0)`,
      rows: sql<number>`count(*)`,
    })
    .from(changeLog)
    .get() ?? { head: 0, rows: 0 };
  const legacyOrigins = db
    .select({
      clientId: changeLog.clientId,
      lastChangeId: sql<number>`max(${changeLog.id})`,
      lastChangeAt: sql<number>`max(${changeLog.at})`,
      rowCount: sql<number>`count(*)`,
    })
    .from(changeLog)
    .where(sql`${changeLog.clientId} IS NOT NULL`)
    .groupBy(changeLog.clientId)
    .all();
  const expectation = expectedConfigMode(epochs);

  let projection: ReturnType<typeof syncedProjectionDigest> | null = null;
  let projectionError: string | null = null;
  try {
    projection = syncedProjectionDigest(db, {
      allowLegacyTransactionTagIds: !epochs.some(
        (epoch) => epoch.status === "active",
      ),
    });
  } catch (error) {
    projectionError = error instanceof Error ? error.message : String(error);
  }

  return {
    readOnly: true,
    config: {
      configuredMode,
      expectedMode: expectation,
      matches: expectation !== "invalid" && configuredMode === expectation,
    },
    legacyV1: {
      head: legacyRows.head,
      rows: legacyRows.rows,
      originClients: legacyOrigins,
      pendingClientChanges: null,
      pendingTelemetryAvailable: false,
      note: "v1 has no server-side client acknowledgement; pending rows exist only on each device",
    },
    projection:
      projection === null
        ? { valid: false, error: projectionError }
        : {
            valid: true,
            hash: projection.hash,
            entityCounts: projection.entityCounts,
          },
    epochs: epochs.map((epoch) => {
      const epochCheckpoints = checkpoints.filter(
        (row) => row.epoch === epoch.id,
      );
      const eventStat = eventStats.get(epoch.id);
      const registerStat = registerStats.get(epoch.id);
      return {
        ...epoch,
        eventCount: eventStat?.eventCount ?? 0,
        headCursor: eventStat?.headCursor ?? 0,
        registerCount: registerStat?.registerCount ?? 0,
        conflictRegisterCount: registerStat?.conflictRegisterCount ?? 0,
        frontiers: frontiers
          .filter((row) => row.epoch === epoch.id)
          .map((row) => ({
            actorId: row.actorId,
            contiguousSequence: row.contiguousSequence,
            integratedCursor: row.integratedCursor,
          })),
        checkpoints: epochCheckpoints.map((checkpoint) => ({
          id: checkpoint.id,
          creationCursor: checkpoint.creationCursor,
          eventCount: checkpoint.eventCount,
          projectionHash: checkpoint.projectionHash,
          contentHash: checkpoint.contentHash,
          verifiedAt: checkpoint.verifiedAt,
          isGenesis: checkpoint.isGenesis,
        })),
        integrity: auditEpochIntegrity(db, epoch.id),
        clientReadiness: collectClientReadiness(db, epoch.id),
        legacyClientReadiness: collectLegacyClientReadiness(db, epoch.id),
      };
    }),
    clients: clients.map((client) => ({
      actorId: client.actorId,
      protocolVersion: client.protocolVersion,
      epoch: client.epoch,
      status: client.status,
      appVersion: client.appVersion,
      platform: client.platform,
      acknowledgedCursor: client.acknowledgedCursor,
      acknowledgedFrontier: parseJson(client.acknowledgedFrontierJson),
      bootstrapCheckpointId: client.bootstrapCheckpointId,
      lastSeenAt: client.lastSeenAt,
      activatedAt: client.activatedAt,
      retiredAt: client.retiredAt,
    })),
    quarantine: {
      total: quarantine.length,
      unresolved: quarantine.filter((row) => row.resolvedAt === null).length,
      byReason: Object.entries(
        quarantine.reduce<Record<string, number>>((counts, row) => {
          const key = `${row.resolvedAt === null ? "unresolved" : "resolved"}:${row.reasonCode}`;
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        }, {}),
      )
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([reason, count]) => ({ reason, count })),
    },
  };
}

function recoverableStateManifest(db: DbOrTx) {
  const projection = rawSyncedProjectionDigest(db);
  const v1Head =
    db
      .select({ value: sql<number>`coalesce(max(${changeLog.id}), 0)` })
      .from(changeLog)
      .get()?.value ?? 0;
  const v2Head =
    db
      .select({
        value: sql<number>`coalesce(max(${syncChanges.transportCursor}), 0)`,
      })
      .from(syncChanges)
      .get()?.value ?? 0;
  const state = {
    projectionHash: projection.hash,
    v1Head,
    v2Head,
    epochs: db.select().from(syncEpochs).all(),
    frontiers: db
      .select()
      .from(syncFrontiers)
      .all()
      .sort((left, right) =>
        `${left.epoch}\u0000${left.actorId}`.localeCompare(
          `${right.epoch}\u0000${right.actorId}`,
        ),
      ),
    clients: db
      .select()
      .from(syncClients)
      .all()
      .sort((left, right) => left.actorId.localeCompare(right.actorId)),
    legacyClients: db
      .select()
      .from(syncLegacyClients)
      .all()
      .sort((left, right) => left.clientId.localeCompare(right.clientId)),
    checkpoints: db
      .select()
      .from(syncCheckpoints)
      .all()
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  const canonical = JSON.stringify(state);
  return {
    ...state,
    stateHash: createHash("sha256").update(canonical).digest("hex"),
  };
}

export async function verifyBackupProof(proof: BackupProof, liveDb?: DbOrTx) {
  if (!/^[a-f0-9]{64}$/i.test(proof.sha256)) {
    throw new SyncV2OperatorError(
      "backup SHA-256 must be exactly 64 hex characters",
    );
  }
  let stat;
  try {
    stat = statSync(proof.path);
  } catch (error) {
    throw new SyncV2OperatorError(
      `backup cannot be read at ${proof.path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!stat.isFile() || stat.size === 0) {
    throw new SyncV2OperatorError(
      "backup prerequisite must be a non-empty regular file",
    );
  }
  if (proof.databasePath !== undefined) {
    let databaseRealPath: string;
    try {
      databaseRealPath = realpathSync(proof.databasePath);
    } catch (error) {
      throw new SyncV2OperatorError(
        `live database path cannot be resolved: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    if (realpathSync(proof.path) === databaseRealPath) {
      throw new SyncV2OperatorError(
        "backup path must be different from the live database path",
      );
    }
  }
  const hash = createHash("sha256");
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(proof.path);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  const actual = hash.digest("hex");
  if (actual.toLowerCase() !== proof.sha256.toLowerCase()) {
    throw new SyncV2OperatorError(
      `backup checksum mismatch: expected ${proof.sha256.toLowerCase()}, got ${actual}`,
    );
  }
  let backupSqlite: Database.Database;
  try {
    backupSqlite = new Database(proof.path, {
      readonly: true,
      fileMustExist: true,
    });
  } catch (error) {
    throw new SyncV2OperatorError(
      `backup is not an openable SQLite database: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  try {
    const integrity = backupSqlite.pragma("integrity_check") as Array<{
      integrity_check: string;
    }>;
    if (
      integrity.length !== 1 ||
      integrity[0]?.integrity_check.toLowerCase() !== "ok"
    ) {
      throw new SyncV2OperatorError(
        `backup SQLite integrity check failed: ${integrity.map((row) => row.integrity_check).join("; ")}`,
      );
    }
    const requiredTables = [
      "transactions",
      "change_log",
      "sync_epochs",
      "sync_changes",
      "sync_registers",
      "sync_legacy_clients",
    ];
    const tables = new Set(
      (
        backupSqlite
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all() as Array<{ name: string }>
      ).map((row) => row.name),
    );
    const missing = requiredTables.filter((table) => !tables.has(table));
    if (missing.length > 0) {
      throw new SyncV2OperatorError(
        `backup is missing required tables: ${missing.join(", ")}`,
      );
    }
    let manifest: ReturnType<typeof recoverableStateManifest> | null = null;
    if (proof.databasePath !== undefined && liveDb !== undefined) {
      const backupDb = drizzle(backupSqlite, { schema });
      manifest = recoverableStateManifest(backupDb);
      const liveManifest = recoverableStateManifest(liveDb);
      if (manifest.stateHash !== liveManifest.stateHash) {
        throw new SyncV2OperatorError(
          `backup is stale or WAL-incomplete: state ${manifest.stateHash} does not match live ${liveManifest.stateHash}`,
        );
      }
    }
    return {
      path: proof.path,
      sha256: actual,
      bytes: stat.size,
      verified: true,
      manifest,
    };
  } finally {
    backupSqlite.close();
  }
}

export type PrepareOperatorOptions = {
  epochId?: string;
  genesisActorId?: string;
  serverActorId?: string;
  backup: BackupProof;
  dryRun?: boolean;
  createdAt?: number;
  configuredMode?: string;
};

export type RepairOrphanTransactionTagsOptions = {
  confirmation: string;
  backup: BackupProof;
  dryRun?: boolean;
  configuredMode?: string;
};

/**
 * Removes only relation rows whose transaction or tag provably does not
 * exist. The repair is authored through the normal financial command path so
 * v1 replicas receive an explicit tombstone and a later genesis cannot hide
 * unlogged projection surgery.
 */
export async function repairOrphanTransactionTagsWithGuardrails(
  db: DbOrTx,
  options: RepairOrphanTransactionTagsOptions,
) {
  if (options.confirmation !== "REPAIR-ORPHAN-TAGS") {
    throw new SyncV2OperatorError(
      "orphan repair requires --confirm REPAIR-ORPHAN-TAGS",
    );
  }
  const backup = await verifyBackupProof(options.backup, db);
  if ((options.configuredMode ?? "disabled") !== "disabled") {
    throw new SyncV2OperatorError(
      "orphan repair is only allowed while GULLAK_SYNC_V2_MODE=disabled",
    );
  }
  const transactionIds = new Set(
    db
      .select({ id: transactions.id })
      .from(transactions)
      .all()
      .map((row) => row.id),
  );
  const tagIds = new Set(
    db
      .select({ id: tags.id })
      .from(tags)
      .all()
      .map((row) => row.id),
  );
  const orphans = db
    .select()
    .from(transactionTags)
    .all()
    .filter(
      (row) => !transactionIds.has(row.transactionId) || !tagIds.has(row.tagId),
    );
  if (options.dryRun === true || orphans.length === 0) {
    return {
      action: "repair-orphan-tags",
      dryRun: options.dryRun === true,
      backup,
      repaired: 0,
      orphans,
    };
  }
  recordCommand(db, (tx) => {
    for (const row of orphans) {
      tx.delete(transactionTags).where(eq(transactionTags.id, row.id)).run();
      recordChange(tx, {
        resource: "transaction_tags",
        resourceId: row.id,
        op: "delete",
      });
    }
  });
  return {
    action: "repair-orphan-tags",
    dryRun: false,
    backup,
    repaired: orphans.length,
    orphans,
  };
}

export async function prepareWithGuardrails(
  db: DbOrTx,
  options: PrepareOperatorOptions,
) {
  const backup = await verifyBackupProof(options.backup, db);
  if ((options.configuredMode ?? "disabled") !== "disabled") {
    throw new SyncV2OperatorError(
      "prepare requires GULLAK_SYNC_V2_MODE=disabled",
    );
  }
  const ids = {
    epochId: options.epochId ?? `epoch-${randomUUID()}`,
    genesisActorId: options.genesisActorId ?? `genesis-${randomUUID()}`,
    serverActorId: options.serverActorId ?? `server-${randomUUID()}`,
  };
  const writable = db
    .select({ id: syncEpochs.id, status: syncEpochs.status })
    .from(syncEpochs)
    .where(inArray(syncEpochs.status, ["preparing", "active"]))
    .all();
  if (writable.length !== 0) {
    throw new SyncV2OperatorError(
      `prepare refused: writable epoch already exists (${writable.map((row) => `${row.id}:${row.status}`).join(", ")})`,
    );
  }
  const projectionDigest = syncedProjectionDigest(db, {
    allowLegacyTransactionTagIds: true,
  });
  const projection = {
    hash: projectionDigest.hash,
    entityCounts: projectionDigest.entityCounts,
  };
  if (options.dryRun === true) {
    return { action: "prepare", dryRun: true, backup, ids, projection };
  }
  const prepared = prepareGenesis(db, {
    ...ids,
    createdAt: options.createdAt,
  });
  return {
    action: "prepare",
    dryRun: false,
    backup,
    ids,
    projection,
    prepared,
  };
}

export type ActivateOperatorOptions = {
  epochId: string;
  confirmation: string;
  backup: BackupProof;
  dryRun?: boolean;
  configuredMode?: string;
};

export type SealLegacyInventoryOptions = {
  epochId: string;
  clientIds: string[];
  confirmation: string;
  backup: BackupProof;
  dryRun?: boolean;
  configuredMode?: string;
  sealedAt?: number;
};

/** Seals the operator's explicit v1 device inventory. Every historically
 * observed origin is included automatically; `clientIds` must also name
 * devices known operationally even if they never pushed a server row. */
export async function sealLegacyInventoryWithGuardrails(
  db: DbOrTx,
  options: SealLegacyInventoryOptions,
) {
  const expected = `SEAL-LEGACY:${options.epochId}`;
  if (options.confirmation !== expected) {
    throw new SyncV2OperatorError(
      `legacy inventory sealing requires --confirm ${expected}`,
    );
  }
  if ((options.configuredMode ?? "preparing") !== "preparing") {
    throw new SyncV2OperatorError(
      "legacy inventory sealing requires GULLAK_SYNC_V2_MODE=preparing",
    );
  }
  const backup = await verifyBackupProof(options.backup, db);
  const epoch = db
    .select()
    .from(syncEpochs)
    .where(eq(syncEpochs.id, options.epochId))
    .get();
  if (epoch?.status !== "preparing") {
    throw new SyncV2OperatorError(
      `legacy inventory sealing requires preparing epoch ${options.epochId}`,
    );
  }
  if (epoch.legacyInventorySealedAt !== null) {
    throw new SyncV2OperatorError("legacy inventory is already sealed");
  }
  const explicit = options.clientIds.map((id) => id.trim());
  if (explicit.some((id) => id.length === 0)) {
    throw new SyncV2OperatorError("legacy client ids must be non-empty");
  }
  const observed = db
    .select({ clientId: changeLog.clientId })
    .from(changeLog)
    .where(sql`${changeLog.clientId} IS NOT NULL`)
    .groupBy(changeLog.clientId)
    .all()
    .flatMap((row) => (row.clientId === null ? [] : [row.clientId]));
  const inventory = [...new Set([...observed, ...explicit])].sort();
  const sealedAt = options.sealedAt ?? Date.now();
  if (options.dryRun === true) {
    return { action: "seal-legacy", dryRun: true, backup, inventory, sealedAt };
  }
  db.transaction((tx) => {
    for (const clientId of inventory) {
      tx.insert(syncLegacyClients)
        .values({ clientId, firstSeenAt: sealedAt, lastSeenAt: sealedAt })
        .onConflictDoNothing()
        .run();
    }
    tx.update(syncEpochs)
      .set({ legacyInventorySealedAt: sealedAt })
      .where(
        sql`${syncEpochs.id} = ${options.epochId} AND ${syncEpochs.status} = 'preparing' AND ${syncEpochs.legacyInventorySealedAt} IS NULL`,
      )
      .run();
  });
  return { action: "seal-legacy", dryRun: false, backup, inventory, sealedAt };
}

export async function activateWithGuardrails(
  db: DbOrTx,
  options: ActivateOperatorOptions,
) {
  const expectedConfirmation = `ACTIVATE:${options.epochId}`;
  if (options.confirmation !== expectedConfirmation) {
    throw new SyncV2OperatorError(
      `activation requires --confirm ${expectedConfirmation}`,
    );
  }
  if ((options.configuredMode ?? "preparing") !== "preparing") {
    throw new SyncV2OperatorError(
      "activation requires GULLAK_SYNC_V2_MODE=preparing",
    );
  }
  const backup = await verifyBackupProof(options.backup, db);
  const writable = db
    .select({ id: syncEpochs.id, status: syncEpochs.status })
    .from(syncEpochs)
    .where(inArray(syncEpochs.status, ["preparing", "active"]))
    .all();
  if (
    writable.length !== 1 ||
    writable[0]?.id !== options.epochId ||
    writable[0]?.status !== "preparing"
  ) {
    throw new SyncV2OperatorError(
      `activation refused: ${options.epochId} must be the only writable epoch and must be preparing`,
    );
  }
  const audit = auditEpochIntegrity(db, options.epochId);
  if (!audit.clean) {
    throw new SyncV2OperatorError(
      `activation audit failed: ${audit.errors.join("; ")}`,
    );
  }
  const clientReadiness = collectClientReadiness(db, options.epochId);
  if (!clientReadiness.ready) {
    throw new SyncV2OperatorError(
      `activation client acknowledgement gate failed: ${clientReadiness.errors.join("; ")}`,
    );
  }
  const legacyClientReadiness = collectLegacyClientReadiness(
    db,
    options.epochId,
  );
  if (!legacyClientReadiness.ready) {
    throw new SyncV2OperatorError(
      `activation legacy drain gate failed: ${legacyClientReadiness.errors.join("; ")}`,
    );
  }
  if (options.dryRun === true) {
    return {
      action: "activate",
      dryRun: true,
      backup,
      audit,
      clientReadiness,
      legacyClientReadiness,
    };
  }
  // Repeat every admission check under the same SQLite writer transaction as
  // the status transition. A final phone/server event racing the operator
  // command must make the acknowledgement stale and abort activation.
  return db.transaction((tx) => {
    const transactionalAudit = auditEpochIntegrity(tx, options.epochId);
    if (!transactionalAudit.clean) {
      throw new SyncV2OperatorError(
        `activation audit changed before commit: ${transactionalAudit.errors.join("; ")}`,
      );
    }
    const transactionalReadiness = collectClientReadiness(tx, options.epochId);
    if (!transactionalReadiness.ready) {
      throw new SyncV2OperatorError(
        `activation acknowledgements changed before commit: ${transactionalReadiness.errors.join("; ")}`,
      );
    }
    const transactionalLegacyReadiness = collectLegacyClientReadiness(
      tx,
      options.epochId,
    );
    if (!transactionalLegacyReadiness.ready) {
      throw new SyncV2OperatorError(
        `activation legacy drain state changed before commit: ${transactionalLegacyReadiness.errors.join("; ")}`,
      );
    }
    const activated = activatePreparedEpoch(tx, options.epochId);
    return {
      action: "activate",
      dryRun: false,
      backup,
      audit: transactionalAudit,
      clientReadiness: transactionalReadiness,
      legacyClientReadiness: transactionalLegacyReadiness,
      activated,
    };
  });
}

export type RetireClientOperatorOptions = {
  actorId: string;
  confirmation: string;
  backup: BackupProof;
  dryRun?: boolean;
  configuredMode?: string;
  retiredAt?: number;
};

export type RetireLegacyClientOperatorOptions = {
  clientId: string;
  confirmation: string;
  backup: BackupProof;
  dryRun?: boolean;
  configuredMode?: string;
  retiredAt?: number;
};

export async function retireLegacyClientWithGuardrails(
  db: DbOrTx,
  options: RetireLegacyClientOperatorOptions,
) {
  const expected = `RETIRE-LEGACY:${options.clientId}`;
  if (options.confirmation !== expected) {
    throw new SyncV2OperatorError(
      `legacy client retirement requires --confirm ${expected}`,
    );
  }
  if ((options.configuredMode ?? "preparing") !== "preparing") {
    throw new SyncV2OperatorError(
      "legacy client retirement requires GULLAK_SYNC_V2_MODE=preparing",
    );
  }
  const backup = await verifyBackupProof(options.backup, db);
  const client = db
    .select()
    .from(syncLegacyClients)
    .where(eq(syncLegacyClients.clientId, options.clientId))
    .get();
  if (client === undefined) {
    throw new SyncV2OperatorError(
      `unknown legacy sync client ${options.clientId}`,
    );
  }
  const retiredAt = options.retiredAt ?? Date.now();
  if (options.dryRun === true) {
    return { action: "retire-legacy", dryRun: true, backup, client, retiredAt };
  }
  db.update(syncLegacyClients)
    .set({ status: "retired", retiredAt, lastSeenAt: retiredAt })
    .where(eq(syncLegacyClients.clientId, options.clientId))
    .run();
  return { action: "retire-legacy", dryRun: false, backup, client, retiredAt };
}

/** Explicitly retires an abandoned replica so it cannot authenticate again
 * and no longer blocks an otherwise fully-acknowledged cutover. Retirement is
 * never inferred from age: the operator must name and confirm the exact actor
 * against a verified backup. */
export async function retireClientWithGuardrails(
  db: DbOrTx,
  options: RetireClientOperatorOptions,
) {
  const expectedConfirmation = `RETIRE:${options.actorId}`;
  if (options.confirmation !== expectedConfirmation) {
    throw new SyncV2OperatorError(
      `client retirement requires --confirm ${expectedConfirmation}`,
    );
  }
  if (
    !["preparing", "active"].includes(options.configuredMode ?? "preparing")
  ) {
    throw new SyncV2OperatorError(
      "client retirement requires GULLAK_SYNC_V2_MODE=preparing or active",
    );
  }
  const backup = await verifyBackupProof(options.backup, db);
  const client = db
    .select()
    .from(syncClients)
    .where(eq(syncClients.actorId, options.actorId))
    .get();
  if (client === undefined) {
    throw new SyncV2OperatorError(`unknown sync actor ${options.actorId}`);
  }
  if (client.status === "retired") {
    throw new SyncV2OperatorError(`sync actor ${options.actorId} is retired`);
  }
  const writable = db
    .select({ id: syncEpochs.id, status: syncEpochs.status })
    .from(syncEpochs)
    .where(inArray(syncEpochs.status, ["preparing", "active"]))
    .all();
  if (
    writable.length !== 1 ||
    client.epoch !== writable[0]?.id ||
    writable[0]?.status !== (options.configuredMode ?? "preparing")
  ) {
    throw new SyncV2OperatorError(
      `retirement refused: actor ${options.actorId} is not bound to the one configured writable epoch`,
    );
  }
  const retiredAt = options.retiredAt ?? Date.now();
  if (!Number.isSafeInteger(retiredAt) || retiredAt < 0) {
    throw new SyncV2OperatorError(
      "retiredAt must be a non-negative safe integer",
    );
  }
  if (options.dryRun === true) {
    return { action: "retire", dryRun: true, backup, client, retiredAt };
  }
  return db.transaction((tx) => {
    const current = tx
      .select()
      .from(syncClients)
      .where(eq(syncClients.actorId, options.actorId))
      .get();
    if (
      current === undefined ||
      current.status === "retired" ||
      current.epoch !== client.epoch
    ) {
      throw new SyncV2OperatorError(
        `sync actor ${options.actorId} changed before retirement commit`,
      );
    }
    tx.update(syncClients)
      .set({ status: "retired", retiredAt })
      .where(eq(syncClients.actorId, options.actorId))
      .run();
    return {
      action: "retire",
      dryRun: false,
      backup,
      actorId: options.actorId,
      epoch: current.epoch,
      retiredAt,
    };
  });
}
