import { eq, lt } from "drizzle-orm";

import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import { accounts, categories, payees, transactions } from "../db/schema.ts";
import { getAccessToken, loadServiceAccount } from "./auth.ts";
import {
  appendValues,
  getValues,
  SHEETS_SCOPE,
  updateValues,
} from "./client.ts";
import { mapCategory, paymentModeForKind } from "./mapping.ts";

export interface SheetsSyncResult {
  total: number; // expense (debit) txns considered
  pushed: number; // appended as new rows
  updated: number; // existing rows refreshed
  skipped: number; // uncategorised / excluded / transfers
}

/** True when the feature is configured enough to run. */
export function sheetsEnabled(config: AppConfig): boolean {
  return Boolean(
    config.sheets.spreadsheetId && config.sheets.serviceAccountKey,
  );
}

/**
 * Push categorised expenses into the Finance Tracker's Daily Expense Tracker
 * tab. Idempotent: the Gullak transaction id is written into a hidden column
 * (H) and used as the upsert key, so re-runs update the same row instead of
 * duplicating. Only debit transactions that map to a sheet category are
 * pushed (see mapping.ts) — uncategorised, transfers, splits, income, tax,
 * card-bill fees and cash withdrawals are skipped.
 */
export async function syncExpensesToSheet(
  db: Db,
  config: AppConfig,
): Promise<SheetsSyncResult> {
  const { spreadsheetId, serviceAccountKey, tab } = config.sheets;
  if (!spreadsheetId || !serviceAccountKey) {
    throw new Error(
      "sheets sync not configured (set GULLAK_SHEETS_ID + GULLAK_SHEETS_SA_KEY)",
    );
  }
  const sa = loadServiceAccount(serviceAccountKey);
  const token = await getAccessToken(sa, SHEETS_SCOPE);

  const rows = db
    .select()
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(payees, eq(payees.id, transactions.payeeId))
    .leftJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(lt(transactions.amountCents, 0))
    .all();

  // Build sheet rows (cols A:H = Date, Description, Category, Amount,
  // Payment Mode, Type, Notes, tid), skipping anything that shouldn't land.
  const out: { tid: string; values: (string | number)[] }[] = [];
  for (const r of rows) {
    const t = r.transactions;
    if (t.transferAccountId || t.parentId) continue; // transfer / split parent
    const mapped = mapCategory(r.categories?.name ?? null);
    if (!mapped) continue;
    const description =
      (r.payees?.name ?? t.payeeName ?? r.categories?.name ?? "").trim() ||
      mapped.category;
    const amount = Math.round(Math.abs(t.amountCents) / 100);
    out.push({
      tid: t.id,
      values: [
        t.date,
        description,
        mapped.category,
        amount,
        paymentModeForKind(r.accounts?.kind),
        mapped.type,
        t.notes ?? "",
        t.id,
      ],
    });
  }

  // Map existing tid → sheet row number (H2 = row 2) for upsert.
  const existing = await getValues(token, spreadsheetId, `${tab}!H2:H`);
  const tidToRow = new Map<string, number>();
  existing.forEach((row, i) => {
    const tid = row[0];
    if (tid) tidToRow.set(tid, i + 2);
  });

  let updated = 0;
  const toAppend: (string | number)[][] = [];
  for (const o of out) {
    const rowNum = tidToRow.get(o.tid);
    if (rowNum) {
      await updateValues(
        token,
        spreadsheetId,
        `${tab}!A${rowNum}:H${rowNum}`,
        [o.values],
      );
      updated += 1;
    } else {
      toAppend.push(o.values);
    }
  }
  if (toAppend.length > 0) {
    await appendValues(token, spreadsheetId, `${tab}!A2:H`, toAppend);
  }

  return {
    total: rows.length,
    pushed: toAppend.length,
    updated,
    skipped: rows.length - out.length,
  };
}
