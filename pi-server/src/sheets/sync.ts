import { eq, lt } from "drizzle-orm";

import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import { accounts, categories, payees, transactions } from "../db/schema.ts";
import { mapCategory, paymentModeForKind } from "./mapping.ts";

export interface SheetsSyncResult {
  total: number; // expense (debit) txns considered
  sent: number; // rows POSTed
  skipped: number; // uncategorised / excluded / transfers
}

/** True when the Apps Script endpoint is configured. */
export function sheetsEnabled(config: AppConfig): boolean {
  return Boolean(config.sheets.webAppUrl && config.sheets.secret);
}

/**
 * POSTs categorised expenses to the sheet's Apps Script web app (no service
 * account, no Sheets API). The Apps Script dedupes by the gullak_id column, so
 * sending the full set is idempotent — re-runs never duplicate. Only debit
 * transactions that map to a sheet category are sent; uncategorised, transfers,
 * splits, income, tax, card-bill fees and cash withdrawals are skipped.
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

  const rows = db
    .select()
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(payees, eq(payees.id, transactions.payeeId))
    .leftJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(lt(transactions.amountCents, 0))
    .all();

  // A:H = Date, Description, Category, Amount, Payment Mode, Type, Notes, tid
  const out: (string | number)[][] = [];
  for (const r of rows) {
    const t = r.transactions;
    if (t.transferAccountId || t.parentId) continue; // transfer / split parent
    const mapped = mapCategory(r.categories?.name ?? null);
    if (!mapped) continue;
    const description =
      (r.payees?.name ?? t.payeeName ?? r.categories?.name ?? "").trim() ||
      mapped.category;
    out.push([
      t.date,
      description,
      mapped.category,
      // minor units → rupees, preserving paise (e.g. 298713 → 2987.13)
      Number((Math.abs(t.amountCents) / 100).toFixed(2)),
      paymentModeForKind(r.accounts?.kind),
      mapped.type,
      t.notes ?? "",
      t.id,
    ]);
  }

  if (out.length === 0) {
    return { total: rows.length, sent: 0, skipped: rows.length };
  }

  const res = await fetch(webAppUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret, rows: out, replace: opts.replace === true }),
  });
  if (!res.ok) {
    throw new Error(`sheets POST ${res.status}: ${await res.text()}`);
  }
  return { total: rows.length, sent: out.length, skipped: rows.length - out.length };
}
