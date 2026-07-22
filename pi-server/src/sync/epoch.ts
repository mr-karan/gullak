import { and, eq, inArray, sql } from "drizzle-orm";

import { syncCheckpoints, syncEpochs } from "../db/schema.ts";
import type { DbOrTx } from "../repos/changelog.ts";

export type SyncV2RolloutMode = "disabled" | "preparing" | "active";

export type WritableEpoch = {
  id: string;
  status: "preparing" | "active";
  schemaVersion: number;
};

export class SyncEpochConfigurationError extends Error {
  override readonly name = "SyncEpochConfigurationError";
}

/**
 * Resolve the one epoch that may accept writes. Route callers pass the config
 * mode so a stale process configuration can never write an epoch in a
 * different database state. A preparing epoch is exposed only after its
 * genesis checkpoint was verified.
 */
export function configuredWritableEpoch(
  db: DbOrTx,
  mode: SyncV2RolloutMode,
): WritableEpoch | null {
  const rows = db
    .select({
      id: syncEpochs.id,
      status: syncEpochs.status,
      schemaVersion: syncEpochs.schemaVersion,
    })
    .from(syncEpochs)
    .where(inArray(syncEpochs.status, ["preparing", "active"]))
    .all();
  if (mode === "disabled") {
    if (rows.length > 1) {
      throw new SyncEpochConfigurationError(
        `disabled sync mode found ${rows.length} writable epochs`,
      );
    }
    if (rows[0]?.status === "active") {
      throw new SyncEpochConfigurationError(
        `sync mode disabled does not match active epoch ${rows[0].id}`,
      );
    }
    // One preparing epoch is the intentional pre-negotiation shadow stage:
    // v1 continues while recordChange fills the immutable history.
    return null;
  }
  if (rows.length !== 1) {
    throw new SyncEpochConfigurationError(
      `expected exactly one writable sync epoch, found ${rows.length}`,
    );
  }
  const row = rows[0]!;
  if (row.status !== mode) {
    throw new SyncEpochConfigurationError(
      `sync mode ${mode} does not match epoch ${row.id} status ${row.status}`,
    );
  }
  if (row.status !== "preparing" && row.status !== "active") {
    throw new SyncEpochConfigurationError(
      `epoch ${row.id} has unsupported writable status ${row.status}`,
    );
  }

  if (row.status === "preparing") {
    const verified = db
      .select({ count: sql<number>`count(*)` })
      .from(syncCheckpoints)
      .where(
        and(
          eq(syncCheckpoints.epoch, row.id),
          eq(syncCheckpoints.isGenesis, true),
          sql`${syncCheckpoints.verifiedAt} IS NOT NULL`,
        ),
      )
      .get()?.count;
    if (verified !== 1) {
      throw new SyncEpochConfigurationError(
        `preparing epoch ${row.id} does not have one verified genesis checkpoint`,
      );
    }
  }

  return {
    id: row.id,
    status: row.status,
    schemaVersion: row.schemaVersion,
  };
}
