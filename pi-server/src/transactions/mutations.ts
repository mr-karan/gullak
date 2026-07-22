import { eq } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import type { NewTransaction, Transaction } from "../db/schema.ts";
import { payees, transactionTags, transactions } from "../db/schema.ts";
import type { DbOrTx } from "../repos/changelog.ts";
import { nowMs, recordChange, recordCommand } from "../repos/changelog.ts";
import { learnCategory } from "../rules/learn.ts";
import { recomputeDerivedProjection } from "../sync/resources.ts";
import { deletePair, findSibling, propagateEdit } from "./transfers.ts";

// Shared write-invariant core for editing and deleting transactions. Both the
// HTTP route (routes/transactions.ts) and the agent write tools
// (agent/write_tools.ts) call these so the reconcile lock, transfer
// propagation, group-parent money freeze, and split cascade live in exactly ONE
// place. Duplicating them is where the invariants drift and bugs hide.

/** The columns a PATCH may set (a subset of NewTransaction). */
export type TransactionPatch = Partial<NewTransaction>;

export type PatchOutcome =
  | { ok: true; transaction: Transaction; before: Transaction }
  | { ok: false; status: 404 | 409 | 400; error: string };

/**
 * Patch one transaction with the full write invariants:
 *   - reconcile lock (409 unless force);
 *   - group parent amount is derived → non-zero amountCents rejected (400),
 *     any accepted value forced back to 0;
 *   - transfer legs keep their sibling in lock-step (amount negated,
 *     date/notes mirrored, category nulled on both) via propagateEdit, with the
 *     lock covering BOTH legs; account/linkage frozen;
 *   - learnCategory runs (best-effort) after a category-setting edit.
 * Opens ONE db.transaction for the write. Never throws for the expected
 * refusals — returns a typed outcome the caller maps to a status/reply.
 */
export function patchTransaction(
  db: Db,
  id: string,
  partial: TransactionPatch,
  opts: { force?: boolean } = {},
): PatchOutcome {
  const forced = opts.force === true;
  const existing = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();
  if (!existing) return { ok: false, status: 404, error: "Not found" };

  // A linked payee is an entity, while transactions.payeeName is only its
  // denormalized read cache. Treat "rename this" as a canonical payee rename;
  // writing the cache would be a misleading no-op and was the root cause of
  // the Dyson incident. Callers that intend to detach must say so explicitly
  // with payeeId:null and supply the detached payeeName in the same command.
  const normalizedPartial = { ...partial };
  let renamedPayee:
    | { before: typeof payees.$inferSelect; after: typeof payees.$inferSelect }
    | undefined;
  if (
    existing.payeeId !== null &&
    Object.hasOwn(normalizedPartial, "payeeName") &&
    !Object.hasOwn(normalizedPartial, "payeeId")
  ) {
    if (
      normalizedPartial.payeeName === null ||
      normalizedPartial.payeeName === undefined
    ) {
      return {
        ok: false,
        status: 400,
        error:
          "A linked payee name cannot be cleared. Set payeeId=null and provide payeeName to detach it.",
      };
    }
    const payee = db
      .select()
      .from(payees)
      .where(eq(payees.id, existing.payeeId))
      .get();
    if (payee === undefined) {
      return {
        ok: false,
        status: 400,
        error: `Transaction references missing payee ${existing.payeeId}`,
      };
    }
    const name = normalizedPartial.payeeName.trim();
    if (name.length === 0) {
      return { ok: false, status: 400, error: "Payee name cannot be empty" };
    }
    renamedPayee = {
      before: payee,
      after: { ...payee, name, updatedAt: nowMs() },
    };
    delete normalizedPartial.payeeName;
  }

  // Lock check FIRST — before transfer propagation — so a locked leg can't be
  // edited without force.
  if (existing.reconciled && !forced) {
    return {
      ok: false,
      status: 409,
      error: "Transaction is reconciled (locked). Pass force=true to override.",
    };
  }

  if (
    existing.isGroupParent &&
    normalizedPartial.amountCents != null &&
    normalizedPartial.amountCents !== 0
  ) {
    return {
      ok: false,
      status: 400,
      error: "A group parent's amountCents is derived and stays 0",
    };
  }

  const changesTransaction = Object.keys(normalizedPartial).length > 0;
  const next: Transaction = changesTransaction
    ? { ...existing, ...normalizedPartial, updatedAt: nowMs() }
    : existing;
  if (existing.isGroupParent) next.amountCents = 0;

  if (existing.transferGroupId) {
    const sibling = findSibling(db, existing);
    // The lock covers BOTH legs: editing one propagates to its sibling, so a
    // locked sibling blocks the edit unless force.
    if (sibling?.reconciled && !forced) {
      return {
        ok: false,
        status: 409,
        error:
          "Transfer sibling is reconciled (locked). Pass force=true to override.",
      };
    }
    // Linkage + account are frozen; category is meaningless for transfers.
    next.transferGroupId = existing.transferGroupId;
    next.transferAccountId = existing.transferAccountId;
    next.accountId = existing.accountId;
    next.categoryId = null;
    recordCommand(db, (tx) => {
      if (changesTransaction) {
        tx.update(transactions).set(next).where(eq(transactions.id, id)).run();
        recordChange(tx, {
          resource: "transactions",
          resourceId: id,
          op: "upsert",
          payload: next,
        });
      }
      if (sibling && changesTransaction) propagateEdit(tx, next, sibling);
      if (renamedPayee !== undefined) {
        tx.update(payees)
          .set(renamedPayee.after)
          .where(eq(payees.id, renamedPayee.after.id))
          .run();
        recordChange(tx, {
          resource: "payees",
          resourceId: renamedPayee.after.id,
          op: "upsert",
          payload: renamedPayee.after,
        });
        recomputeDerivedProjection(tx);
      }
    });
    const projected = db
      .select()
      .from(transactions)
      .where(eq(transactions.id, id))
      .get();
    return { ok: true, transaction: projected ?? next, before: existing };
  }

  recordCommand(db, (tx) => {
    if (changesTransaction) {
      tx.update(transactions).set(next).where(eq(transactions.id, id)).run();
      recordChange(tx, {
        resource: "transactions",
        resourceId: id,
        op: "upsert",
        payload: next,
      });
    }
    if (renamedPayee !== undefined) {
      tx.update(payees)
        .set(renamedPayee.after)
        .where(eq(payees.id, renamedPayee.after.id))
        .run();
      recordChange(tx, {
        resource: "payees",
        resourceId: renamedPayee.after.id,
        op: "upsert",
        payload: renamedPayee.after,
      });
      recomputeDerivedProjection(tx);
    }
  });

  const projected = db
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();
  const finalTransaction = projected ?? next;

  // Auto-learn a payee→category rule when this edit set a category. Best-effort,
  // after commit, never throws into the caller.
  if (
    normalizedPartial.categoryId != null &&
    finalTransaction.categoryId != null
  ) {
    learnCategory(db, {
      payeeId: finalTransaction.payeeId,
      payeeName: finalTransaction.payeeName,
      categoryId: finalTransaction.categoryId,
    });
  }

  return { ok: true, transaction: finalTransaction, before: existing };
}

