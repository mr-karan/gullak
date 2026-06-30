import { and, eq, gte, lt } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import {
  accounts,
  categories,
  payees,
  tags,
  transactionTags,
  transactions,
} from "../db/schema.ts";
import type { CanonicalExpense } from "./types.ts";

/**
 * Bank card-alert SMS often leak boilerplate into the stored payee name, e.g.
 * "BOOZE BOUTIQUE On 2026-06-20:17:07:04.Not You? To Block..." or
 * "+SECTOR 21 C On 2026-05-28:14:11:13 Bal Rs.326989". Keep just the merchant
 * by cutting at the " On <date>" marker so every destination gets a
 * human-readable description rather than a wall of fraud-warning text.
 */
export function cleanMerchant(raw: string | null | undefined): string {
  if (!raw) return "";
  const cut = raw.split(/\s+On\s+\d{4}-\d{2}-\d{2}/)[0] ?? raw;
  return cut.trim();
}

/**
 * SMS-origin transactions carry a "SMS · <sender>" placeholder note which is
 * noise — the merchant is already in the description and the source is implied
 * by the payment mode. Drop it so the note only carries a real, human-written
 * note when one exists.
 */
export function cleanNote(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const n = raw.trim();
  if (/^SMS\s*[·.]/.test(n)) return null; // "SMS · <sender>" placeholder
  return n || null;
}

export interface CollectResult {
  /** Exportable rows (transfer legs and split children removed). */
  rows: CanonicalExpense[];
  /** Debit txns in the scanned window, including the ones skipped below. */
  scanned: number;
  /**
   * High-water `updatedAt` over EVERYTHING scanned (incl. skipped transfers /
   * splits), so a window that's entirely skipped rows still advances the
   * cursor instead of pinning it forever.
   */
  maxUpdatedAt: number;
}

/**
 * Collect debit transactions changed at/after `since` into the neutral
 * {@link CanonicalExpense} shape, ordered for export. Transfer legs
 * (`transferAccountId`) and split children (`parentId`) are excluded — those
 * are structural double-count guards, not category filtering: a split child is
 * the same money as its exported parent, and a transfer moves money between the
 * owner's own accounts. Everything else is collected with its raw category;
 * destinations decide how to map/surface it.
 */
export function collectExpenses(
  db: Db,
  since: number,
  prevCursor: number,
): CollectResult {
  const rows = db
    .select()
    .from(transactions)
    .leftJoin(categories, eq(categories.id, transactions.categoryId))
    .leftJoin(payees, eq(payees.id, transactions.payeeId))
    .leftJoin(accounts, eq(accounts.id, transactions.accountId))
    .where(
      and(lt(transactions.amountCents, 0), gte(transactions.updatedAt, since)),
    )
    .all();

  // Tag names per txn (one pass), so the export carries the same tags the user
  // sees in-app and on manually-tagged sheet rows.
  const tagsByTxn = new Map<string, string[]>();
  for (const tr of db
    .select({ txnId: transactionTags.transactionId, name: tags.name })
    .from(transactionTags)
    .innerJoin(tags, eq(tags.id, transactionTags.tagId))
    .all()) {
    const list = tagsByTxn.get(tr.txnId);
    if (list) list.push(tr.name);
    else tagsByTxn.set(tr.txnId, [tr.name]);
  }

  const out: CanonicalExpense[] = [];
  let maxUpdatedAt = prevCursor;
  for (const r of rows) {
    const t = r.transactions;
    if (t.updatedAt > maxUpdatedAt) maxUpdatedAt = t.updatedAt;
    if (t.transferAccountId || t.parentId) continue;
    const category = r.categories?.name ?? null;
    out.push({
      date: t.date,
      description:
        cleanMerchant(r.payees?.name) ||
        cleanMerchant(t.payeeName) ||
        category ||
        "Uncategorised",
      category,
      amountMinor: Math.abs(t.amountCents),
      isOutflow: true,
      accountKind: r.accounts?.kind ?? null,
      notes: cleanNote(t.notes),
      tags: tagsByTxn.get(t.id) ?? [],
      sourceId: t.id,
    });
  }
  return { rows: out, scanned: rows.length, maxUpdatedAt };
}
