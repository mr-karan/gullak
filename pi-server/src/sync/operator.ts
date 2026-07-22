import { createHash } from "node:crypto";
import { createReadStream, realpathSync, statSync } from "node:fs";

import Database from "better-sqlite3";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";

import * as schema from "../db/schema.ts";
import {
  syncChanges,
  syncCheckpoints,
  syncClients,
  syncEpochs,
  syncFrontiers,
  syncQuarantine,
  syncRegisters,
} from "../db/schema.ts";
import type { DbOrTx } from "../repos/changelog.ts";
import { auditEpochIntegrity, rawSyncedProjectionDigest } from "./genesis.ts";

export type BackupProof = {
  path: string;
  sha256: string;
  /** Live database path; when supplied, the proof must name another file. */
  databasePath?: string;
};

export class SyncV2OperatorError extends Error {
  override readonly name = "SyncV2OperatorError";
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return { invalidJson: true };
  }
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

function summarizeCheckpoint(
  checkpoint: typeof syncCheckpoints.$inferSelect,
) {
  const { registersJson, frontierJson, ...metadata } = checkpoint;
  return {
    ...metadata,
    frontier: parseJson(frontierJson),
    registerSnapshotBytes: Buffer.byteLength(registersJson, "utf8"),
  };
}

/** Exact durable proof that every non-retired replica has integrated the head. */
export function collectClientReadiness(db: DbOrTx, epochId: string) {
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
  const checkpoints = db
    .select({ id: syncCheckpoints.id, verifiedAt: syncCheckpoints.verifiedAt })
    .from(syncCheckpoints)
    .where(
      sql`${syncCheckpoints.epoch} = ${epochId} AND ${syncCheckpoints.isGenesis} = 1`,
    )
    .all();
  const checkpointId =
    checkpoints.length === 1 && checkpoints[0]?.verifiedAt !== null
      ? checkpoints[0]!.id
      : null;
  const expectedFrontierJson = canonicalObject(expectedFrontier);
  const rows = db
    .select()
    .from(syncClients)
    .where(sql`${syncClients.status} != 'retired'`)
    .all();
  const errors: string[] = [];
  if (checkpointId === null) errors.push("no unique verified genesis checkpoint");
  const clients = rows.map((client) => {
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
    if (!client.ready) errors.push(`${client.actorId}: ${client.errors.join(", ")}`);
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

/** Complete read-only health report for the single modern sync protocol. */
export function collectSyncV2Status(db: DbOrTx) {
  const epochs = db.select().from(syncEpochs).orderBy(syncEpochs.createdAt).all();
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
  let projection: ReturnType<typeof rawSyncedProjectionDigest> | null = null;
  let projectionError: string | null = null;
  try {
    projection = rawSyncedProjectionDigest(db);
  } catch (error) {
    projectionError = error instanceof Error ? error.message : String(error);
  }
  const activeCount = epochs.filter((epoch) => epoch.status === "active").length;
  return {
    readOnly: true,
    protocol: 2,
    activeEpochInvariant: { valid: activeCount === 1, activeCount },
    projection:
      projection === null
        ? { valid: false, error: projectionError }
        : {
            valid: true,
            hash: projection.hash,
            entityCounts: projection.entityCounts,
          },
    epochs: epochs.map((epoch) => {
      const eventStat = eventStats.get(epoch.id);
      const registerStat = registerStats.get(epoch.id);
      return {
        ...epoch,
        eventCount: eventStat?.eventCount ?? 0,
        headCursor: eventStat?.headCursor ?? 0,
        registerCount: registerStat?.registerCount ?? 0,
        conflictRegisterCount: registerStat?.conflictRegisterCount ?? 0,
        frontiers: frontiers.filter((row) => row.epoch === epoch.id),
        checkpoints: checkpoints
          .filter((row) => row.epoch === epoch.id)
          .map(summarizeCheckpoint),
        integrity: auditEpochIntegrity(db, epoch.id),
        clientReadiness: collectClientReadiness(db, epoch.id),
      };
    }),
    clients: clients.map(({ actorTokenHash: _secret, acknowledgedFrontierJson, ...client }) => ({
      ...client,
      acknowledgedFrontier: parseJson(acknowledgedFrontierJson),
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
      ).sort(([left], [right]) => left.localeCompare(right)),
    },
  };
}

function recoverableStateManifest(db: DbOrTx) {
  const projection = rawSyncedProjectionDigest(db);
  const state = {
    projectionHash: projection.hash,
    v2Head:
      db
        .select({ value: sql<number>`coalesce(max(${syncChanges.transportCursor}), 0)` })
        .from(syncChanges)
        .get()?.value ?? 0,
    epochs: db
      .select()
      .from(syncEpochs)
      .all()
      .sort((left, right) => left.id.localeCompare(right.id)),
    frontiers: db
      .select()
      .from(syncFrontiers)
      .all()
      .sort((left, right) =>
        `${left.epoch}\0${left.actorId}`.localeCompare(
          `${right.epoch}\0${right.actorId}`,
        ),
      ),
    clients: db
      .select()
      .from(syncClients)
      .all()
      .sort((left, right) => left.actorId.localeCompare(right.actorId)),
    checkpoints: db
      .select()
      .from(syncCheckpoints)
      .all()
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  return {
    ...state,
    stateHash: createHash("sha256").update(JSON.stringify(state)).digest("hex"),
  };
}

export async function verifyBackupProof(proof: BackupProof, liveDb?: DbOrTx) {
  if (!/^[a-f0-9]{64}$/i.test(proof.sha256)) {
    throw new SyncV2OperatorError("backup SHA-256 must be exactly 64 hex characters");
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
    throw new SyncV2OperatorError("backup prerequisite must be a non-empty regular file");
  }
  if (proof.databasePath !== undefined) {
    if (realpathSync(proof.path) === realpathSync(proof.databasePath)) {
      throw new SyncV2OperatorError("backup path must be different from the live database path");
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
  const sqlite = new Database(proof.path, { readonly: true, fileMustExist: true });
  try {
    const integrity = sqlite.pragma("integrity_check") as Array<{ integrity_check: string }>;
    if (integrity.length !== 1 || integrity[0]?.integrity_check.toLowerCase() !== "ok") {
      throw new SyncV2OperatorError("backup SQLite integrity check failed");
    }
    const required = ["transactions", "sync_epochs", "sync_changes", "sync_registers"];
    const tables = new Set(
      (sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ name: string }>).map(
        (row) => row.name,
      ),
    );
    const missing = required.filter((name) => !tables.has(name));
    if (missing.length > 0) {
      throw new SyncV2OperatorError(`backup is missing required tables: ${missing.join(", ")}`);
    }
    let manifest: ReturnType<typeof recoverableStateManifest> | null = null;
    if (proof.databasePath !== undefined && liveDb !== undefined) {
      manifest = recoverableStateManifest(drizzle(sqlite, { schema }));
      const live = recoverableStateManifest(liveDb);
      if (manifest.stateHash !== live.stateHash) {
        throw new SyncV2OperatorError(
          `backup is stale or WAL-incomplete: state ${manifest.stateHash} does not match live ${live.stateHash}`,
        );
      }
    }
    return {
      path: proof.path,
      sha256: actual,
      bytes: stat.size,
      verified: true,
      manifest:
        manifest === null
          ? null
          : {
              projectionHash: manifest.projectionHash,
              v2Head: manifest.v2Head,
              stateHash: manifest.stateHash,
            },
    };
  } finally {
    sqlite.close();
  }
}

export async function retireClientWithGuardrails(
  db: DbOrTx,
  options: {
    actorId: string;
    confirmation: string;
    backup: BackupProof;
    dryRun?: boolean;
    retiredAt?: number;
  },
) {
  const expected = `RETIRE:${options.actorId}`;
  if (options.confirmation !== expected) {
    throw new SyncV2OperatorError(`client retirement requires --confirm ${expected}`);
  }
  const backup = await verifyBackupProof(options.backup, db);
  const client = db
    .select()
    .from(syncClients)
    .where(eq(syncClients.actorId, options.actorId))
    .get();
  if (client === undefined) throw new SyncV2OperatorError(`unknown sync actor ${options.actorId}`);
  if (client.status === "retired") throw new SyncV2OperatorError(`sync actor ${options.actorId} is retired`);
  const retiredAt = options.retiredAt ?? Date.now();
  if (options.dryRun === true) {
    return { action: "retire", dryRun: true, backup, client, retiredAt };
  }
  db.update(syncClients)
    .set({ status: "retired", retiredAt, lastSeenAt: retiredAt })
    .where(eq(syncClients.actorId, options.actorId))
    .run();
  return { action: "retire", dryRun: false, backup, client, retiredAt };
}
