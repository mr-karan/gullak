import { eq, sql } from "drizzle-orm";

import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import { sheetsSyncState } from "../db/schema.ts";
import { collectExpenses } from "../destinations/collect.ts";
import { SheetsDestination } from "../destinations/sheets.ts";

export interface SheetsSyncResult {
  total: number; // expense (debit) txns in the scanned window
  sent: number; // rows POSTed
  skipped: number; // uncategorised / excluded / transfers
  cursor: number; // high-water updatedAt persisted after a successful push
}

export interface SheetsSyncStatus {
  enabled: boolean;
  cursor: number;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  lastError: string | null;
  consecutiveFailures: number;
}

const STATE_ID = 1;

/** True when the Apps Script endpoint is configured. */
export function sheetsEnabled(config: AppConfig): boolean {
  return Boolean(config.sheets.webAppUrl && config.sheets.secret);
}

/** Reads the single-row durable sync state, creating it on first access. */
function readState(db: Db) {
  const existing = db
    .select()
    .from(sheetsSyncState)
    .where(eq(sheetsSyncState.id, STATE_ID))
    .get();
  if (existing) return existing;
  db.insert(sheetsSyncState)
    .values({ id: STATE_ID })
    .onConflictDoNothing()
    .run();
  return db
    .select()
    .from(sheetsSyncState)
    .where(eq(sheetsSyncState.id, STATE_ID))
    .get()!;
}

/** Snapshot of the durable push state for the health/status endpoint. */
export function sheetsSyncStatus(
  db: Db,
  config: AppConfig,
): SheetsSyncStatus {
  const s = readState(db);
  return {
    enabled: sheetsEnabled(config),
    cursor: s.cursor,
    lastAttemptAt: s.lastAttemptAt,
    lastSuccessAt: s.lastSuccessAt,
    lastError: s.lastError,
    consecutiveFailures: s.consecutiveFailures,
  };
}

/**
 * Pushes categorised expenses to the sheet's Apps Script web app (no service
 * account, no Sheets API). Two properties make it safe and cheap to call after
 * every sync push and on the interval:
 *
 *  - **Incremental**: only transactions whose `updatedAt >= cursor` are sent
 *    (`cursor` is the high-water mark persisted after the last success). A
 *    re-categorised row bumps its `updatedAt` and re-enters the window, so
 *    edits propagate; the Apps Script upserts by `gullak_id`, so re-sending the
 *    boundary row is harmless. `replace: true` (manual full export) ignores the
 *    cursor and resends everything.
 *  - **Durable**: the cursor only advances after a successful POST, and the
 *    attempt/error fields are persisted. A failed push is retried on the next
 *    push or interval, and survives process restart — nothing is silently lost.
 *
 * Only debit transactions that map to a sheet category are sent; uncategorised,
 * transfers, splits, income, tax, card-bill fees and cash withdrawals are
 * skipped (but still advance the cursor so they aren't rescanned forever).
 */
export async function syncExpensesToSheet(
  db: Db,
  config: AppConfig,
  opts: { replace?: boolean } = {},
): Promise<SheetsSyncResult> {
  const dest = new SheetsDestination(config);
  if (!dest.isEnabled()) {
    throw new Error(
      "sheets sync not configured (GULLAK_SHEETS_WEBAPP_URL + GULLAK_SHEETS_SECRET)",
    );
  }

  const replace = opts.replace === true;
  const state = readState(db);
  // A full replace re-exports the whole table; an incremental run only scans
  // rows changed at or after the last confirmed high-water mark.
  const since = replace ? 0 : state.cursor;
  const { rows, scanned, maxUpdatedAt } = collectExpenses(
    db,
    since,
    state.cursor,
  );

  // Nothing to POST this run. If we still scanned rows (all transfers/splits),
  // advance the cursor anyway so the same window isn't rescanned forever —
  // otherwise a window that's entirely skipped rows pins the cursor in place.
  if (rows.length === 0 && !replace) {
    if (scanned > 0 && maxUpdatedAt > state.cursor) {
      db.update(sheetsSyncState)
        .set({ cursor: maxUpdatedAt, updatedAt: Date.now() })
        .where(eq(sheetsSyncState.id, STATE_ID))
        .run();
    }
    return { total: scanned, sent: 0, skipped: scanned, cursor: maxUpdatedAt };
  }

  const attemptAt = Date.now();
  try {
    const { sent } = await dest.export(rows, { replace });
    // Success: advance the high-water cursor and clear the error state.
    db.update(sheetsSyncState)
      .set({
        cursor: maxUpdatedAt,
        lastAttemptAt: attemptAt,
        lastSuccessAt: attemptAt,
        lastError: null,
        consecutiveFailures: 0,
        updatedAt: attemptAt,
      })
      .where(eq(sheetsSyncState.id, STATE_ID))
      .run();
    return { total: scanned, sent, skipped: scanned - sent, cursor: maxUpdatedAt };
  } catch (e) {
    // Failure: record it but DON'T advance the cursor, so the next push or
    // interval retries the same window.
    const message = e instanceof Error ? e.message : String(e);
    db.update(sheetsSyncState)
      .set({
        lastAttemptAt: attemptAt,
        lastError: message,
        consecutiveFailures: sql`${sheetsSyncState.consecutiveFailures} + 1`,
        updatedAt: attemptAt,
      })
      .where(eq(sheetsSyncState.id, STATE_ID))
      .run();
    throw e;
  }
}