export type DeleteCoreResult =
  | { status: "deleted"; payloads: Transaction[] }
  | { status: "locked"; error: string }
  | { status: "not_found" };

/**
 * Delete one transaction with the full cascade/lock semantics, operating on the
 * given `tx` handle so the caller controls the transaction boundary (the route
 * wraps one call; the agent delete tool wraps a batch in a single transaction).
 *
 *   - reconcile lock (both transfer legs) blocks unless force → "locked";
 *   - transfer → both legs removed (deletePair);
 *   - split parent → children cascade-deleted;
 *   - group parent → children ungrouped (survive, groupParentId cleared), parent
 *     removed.
 *
 * `payloads` captures the BEFORE snapshot of every row it removed or mutated, so
 * an undo can re-create/relink them via upsert.
 */
export function deleteTransactionCore(
  tx: DbOrTx,
  id: string,
  opts: { force?: boolean } = {},
): DeleteCoreResult {
  const forced = opts.force === true;
  const existing = tx
    .select()
    .from(transactions)
    .where(eq(transactions.id, id))
    .get();
  if (!existing) return { status: "not_found" };

  if (existing.reconciled && !forced) {
    return {
      status: "locked",
      error: "Transaction is reconciled (locked). Pass force=true to override.",
    };
  }

  if (existing.transferGroupId) {
    const sibling = findSibling(tx, existing);
    if (sibling?.reconciled && !forced) {
      return {
        status: "locked",
        error:
          "Transfer sibling is reconciled (locked). Pass force=true to override.",
      };
    }
    const payloads = [existing, ...(sibling ? [sibling] : [])];
    deletePair(tx, existing, sibling);
    return { status: "deleted", payloads };
  }

  const payloads: Transaction[] = [];
  if (existing.isGroupParent) {
    // Group parent is a virtual header: ungroup children (they survive), then
    // remove the parent. Capture children's BEFORE state (groupParentId set) so
    // undo can re-link them.
    const kids = tx
      .select()
      .from(transactions)
      .where(eq(transactions.groupParentId, id))
      .all();
    const at = nowMs();
    payloads.push(existing);
    for (const k of kids) {
      payloads.push(k);
      const kNext = { ...k, groupParentId: null, updatedAt: at };
      tx.update(transactions).set(kNext).where(eq(transactions.id, k.id)).run();
      recordChange(tx, {
        resource: "transactions",
        resourceId: k.id,
        op: "upsert",
        payload: kNext,
      });
    }
  } else {
    // Split parent carries the money; its children hold only the breakdown and
    // are excluded from every sum. Cascade them so no orphans are stranded.
    const children = tx
      .select()
      .from(transactions)
      .where(eq(transactions.parentId, id))
      .all();
    for (const child of children) {
      payloads.push(child);
      deleteTxnFully(tx, child.id);
    }
    payloads.push(existing);
  }
  deleteTxnFully(tx, id);
  return { status: "deleted", payloads };
}

/**
 * Delete one transaction row plus its transaction_tags, emitting a change_log
 * delete for the row and each tag link so sync clients converge. Assumes it runs
 * inside a db.transaction.
 */
export function deleteTxnFully(tx: DbOrTx, txnId: string): void {
  const tagLinks = tx
    .select({ id: transactionTags.id })
    .from(transactionTags)
    .where(eq(transactionTags.transactionId, txnId))
    .all();
  for (const link of tagLinks) {
    tx.delete(transactionTags).where(eq(transactionTags.id, link.id)).run();
    recordChange(tx, {
      resource: "transaction_tags",
      resourceId: link.id,
      op: "delete",
    });
  }
  tx.delete(transactions).where(eq(transactions.id, txnId)).run();
  recordChange(tx, {
    resource: "transactions",
    resourceId: txnId,
    op: "delete",
  });
}
