import { and, eq, isNull } from "drizzle-orm";

import { accounts, transactions } from "../db/schema.ts";
import type { NewTransaction } from "../db/schema.ts";
import type { DbOrTx } from "../repos/changelog.ts";
import { newId, nowMs, recordChange } from "../repos/changelog.ts";

// Reconciliation (#42). Port of Actual's reconcile flow, adapted to Gullak's
// integer-minor-unit money.
//
// The CLEARED balance of an account is openingBalanceCents + Σ(amountCents) over
// its cleared, TOP-LEVEL transactions. Guards:
//   - cleared = 1        : only bank-confirmed rows count toward the statement.
//   - parentId IS NULL   : split children are excluded (their parent carries the
//                          money); group parents carry amountCents = 0 so they're
//                          harmless either way.
//
// Reconciling compares that cleared balance to the bank's actual balance. On a
// zero diff we LOCK every cleared row (reconciled = true) and stamp the account.
// On a non-zero diff we optionally create ONE adjustment txn (amount = diff) that
// makes cleared == target, then lock; without an adjustment we lock nothing and
// just report the diff so the UI can offer to add one.

export interface ReconcileOptions {
  /** When the diff is non-zero, create a single adjustment txn then lock. */
  createAdjustment?: boolean;
  /** YYYY-MM-DD date to stamp on the adjustment txn; defaults to today (UTC). */
  asOf?: string;
}

export interface ReconcileOutcome {
  /** openingBalanceCents + Σ cleared top-level amounts, BEFORE any adjustment. */
  clearedCents: number;
  /** targetBalanceCents − clearedCents. */
  diffCents: number;
  /** Whether the account was locked (cleared rows reconciled + account stamped). */
  locked: boolean;
  /** The adjustment txn id, if one was created. */
  adjustmentId: string | null;
  /** How many pre-existing cleared rows were newly flipped to reconciled. */
  reconciledCount: number;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Cleared balance of an account: openingBalanceCents + Σ(amountCents) over its
 * cleared, top-level (parentId IS NULL) transactions. A missing account
 * contributes a 0 opening balance. Synchronous (better-sqlite3).
 */
export function computeClearedBalance(db: DbOrTx, accountId: string): number {
  const account = db
    .select({ openingBalanceCents: accounts.openingBalanceCents })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();
  const opening = account?.openingBalanceCents ?? 0;
  const rows = db
    .select({ amountCents: transactions.amountCents })
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.cleared, true),
        isNull(transactions.parentId),
      ),
    )
    .all();
  return opening + rows.reduce((sum, r) => sum + r.amountCents, 0);
}

/**
 * Reconcile an account against the bank's actual balance. Does ALL writes in one
 * db.transaction with a recordChange upsert for every mutated row (the
 * adjustment if created, each newly-locked txn, and the account row).
 *
 *   diff == 0                          → lock, no adjustment.
 *   diff != 0 && createAdjustment      → create adjustment (amount = diff), lock.
 *   diff != 0 && !createAdjustment     → do nothing; just return the diff.
 *
 * The caller is responsible for the 404 check; this assumes the account exists.
 */
export function reconcileAccount(
  db: DbOrTx,
  accountId: string,
  targetBalanceCents: number,
  opts: ReconcileOptions = {},
): ReconcileOutcome {
  const clearedCents = computeClearedBalance(db, accountId);
  const diffCents = targetBalanceCents - clearedCents;

  // Non-zero diff with no adjustment requested: nothing is locked. Surface the
  // diff so the UI can show it and offer to add the adjustment.
  if (diffCents !== 0 && !opts.createAdjustment) {
    return {
      clearedCents,
      diffCents,
      locked: false,
      adjustmentId: null,
      reconciledCount: 0,
    };
  }

  const at = nowMs();
  const asOfDate = opts.asOf ?? todayYmd();
  let adjustmentId: string | null = null;
  let reconciledCount = 0;

  db.transaction((tx) => {
    // Adjustment first: born cleared + reconciled so it makes cleared == target
    // and is excluded from the lock sweep below (which only touches
    // cleared && !reconciled rows).
    if (diffCents !== 0 && opts.createAdjustment) {
      adjustmentId = newId();
      const adjustment: NewTransaction = {
        id: adjustmentId,
        accountId,
        categoryId: null,
        payeeId: null,
        payeeName: "Reconciliation adjustment",
        amountCents: diffCents,
        date: asOfDate,
        notes: "Reconciliation adjustment",
        latitude: null,
        longitude: null,
        locationName: null,
        cleared: true,
        reconciled: true,
        origin: "reconcile",
        originRef: null,
        importedId: null,
        transferAccountId: null,
        transferGroupId: null,
        parentId: null,
        splitTotalCents: null,
        groupParentId: null,
        isGroupParent: false,
        originalAmountCents: null,
        originalCurrency: null,
        createdAt: at,
        updatedAt: at,
      };
      tx.insert(transactions).values(adjustment).run();
      recordChange(tx, {
        resource: "transactions",
        resourceId: adjustmentId,
        op: "upsert",
        payload: adjustment,
      });
    }

    // Lock every cleared, not-yet-reconciled row in the account.
    const toLock = tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, accountId),
          eq(transactions.cleared, true),
          eq(transactions.reconciled, false),
        ),
      )
      .all();
    for (const row of toLock) {
      const next = { ...row, reconciled: true, updatedAt: at };
      tx.update(transactions).set(next).where(eq(transactions.id, row.id)).run();
      recordChange(tx, {
        resource: "transactions",
        resourceId: row.id,
        op: "upsert",
        payload: next,
      });
      reconciledCount++;
    }

    // Stamp the account with the confirmed balance + timestamp.
    const account = tx
      .select()
      .from(accounts)
      .where(eq(accounts.id, accountId))
      .get();
    if (account) {
      const nextAccount = {
        ...account,
        reconciledBalanceCents: targetBalanceCents,
        reconciledAt: at,
        updatedAt: at,
      };
      tx.update(accounts).set(nextAccount).where(eq(accounts.id, accountId)).run();
      recordChange(tx, {
        resource: "accounts",
        resourceId: accountId,
        op: "upsert",
        payload: nextAccount,
      });
    }
  });

  return {
    clearedCents,
    diffCents,
    locked: true,
    adjustmentId,
    reconciledCount,
  };
}
