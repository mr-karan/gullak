#!/usr/bin/env node
import { resolve } from "node:path";

import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";

import { loadConfig } from "../src/config.ts";
import { getDb } from "../src/db/index.ts";
import * as schema from "../src/db/schema.ts";
import {
  activateWithGuardrails,
  collectSyncV2Status,
  prepareWithGuardrails,
  retireLegacyClientWithGuardrails,
  retireClientWithGuardrails,
  sealLegacyInventoryWithGuardrails,
  SyncV2OperatorError,
} from "../src/sync/operator.ts";

function usage(): never {
  throw new SyncV2OperatorError(`usage:
  npm run sync:v2 -- status
  npm run sync:v2 -- audit
  npm run sync:v2 -- prepare --backup PATH --backup-sha256 HEX [--epoch ID] [--genesis-actor ID] [--server-actor ID] [--dry-run]
  npm run sync:v2 -- seal-legacy --epoch ID --clients ID[,ID...] --confirm SEAL-LEGACY:ID --backup PATH --backup-sha256 HEX [--dry-run]
  npm run sync:v2 -- activate --epoch ID --confirm ACTIVATE:ID --backup PATH --backup-sha256 HEX [--dry-run]
  npm run sync:v2 -- retire-legacy --client ID --confirm RETIRE-LEGACY:ID --backup PATH --backup-sha256 HEX [--dry-run]
  npm run sync:v2 -- retire --actor ID --confirm RETIRE:ID --backup PATH --backup-sha256 HEX [--dry-run]

status and audit are read-only. prepare/activate refuse to run unless a distinct,
non-empty backup file exists and its SHA-256 matches. No command deletes data.`);
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

function stringFlag(
  flags: Map<string, string | true>,
  name: string,
  required = false,
): string | undefined {
  const value = flags.get(name);
  if (required && typeof value !== "string") {
    throw new SyncV2OperatorError(`${name} is required`);
  }
  return typeof value === "string" ? value : undefined;
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
      const readOnlyDb = drizzle(sqlite, { schema });
      const report = collectSyncV2Status(readOnlyDb, config.syncV2Mode);
      console.log(JSON.stringify(report, null, 2));
      if (
        command === "audit" &&
        (!report.config.matches ||
          !report.projection.valid ||
          report.epochs.some(
            (epoch) =>
              ["preparing", "active"].includes(epoch.status) &&
              !epoch.integrity.clean,
          ))
      ) {
        process.exitCode = 2;
      }
    } finally {
      sqlite.close();
    }
    return;
  }

  const db = getDb();
  const backupPath = stringFlag(flags, "--backup", true)!;
  const backupSha256 = stringFlag(flags, "--backup-sha256", true)!;
  const backup = {
    path: resolve(backupPath),
    sha256: backupSha256,
    databasePath: resolve(config.dbPath),
  };
  if (command === "prepare") {
    const result = await prepareWithGuardrails(db, {
      epochId: stringFlag(flags, "--epoch"),
      genesisActorId: stringFlag(flags, "--genesis-actor"),
      serverActorId: stringFlag(flags, "--server-actor"),
      backup,
      dryRun: flags.get("--dry-run") === true,
      configuredMode: config.syncV2Mode,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "activate") {
    const epochId = stringFlag(flags, "--epoch", true)!;
    const result = await activateWithGuardrails(db, {
      epochId,
      confirmation: stringFlag(flags, "--confirm", true)!,
      backup,
      dryRun: flags.get("--dry-run") === true,
      configuredMode: config.syncV2Mode,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "seal-legacy") {
    const epochId = stringFlag(flags, "--epoch", true)!;
    const clients = (stringFlag(flags, "--clients") ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const result = await sealLegacyInventoryWithGuardrails(db, {
      epochId,
      clientIds: clients,
      confirmation: stringFlag(flags, "--confirm", true)!,
      backup,
      dryRun: flags.get("--dry-run") === true,
      configuredMode: config.syncV2Mode,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "retire") {
    const actorId = stringFlag(flags, "--actor", true)!;
    const result = await retireClientWithGuardrails(db, {
      actorId,
      confirmation: stringFlag(flags, "--confirm", true)!,
      backup,
      dryRun: flags.get("--dry-run") === true,
      configuredMode: config.syncV2Mode,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  if (command === "retire-legacy") {
    const clientId = stringFlag(flags, "--client", true)!;
    const result = await retireLegacyClientWithGuardrails(db, {
      clientId,
      confirmation: stringFlag(flags, "--confirm", true)!,
      backup,
      dryRun: flags.get("--dry-run") === true,
      configuredMode: config.syncV2Mode,
    });
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  usage();
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(JSON.stringify({ ok: false, error: message }, null, 2));
  process.exitCode = 1;
});
