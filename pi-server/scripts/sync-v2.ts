#!/usr/bin/env node
import { resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { loadConfig } from "../src/config.ts";
import { getDb } from "../src/db/index.ts";
import * as schema from "../src/db/schema.ts";
import {
  collectSyncV2Status,
  retireClientWithGuardrails,
  SyncV2OperatorError,
} from "../src/sync/operator.ts";

function usage(): never {
  throw new SyncV2OperatorError(`usage:
  npm run sync:v2 -- status
  npm run sync:v2 -- audit
  npm run sync:v2 -- retire --actor ID --confirm RETIRE:ID --backup PATH --backup-sha256 HEX [--dry-run]

status and audit are read-only. Retirement requires an exact confirmation and a
current, checksummed SQLite backup. This tool never deletes CRDT history.`);
}

function parseArgs(argv: string[]) {
  const [providedCommand, ...rest] = argv;
  const command = providedCommand ?? "status";
  const flags = new Map<string, string | true>();
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (flag === undefined || !flag.startsWith("--")) usage();
    if (flag === "--dry-run") {
      flags.set(flag, true);
      continue;
    }
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) usage();
    flags.set(flag, value);
    index += 1;
  }
  return { command, flags };
}

function requiredFlag(flags: Map<string, string | true>, name: string): string {
  const value = flags.get(name);
  if (typeof value !== "string") throw new SyncV2OperatorError(`${name} is required`);
  return value;
}

async function main(): Promise<void> {
  const { command, flags } = parseArgs(process.argv.slice(2));
  const config = loadConfig();
  if (command === "status" || command === "audit") {
    if (flags.size !== 0) usage();
    const sqlite = new Database(resolve(config.dbPath), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      const report = collectSyncV2Status(drizzle(sqlite, { schema }));
      console.log(JSON.stringify(report, null, 2));
      if (
        command === "audit" &&
        (!report.activeEpochInvariant.valid ||
          !report.projection.valid ||
          report.epochs.some((epoch) => !epoch.integrity.clean))
      ) {
        process.exitCode = 2;
      }
    } finally {
      sqlite.close();
    }
    return;
  }
  if (command !== "retire") usage();
  const result = await retireClientWithGuardrails(getDb(), {
    actorId: requiredFlag(flags, "--actor"),
    confirmation: requiredFlag(flags, "--confirm"),
    backup: {
      path: resolve(requiredFlag(flags, "--backup")),
      sha256: requiredFlag(flags, "--backup-sha256"),
      databasePath: resolve(config.dbPath),
    },
    dryRun: flags.get("--dry-run") === true,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error: unknown) => {
  console.error(
    JSON.stringify(
      { ok: false, error: error instanceof Error ? error.message : String(error) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
});
