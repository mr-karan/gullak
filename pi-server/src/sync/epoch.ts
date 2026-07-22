import { eq } from "drizzle-orm";

import { syncEpochs } from "../db/schema.ts";
import type { DbOrTx } from "../repos/changelog.ts";

export type WritableEpoch = {
  id: string;
  status: "active";
  schemaVersion: number;
};

export class SyncEpochConfigurationError extends Error {
  override readonly name = "SyncEpochConfigurationError";
}

/**
 * Resolve the one active epoch. Rollout modes were deliberately removed after
 * the audited cutover; a modern server either has one active epoch or refuses
 * sync and financial writes.
 */
export function configuredWritableEpoch(
  db: DbOrTx,
): WritableEpoch {
  const rows = db
    .select({
      id: syncEpochs.id,
      status: syncEpochs.status,
      schemaVersion: syncEpochs.schemaVersion,
    })
    .from(syncEpochs)
    .where(eq(syncEpochs.status, "active"))
    .all();
  if (rows.length !== 1) {
    throw new SyncEpochConfigurationError(
      `expected exactly one writable sync epoch, found ${rows.length}`,
    );
  }
  const row = rows[0]!;
  if (row.status !== "active") {
    throw new SyncEpochConfigurationError(
      `epoch ${row.id} has unsupported writable status ${row.status}`,
    );
  }

  return {
    id: row.id,
    status: row.status,
    schemaVersion: row.schemaVersion,
  };
}
