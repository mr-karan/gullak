import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, test } from "vitest";

import * as schema from "../db/schema.ts";
import { ensureActiveEpoch } from "./active_epoch.ts";
import { collectSyncV2Status } from "./operator.ts";

test("status independently audits the one active epoch and deterministic fold", () => {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });

  const epoch = ensureActiveEpoch(db);
  const report = collectSyncV2Status(db);

  expect(report.protocol).toBe(2);
  expect(report.activeEpochInvariant).toEqual({ valid: true, activeCount: 1 });
  expect(report.projection.valid).toBe(true);
  expect(report.epochs).toHaveLength(1);
  expect(report.epochs[0]).toMatchObject({ id: epoch });
  expect(report.epochs[0]!.integrity).toMatchObject({ clean: true });
  expect(report.epochs[0]!.checkpoints[0]).not.toHaveProperty("registersJson");
  expect(report.epochs[0]!.checkpoints[0]).toMatchObject({
    frontier: {},
  });
  expect(report.epochs[0]!.checkpoints[0]!.registerSnapshotBytes).toBeGreaterThan(0);
  expect(report.quarantine).toMatchObject({ total: 0, unresolved: 0 });
});
