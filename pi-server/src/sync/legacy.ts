import { eq, inArray, sql } from "drizzle-orm";

import {
  changeLog,
  syncEpochs,
  syncLegacyClients,
  syncLegacyRelationIds,
  transactionTags,
} from "../db/schema.ts";
import type { DbOrTx } from "../repos/changelog.ts";
import { transactionTagEntityId } from "./resources.ts";

export type LegacyObservation =
  | { accepted: true }
  | { accepted: false; reason: "inventory_sealed" };

function writableEpoch(db: DbOrTx) {
  return db
    .select({
      id: syncEpochs.id,
      status: syncEpochs.status,
      sealedAt: syncEpochs.legacyInventorySealedAt,
    })
    .from(syncEpochs)
    .where(inArray(syncEpochs.status, ["preparing", "active"]))
    .get();
}

/** Records a v1 device sighting. A push always invalidates an older drain
 * attestation because it proves the legacy outbox was non-empty again. */
export function observeLegacyClient(
  db: DbOrTx,
  clientId: string,
  observation: { pushed?: boolean; pullCursor?: number } = {},
): LegacyObservation {
  const existing = db
    .select()
    .from(syncLegacyClients)
    .where(eq(syncLegacyClients.clientId, clientId))
    .get();
  const epoch = writableEpoch(db);
  if (existing === undefined && epoch?.sealedAt !== null && epoch?.sealedAt !== undefined) {
    return { accepted: false, reason: "inventory_sealed" };
  }
  const now = Date.now();
  if (existing === undefined) {
    db.insert(syncLegacyClients)
      .values({
        clientId,
        status: "pending",
        firstSeenAt: now,
        lastSeenAt: now,
        lastPushAt: observation.pushed === true ? now : null,
        lastPullCursor: observation.pullCursor ?? 0,
      })
      .run();
    return { accepted: true };
  }
  db.update(syncLegacyClients)
    .set({
      lastSeenAt: now,
      ...(observation.pushed === true
        ? {
            status: "pending",
            lastPushAt: now,
            drainedV1Head: null,
            drainedAt: null,
          }
        : {}),
      ...(observation.pullCursor === undefined
        ? {}
        : {
            lastPullCursor: Math.max(
              existing.lastPullCursor,
              observation.pullCursor,
            ),
          }),
    })
    .where(eq(syncLegacyClients.clientId, clientId))
    .run();
  return { accepted: true };
}

/** Seeds the cutover inventory and relation-id adapter from durable v1 state. */
export function seedLegacyCutoverState(db: DbOrTx): void {
  const now = Date.now();
  const clientIds = db
    .select({ clientId: changeLog.clientId })
    .from(changeLog)
    .where(sql`${changeLog.clientId} IS NOT NULL`)
    .groupBy(changeLog.clientId)
    .all();
  for (const row of clientIds) {
    if (row.clientId === null) continue;
    db.insert(syncLegacyClients)
      .values({ clientId: row.clientId, firstSeenAt: now, lastSeenAt: now })
      .onConflictDoNothing()
      .run();
  }
  for (const row of db.select().from(transactionTags).all()) {
    rememberLegacyRelation(db, row.id, row.transactionId, row.tagId, now);
  }
}

export function rememberLegacyRelation(
  db: DbOrTx,
  legacyId: string,
  transactionId: string,
  tagId: string,
  firstSeenAt = Date.now(),
): string {
  const canonicalId = transactionTagEntityId(transactionId, tagId);
  db.insert(syncLegacyRelationIds)
    .values({ legacyId, canonicalId, transactionId, tagId, firstSeenAt })
    .onConflictDoUpdate({
      target: syncLegacyRelationIds.legacyId,
      set: { canonicalId, transactionId, tagId },
    })
    .run();
  return canonicalId;
}

export function normalizeLegacyTransactionTagMutation(
  db: DbOrTx,
  change: {
    resourceId: string;
    op: "upsert" | "delete";
    payload?: unknown;
  },
): { resourceId: string; payload?: unknown } {
  const payload =
    change.payload !== null &&
    typeof change.payload === "object" &&
    !Array.isArray(change.payload)
      ? (change.payload as Record<string, unknown>)
      : null;
  let transactionId =
    typeof payload?.transactionId === "string" ? payload.transactionId : null;
  let tagId = typeof payload?.tagId === "string" ? payload.tagId : null;
  if (transactionId === null || tagId === null) {
    const physical = db
      .select()
      .from(transactionTags)
      .where(eq(transactionTags.id, change.resourceId))
      .get();
    const remembered = db
      .select()
      .from(syncLegacyRelationIds)
      .where(eq(syncLegacyRelationIds.legacyId, change.resourceId))
      .get();
    transactionId = physical?.transactionId ?? remembered?.transactionId ?? null;
    tagId = physical?.tagId ?? remembered?.tagId ?? null;
  }
  if (transactionId === null || tagId === null) {
    throw new Error(
      `cannot resolve legacy transaction_tags identity ${change.resourceId}`,
    );
  }
  const canonicalId = rememberLegacyRelation(
    db,
    change.resourceId,
    transactionId,
    tagId,
  );
  return {
    resourceId: canonicalId,
    ...(payload === null
      ? {}
      : {
          payload: {
            ...payload,
            id: canonicalId,
            transactionId,
            tagId,
          },
        }),
  };
}
