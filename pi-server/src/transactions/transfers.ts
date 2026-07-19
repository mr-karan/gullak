import { and, eq, ne } from "drizzle-orm";

import type { NewTransaction, Transaction } from "../db/schema.ts";
import { transactions } from "../db/schema.ts";
import type { DbOrTx } from "../repos/changelog.ts";
import { newId, recordChange } from "../repos/changelog.ts";

// Port of Actual's transfer model. A transfer is NOT a special row type: it is
// TWO ordinary transactions linked by a shared `transferGroupId`, auto-mirrored
// on write.
//
//   - The posted "primary" row lives in account A.
//   - The server creates a "mirror" row in account B (= primary.transferAccountId).
//   - Mirror amount = NEGATED primary amount; same date and notes.
//   - categoryId = null on BOTH legs (categories are meaningless for transfers —
//     Actual's clearCategory rule).
//   - Both legs share one new `transferGroupId`; each leg's `transferAccountId`
//     points at the OTHER account.
//
// Because a transfer nets to zero across the two accounts (mirror negates the
// primary), aggregation queries (net worth, summary) are unaffected — no
// double-counting.
//
// Everything here takes a `tx` handle so the caller runs the primary + mirror
// writes in ONE db.transaction, with a recordChange upsert for BOTH legs so
// sync clients pull both. Propagation (propagateEdit) is a DIRECT db write on
// the sibling, never a recursive route call — that is what stops an edit to one
// leg from re-triggering the transfer hook into an infinite loop.

/** The other leg of a transfer: the row sharing this row's transferGroupId. */
export function findSibling(
  db: DbOrTx,
  row: Pick<Transaction, "id" | "transferGroupId">,
): Transaction | undefined {
  if (!row.transferGroupId) return undefined;
  return db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.transferGroupId, row.transferGroupId),
        ne(transactions.id, row.id),
      ),
    )
    .get();
}

/**
 * Create a transfer pair from a fully-built primary row whose
 * `transferAccountId` names the target account B. Assigns a fresh
 * `transferGroupId` to both legs, nulls both categories, and negates the mirror
 * amount. Writes both rows + a change_log upsert for each, all on the given
 * `tx` handle. Returns the persisted primary and mirror rows.
 */
export function createTransferPair(
  db: DbOrTx,
  primary: NewTransaction,
): { primary: NewTransaction; mirror: NewTransaction } {
  const targetAccountId = primary.transferAccountId;
  if (!targetAccountId) {
    throw new Error("createTransferPair: primary.transferAccountId is required");
  }
  const groupId = newId();
  const at = primary.updatedAt ?? Date.now();

  // Primary keeps its account/amount; its category is cleared and it joins the
  // group. transferAccountId already points at B.
  const primaryRow: NewTransaction = {
    ...primary,
    categoryId: null,
    transferGroupId: groupId,
  };

  // Mirror lives in B, points back at A, and carries the negated amount. Copies
  // date/notes/cleared/origin from the primary; payee/location/fx are dropped
  // (a transfer leg has no merchant of its own).
  const mirror: NewTransaction = {
    ...primaryRow,
    id: newId(),
    accountId: targetAccountId,
    transferAccountId: primaryRow.accountId,
    amountCents: -primaryRow.amountCents,
    categoryId: null,
    transferGroupId: groupId,
    payeeId: null,
    payeeName: null,
    originRef: null,
    latitude: null,
    longitude: null,
    locationName: null,
    originalAmountCents: null,
    originalCurrency: null,
    createdAt: at,
    updatedAt: at,
  };

  db.insert(transactions).values(primaryRow).run();
  recordChange(db, {
    resource: "transactions",
    resourceId: primaryRow.id,
    op: "upsert",
    payload: primaryRow,
  });
  db.insert(transactions).values(mirror).run();
  recordChange(db, {
    resource: "transactions",
    resourceId: mirror.id,
    op: "upsert",
    payload: mirror,
  });

  return { primary: primaryRow, mirror };
}

/**
 * Propagate an edit of one transfer leg to its sibling: the sibling's amount
 * becomes the negation of the edited leg's amount, its date/notes are kept in
 * sync, and its category is forced null. This is a DIRECT db write on the
 * sibling (plus its change_log upsert) — it does NOT go back through the PATCH
 * route, so there is no recursion and exactly one propagation per edit.
 */
export function propagateEdit(
  db: DbOrTx,
  editedLeg: Pick<
    Transaction,
    "amountCents" | "date" | "notes" | "updatedAt"
  >,
  sibling: Transaction,
): Transaction {
  const siblingNext: Transaction = {
    ...sibling,
    amountCents: -editedLeg.amountCents,
    date: editedLeg.date,
    notes: editedLeg.notes,
    categoryId: null,
    updatedAt: editedLeg.updatedAt,
  };
  db.update(transactions)
    .set(siblingNext)
    .where(eq(transactions.id, sibling.id))
    .run();
  recordChange(db, {
    resource: "transactions",
    resourceId: sibling.id,
    op: "upsert",
    payload: siblingNext,
  });
  return siblingNext;
}

/**
 * Delete both legs of a transfer, with a change_log delete for each. Safe to
 * call with a missing sibling (half-linked legacy data): it just deletes the
 * one row it was given.
 */
export function deletePair(
  db: DbOrTx,
  row: Pick<Transaction, "id">,
  sibling: Transaction | undefined,
): void {
  db.delete(transactions).where(eq(transactions.id, row.id)).run();
  recordChange(db, {
    resource: "transactions",
    resourceId: row.id,
    op: "delete",
  });
  if (sibling) {
    db.delete(transactions).where(eq(transactions.id, sibling.id)).run();
    recordChange(db, {
      resource: "transactions",
      resourceId: sibling.id,
      op: "delete",
    });
  }
}
