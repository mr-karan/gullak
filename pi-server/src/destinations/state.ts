import { eq, sql } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import { exportState } from "../db/schema.ts";

/** Durable per-destination export cursor + health, keyed by destination name. */
export function readExportState(db: Db, destination: string) {
  const existing = db
    .select()
    .from(exportState)
    .where(eq(exportState.destination, destination))
    .get();
  if (existing) return existing;
  db.insert(exportState)
    .values({ destination })
    .onConflictDoNothing()
    .run();
  return db
    .select()
    .from(exportState)
    .where(eq(exportState.destination, destination))
    .get()!;
}

export function markExportSuccess(
  db: Db,
  destination: string,
  cursor: number,
  attemptAt: number,
) {
  db.update(exportState)
    .set({
      cursor,
      lastAttemptAt: attemptAt,
      lastSuccessAt: attemptAt,
      lastError: null,
      consecutiveFailures: 0,
      updatedAt: attemptAt,
    })
    .where(eq(exportState.destination, destination))
    .run();
}

export function markExportFailure(
  db: Db,
  destination: string,
  attemptAt: number,
  message: string,
) {
  db.update(exportState)
    .set({
      lastAttemptAt: attemptAt,
      lastError: message,
      consecutiveFailures: sql`${exportState.consecutiveFailures} + 1`,
      updatedAt: attemptAt,
    })
    .where(eq(exportState.destination, destination))
    .run();
}

/** Advance the cursor without a full attempt (e.g. a window with only skipped rows). */
export function advanceExportCursor(db: Db, destination: string, cursor: number) {
  db.update(exportState)
    .set({ cursor, updatedAt: Date.now() })
    .where(eq(exportState.destination, destination))
    .run();
}
