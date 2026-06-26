import { and, eq, gte, lt, sql } from "drizzle-orm";

import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import {
  accounts,
  categories,
  payees,
  sheetsSyncState,
  transactions,
} from "../db/schema.ts";
import {
  isExcludedCategory,
  mapCategory,
  paymentModeForKind,
} from "./mapping.ts";

/**
 * Bank card-alert SMS often leak boilerplate into the stored payee name, e.g.
 * "BOOZE BOUTIQUE On 2026-06-20:17:07:04.Not You? To Block..." or
 * "+SECTOR 21 C On 2026-05-28:14:11:13 Bal Rs.326989". Keep just the merchant
 * by cutting at the " On <date>" marker so the sheet's Description column is
 * human-readable rather than a wall of fraud-warning text.
 */
function cleanMerchant(raw: string | null | undefined): string {
  if (!raw) return "";
  const cut = raw.split(/\s+On\s+\d{4}-\d{2}-\d{2}/)[0] ?? raw;
  return cut.trim();
}

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
  const { webAppUrl, secret } = config.sheets;
  if (!webAppUrl || !secret) {
    throw new Error(
      "sheets sync not configured (GULLAK_SHEETS_WEBAPP_URL + GULLAK_SHEETS_SECRET)",
    );
  }

  const replace = opts.replace === true;
  const state = readState(db);
  // A full replace re-exports the whole table; an incremental run only scans
  // rows changed at or after the last confirmed high-water mark.
  const since = replace ? 0 : state.cursor;

  const rows = db
    .select()
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(payees, eq(payees.id, transactions.payeeId))
    .leftJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(
        lt(transactions.amountCents, 0),
        gte(transactions.updatedAt, since),
      ),
    )
    .all();

  // A:H = Date, Description, Category, Amount, Payment Mode, Type, Notes, tid
  const out: (string | number)[][] = [];
  let maxUpdatedAt = state.cursor;
  for (const r of rows) {
    const t = r.transactions;
    if (t.updatedAt > maxUpdatedAt) maxUpdatedAt = t.updatedAt;
    if (t.transferAccountId || t.parentId) continue; // transfer / split parent
    const catName = r.categories?.name ?? null;
    // Drop only the deliberately-non-spend buckets (cash withdrawal, fees,
    // taxes, giving, income). Uncategorised expenses are NOT dropped — they go
    // up with a blank Category/Type so the user can fill them in the sheet.
    if (isExcludedCategory(catName)) continue;
    const mapped = mapCategory(catName);
    const description =
      cleanMerchant(r.payees?.name) ||
      cleanMerchant(t.payeeName) ||
      catName ||
      "Uncategorised";
    out.push([
      t.date,
      description,
      mapped?.category ?? "", // blank when uncategorised/unmapped — user fills it
      // minor units → rupees, preserving paise (e.g. 298713 → 2987.13)
      Number((Math.abs(t.amountCents) / 100).toFixed(2)),
      paymentModeForKind(r.accounts?.kind),
      mapped?.type ?? "",
      t.notes ?? "",
      t.id,
    ]);
  }

  // Nothing changed since the last run — no POST, no state churn.
  if (out.length === 0 && !replace) {
    return { total: rows.length, sent: 0, skipped: rows.length, cursor: state.cursor };
  }

  const attemptAt = Date.now();
  try {
    const res = await fetch(webAppUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, rows: out, replace }),
    });
    if (!res.ok) {
      throw new Error(`sheets POST ${res.status}: ${await res.text()}`);
    }
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
    return {
      total: rows.length,
      sent: out.length,
      skipped: rows.length - out.length,
      cursor: maxUpdatedAt,
    };
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
