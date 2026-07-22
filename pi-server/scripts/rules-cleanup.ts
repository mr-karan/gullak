#!/usr/bin/env node
import { resolve } from "node:path";

import { loadConfig } from "../src/config.ts";
import { getDb } from "../src/db/index.ts";
import {
  cleanupLegacyRulesWithGuardrails,
  LegacyRuleCleanupError,
} from "../src/rules/cleanup.ts";

function flag(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const config = loadConfig();
  const backupPath = flag("--backup");
  const backupSha256 = flag("--backup-sha256");
  const confirmation = flag("--confirm");
  if (!backupPath || !backupSha256 || !confirmation) {
    throw new LegacyRuleCleanupError(
      "usage: npm run rules:cleanup -- --confirm CLEANUP-LEGACY-RULES --backup PATH --backup-sha256 HEX [--dry-run]",
    );
  }
  const result = await cleanupLegacyRulesWithGuardrails(getDb(), {
    confirmation,
    backup: {
      path: resolve(backupPath),
      sha256: backupSha256,
      databasePath: resolve(config.dbPath),
    },
    dryRun: process.argv.includes("--dry-run"),
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
