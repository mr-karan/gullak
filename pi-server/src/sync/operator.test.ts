import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, describe, expect, test } from "vitest";

import * as schema from "../db/schema.ts";
import {
  activateWithGuardrails,
  collectSyncV2Status,
  prepareWithGuardrails,
  repairOrphanTransactionTagsWithGuardrails,
  retireClientWithGuardrails,
  sealLegacyInventoryWithGuardrails,
  SyncV2OperatorError,
  verifyBackupProof,
} from "./operator.ts";

const openDatabases: Database.Database[] = [];
const tempDirectories: string[] = [];

afterEach(() => {
  for (const sqlite of openDatabases.splice(0)) sqlite.close();
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function makeDb() {
  const sqlite = new Database(":memory:");
  openDatabases.push(sqlite);
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}

function backupProof() {
  const directory = mkdtempSync(join(tmpdir(), "gullak-sync-v2-operator-"));
  tempDirectories.push(directory);
  const path = join(directory, "gullak.sqlite.backup");
  const sqlite = new Database(path);
  const backupDb = drizzle(sqlite, { schema });
  migrate(backupDb, { migrationsFolder: "./drizzle" });
  sqlite.close();
  const bytes = readFileSync(path);
  return {
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

function acknowledgeCurrentHead(
  db: ReturnType<typeof makeDb>,
  epochId: string,
): void {
  const epochChanges = db
    .select()
    .from(schema.syncChanges)
    .all()
    .filter((row) => row.epoch === epochId);
  const head = Math.max(0, ...epochChanges.map((row) => row.transportCursor));
  const frontier = Object.fromEntries(
    db
      .select()
      .from(schema.syncFrontiers)
      .all()
      .filter((row) => row.epoch === epochId)
      .sort((left, right) => left.actorId.localeCompare(right.actorId))
      .map((row) => [row.actorId, row.contiguousSequence]),
  );
  db.insert(schema.syncClients)
    .values({
      actorId: "phone-v2",
      actorTokenHash: "a".repeat(64),
      protocolVersion: 2,
      epoch: epochId,
      status: "active",
      acknowledgedCursor: head,
      acknowledgedFrontierJson: JSON.stringify(frontier),
      bootstrapCheckpointId: `${epochId}:genesis`,
    })
    .run();
}

describe("sync v2 operator guardrails", () => {
  test("status is read-only and reports v1 limitations plus projection hashes", () => {
    const db = makeDb();
    db.insert(schema.changeLog)
      .values({
        clientId: "phone-v1",
        clientChangeId: "legacy-1",
        resource: "accounts",
        resourceId: "account-1",
        op: "delete",
      })
      .run();

    const before = db.select().from(schema.changeLog).all();
    const report = collectSyncV2Status(db, "disabled");

    expect(report.config).toEqual({
      configuredMode: "disabled",
      expectedMode: "disabled",
      matches: true,
    });
    expect(report.legacyV1).toMatchObject({
      head: 1,
      rows: 1,
      pendingClientChanges: null,
      pendingTelemetryAvailable: false,
    });
    expect(report.projection).toMatchObject({ valid: true });
    expect(report.epochs).toEqual([]);
    expect(db.select().from(schema.changeLog).all()).toEqual(before);
  });

  test("backup proof rejects the live database itself and a bad digest", async () => {
    const proof = backupProof();
    await expect(
      verifyBackupProof({ ...proof, databasePath: proof.path }),
    ).rejects.toThrow(/different from the live database/);
    await expect(
      verifyBackupProof({ ...proof, sha256: "0".repeat(64) }),
    ).rejects.toThrow(/checksum mismatch/);
    const junkDirectory = mkdtempSync(join(tmpdir(), "gullak-sync-v2-junk-"));
    tempDirectories.push(junkDirectory);
    const junkPath = join(junkDirectory, "not-a-database");
    writeFileSync(junkPath, "not sqlite");
    await expect(
      verifyBackupProof({
        path: junkPath,
        sha256: createHash("sha256").update("not sqlite").digest("hex"),
      }),
    ).rejects.toThrow(/not a database|SQLite/);
  });

  test("backup proof is a current restorable SQLite snapshot, not stale bytes", async () => {
    const directory = mkdtempSync(join(tmpdir(), "gullak-sync-v2-live-"));
    tempDirectories.push(directory);
    const livePath = join(directory, "live.sqlite");
    const backupPath = join(directory, "backup.sqlite");
    const sqlite = new Database(livePath);
    openDatabases.push(sqlite);
    const db = drizzle(sqlite, { schema });
    migrate(db, { migrationsFolder: "./drizzle" });
    db.insert(schema.accounts)
      .values({ id: "a1", name: "Before", kind: "checking" })
      .run();
    sqlite.exec(`VACUUM INTO '${backupPath}'`);
    const proof = {
      path: backupPath,
      databasePath: livePath,
      sha256: createHash("sha256")
        .update(readFileSync(backupPath))
        .digest("hex"),
    };
    await expect(verifyBackupProof(proof, db)).resolves.toMatchObject({
      verified: true,
      manifest: { projectionHash: expect.any(String), v1Head: 0, v2Head: 0 },
    });

    db.update(schema.accounts)
      .set({ name: "After" })
      .where(eq(schema.accounts.id, "a1"))
      .run();
    await expect(verifyBackupProof(proof, db)).rejects.toThrow(
      /stale or WAL-incomplete/,
    );
  });

  test("prepare dry-run validates but writes nothing; real prepare is atomic", async () => {
    const db = makeDb();
    const options = {
      epochId: "epoch-operator",
      genesisActorId: "genesis-operator",
      serverActorId: "server-operator",
      backup: backupProof(),
      createdAt: 1_800_000_000_000,
    };

    const dryRun = await prepareWithGuardrails(db, {
      ...options,
      dryRun: true,
    });
    expect(dryRun).toMatchObject({
      dryRun: true,
      ids: { epochId: "epoch-operator" },
      backup: { verified: true },
    });
    expect(db.select().from(schema.syncEpochs).all()).toEqual([]);

    const prepared = await prepareWithGuardrails(db, options);
    expect(prepared).toMatchObject({
      dryRun: false,
      prepared: {
        epochId: "epoch-operator",
        checkpointId: "epoch-operator:genesis",
      },
    });
    expect(db.select().from(schema.syncEpochs).get()).toMatchObject({
      id: "epoch-operator",
      status: "preparing",
    });
    expect(db.select().from(schema.syncCheckpoints).all()).toHaveLength(1);
  });

  test("orphan relation repair is guarded, dry-runnable, and change-logged", async () => {
    const db = makeDb();
    db.insert(schema.transactions)
      .values({
        id: "t1",
        accountId: "a1",
        amountCents: -100,
        date: "2026-07-22",
        origin: "manual",
      })
      .run();
    db.insert(schema.transactionTags)
      .values({ id: "orphan", transactionId: "t1", tagId: "missing" })
      .run();
    const options = {
      confirmation: "REPAIR-ORPHAN-TAGS",
      backup: backupProof(),
    };

    await expect(
      repairOrphanTransactionTagsWithGuardrails(db, {
        ...options,
        confirmation: "yes",
      }),
    ).rejects.toThrow(/REPAIR-ORPHAN-TAGS/);
    await expect(
      repairOrphanTransactionTagsWithGuardrails(db, {
        ...options,
        configuredMode: "preparing",
      }),
    ).rejects.toThrow(/only allowed.*disabled/);

    const dryRun = await repairOrphanTransactionTagsWithGuardrails(db, {
      ...options,
      dryRun: true,
    });
    expect(dryRun).toMatchObject({ repaired: 0, orphans: [{ id: "orphan" }] });
    expect(db.select().from(schema.transactionTags).all()).toHaveLength(1);

    const repaired = await repairOrphanTransactionTagsWithGuardrails(
      db,
      options,
    );
    expect(repaired).toMatchObject({ repaired: 1 });
    expect(db.select().from(schema.transactionTags).all()).toEqual([]);
    expect(db.select().from(schema.changeLog).get()).toMatchObject({
      resource: "transaction_tags",
      resourceId: "orphan",
      op: "delete",
    });
  });

  test("prepare refuses an existing writable epoch and an invalid projection", async () => {
    const existingDb = makeDb();
    existingDb
      .insert(schema.syncEpochs)
      .values({ id: "already-here", schemaVersion: 1, status: "preparing" })
      .run();
    await expect(
      prepareWithGuardrails(existingDb, { backup: backupProof() }),
    ).rejects.toThrow(/writable epoch already exists/);

    const dirtyDb = makeDb();
    dirtyDb
      .insert(schema.categories)
      .values({ id: "orphan", name: "Orphan", groupId: "missing" })
      .run();
    await expect(
      prepareWithGuardrails(dirtyDb, { backup: backupProof() }),
    ).rejects.toThrow();
    expect(dirtyDb.select().from(schema.syncEpochs).all()).toEqual([]);
  });

  test("prepare refuses to transition while configuration is not disabled", async () => {
    const db = makeDb();
    await expect(
      prepareWithGuardrails(db, {
        backup: backupProof(),
        configuredMode: "preparing",
      }),
    ).rejects.toThrow(/requires GULLAK_SYNC_V2_MODE=disabled/);
    expect(db.select().from(schema.syncEpochs).all()).toEqual([]);
  });

  test("activation requires typed confirmation, clean audit, and verified backup", async () => {
    const db = makeDb();
    const proof = backupProof();
    db.insert(schema.accounts)
      .values({ id: "account-activation", name: "Activation account" })
      .run();
    await prepareWithGuardrails(db, {
      epochId: "epoch-activate",
      genesisActorId: "genesis-activate",
      serverActorId: "server-activate",
      backup: proof,
      createdAt: 1_800_000_000_000,
    });

    await expect(
      activateWithGuardrails(db, {
        epochId: "epoch-activate",
        confirmation: "yes",
        backup: proof,
      }),
    ).rejects.toThrow(/--confirm ACTIVATE:epoch-activate/);

    await expect(
      activateWithGuardrails(db, {
        epochId: "epoch-activate",
        confirmation: "ACTIVATE:epoch-activate",
        backup: proof,
      }),
    ).rejects.toThrow(/no live v2 client/);
    acknowledgeCurrentHead(db, "epoch-activate");
    db.update(schema.syncClients).set({ acknowledgedCursor: 0 }).run();
    await expect(
      activateWithGuardrails(db, {
        epochId: "epoch-activate",
        confirmation: "ACTIVATE:epoch-activate",
        backup: proof,
      }),
    ).rejects.toThrow(/cursor 0 does not equal head 1/);
    db.update(schema.syncClients).set({ acknowledgedCursor: 1 }).run();
    await sealLegacyInventoryWithGuardrails(db, {
      epochId: "epoch-activate",
      clientIds: [],
      confirmation: "SEAL-LEGACY:epoch-activate",
      backup: proof,
      sealedAt: 1_800_000_000_001,
    });

    const dryRun = await activateWithGuardrails(db, {
      epochId: "epoch-activate",
      confirmation: "ACTIVATE:epoch-activate",
      backup: proof,
      dryRun: true,
    });
    expect(dryRun).toMatchObject({ dryRun: true, audit: { clean: true } });
    expect(db.select().from(schema.syncEpochs).get()?.status).toBe("preparing");

    const result = await activateWithGuardrails(db, {
      epochId: "epoch-activate",
      confirmation: "ACTIVATE:epoch-activate",
      backup: proof,
    });
    expect(result).toMatchObject({
      dryRun: false,
      activated: { epochId: "epoch-activate" },
    });
    expect(db.select().from(schema.syncEpochs).get()?.status).toBe("active");
  });

  test("activation refuses a tampered checkpoint without changing status", async () => {
    const db = makeDb();
    const proof = backupProof();
    await prepareWithGuardrails(db, {
      epochId: "epoch-tampered",
      genesisActorId: "genesis-tampered",
      serverActorId: "server-tampered",
      backup: proof,
    });
    db.update(schema.syncCheckpoints)
      .set({ contentHash: "0".repeat(64) })
      .run();

    await expect(
      activateWithGuardrails(db, {
        epochId: "epoch-tampered",
        confirmation: "ACTIVATE:epoch-tampered",
        backup: proof,
      }),
    ).rejects.toThrow(/checkpoint content hash mismatch/);
    expect(db.select().from(schema.syncEpochs).get()?.status).toBe("preparing");
  });

  test("activation blocks an inventoried offline v1 outbox until explicit drain", async () => {
    const db = makeDb();
    db.insert(schema.changeLog)
      .values({
        clientId: "offline-v1",
        clientChangeId: "seen-before",
        resource: "accounts",
        resourceId: "a1",
        op: "delete",
      })
      .run();
    const proof = backupProof();
    await prepareWithGuardrails(db, {
      epochId: "epoch-legacy-gate",
      genesisActorId: "genesis-legacy-gate",
      serverActorId: "server-legacy-gate",
      backup: proof,
    });
    acknowledgeCurrentHead(db, "epoch-legacy-gate");
    await sealLegacyInventoryWithGuardrails(db, {
      epochId: "epoch-legacy-gate",
      clientIds: ["offline-v1"],
      confirmation: "SEAL-LEGACY:epoch-legacy-gate",
      backup: proof,
    });
    await expect(
      activateWithGuardrails(db, {
        epochId: "epoch-legacy-gate",
        confirmation: "ACTIVATE:epoch-legacy-gate",
        backup: proof,
        dryRun: true,
      }),
    ).rejects.toThrow(/offline-v1: status=pending/);

    db.update(schema.syncLegacyClients)
      .set({
        status: "drained",
        migratedActorId: "phone-v2",
        drainedV1Head: 1,
        drainedAt: 10,
      })
      .where(eq(schema.syncLegacyClients.clientId, "offline-v1"))
      .run();
    await expect(
      activateWithGuardrails(db, {
        epochId: "epoch-legacy-gate",
        confirmation: "ACTIVATE:epoch-legacy-gate",
        backup: proof,
        dryRun: true,
      }),
    ).resolves.toMatchObject({ dryRun: true });
  });

  test("explicit retirement removes an abandoned actor from the ACK gate", async () => {
    const db = makeDb();
    const proof = backupProof();
    await prepareWithGuardrails(db, {
      epochId: "epoch-retire",
      genesisActorId: "genesis-retire",
      serverActorId: "server-retire",
      backup: proof,
    });
    acknowledgeCurrentHead(db, "epoch-retire");
    db.insert(schema.syncClients)
      .values({
        actorId: "abandoned-phone",
        actorTokenHash: "b".repeat(64),
        protocolVersion: 2,
        epoch: "epoch-retire",
        status: "active",
        acknowledgedCursor: 0,
        acknowledgedFrontierJson: "{}",
        bootstrapCheckpointId: "epoch-retire:genesis",
      })
      .run();

    await expect(
      retireClientWithGuardrails(db, {
        actorId: "abandoned-phone",
        confirmation: "yes",
        backup: proof,
      }),
    ).rejects.toThrow(/--confirm RETIRE:abandoned-phone/);
    const dryRun = await retireClientWithGuardrails(db, {
      actorId: "abandoned-phone",
      confirmation: "RETIRE:abandoned-phone",
      backup: proof,
      dryRun: true,
      retiredAt: 123,
    });
    expect(dryRun).toMatchObject({ action: "retire", dryRun: true });
    expect(
      db
        .select()
        .from(schema.syncClients)
        .where(eq(schema.syncClients.actorId, "abandoned-phone"))
        .get()?.status,
    ).toBe("active");

    await retireClientWithGuardrails(db, {
      actorId: "abandoned-phone",
      confirmation: "RETIRE:abandoned-phone",
      backup: proof,
      retiredAt: 123,
    });
    expect(
      db
        .select()
        .from(schema.syncClients)
        .where(eq(schema.syncClients.actorId, "abandoned-phone"))
        .get(),
    ).toMatchObject({ status: "retired", retiredAt: 123 });

    await sealLegacyInventoryWithGuardrails(db, {
      epochId: "epoch-retire",
      clientIds: [],
      confirmation: "SEAL-LEGACY:epoch-retire",
      backup: proof,
      sealedAt: 124,
    });

    const ready = await activateWithGuardrails(db, {
      epochId: "epoch-retire",
      confirmation: "ACTIVATE:epoch-retire",
      backup: proof,
      dryRun: true,
    });
    expect(ready).toMatchObject({ dryRun: true });
  });

  test("operator errors remain distinguishable from validation failures", () => {
    expect(new SyncV2OperatorError("x")).toBeInstanceOf(Error);
  });
});
