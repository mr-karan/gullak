import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";

import { syncEpochs } from "../db/schema.ts";
import type { DbOrTx } from "../repos/changelog.ts";
import { activatePreparedEpoch, prepareGenesis } from "./genesis.ts";

/**
 * Ensures a database has exactly one active causal epoch. A fresh server or a
 * pre-CRDT database is bootstrapped from its current relational projection in
 * one outer transaction; an ambiguous partial state is refused.
 */
export function ensureActiveEpoch(db: DbOrTx): string {
  const active = db
    .select({ id: syncEpochs.id })
    .from(syncEpochs)
    .where(eq(syncEpochs.status, "active"))
    .all();
  if (active.length === 1) return active[0]!.id;
  if (active.length > 1) {
    throw new Error(`expected one active sync epoch, found ${active.length}`);
  }

  const existing = db.select({ id: syncEpochs.id }).from(syncEpochs).all();
  if (existing.length > 0) {
    throw new Error(
      "sync epoch state is incomplete; refusing automatic recovery over existing epochs",
    );
  }

  return db.transaction((tx) => {
    const epochId = randomUUID();
    prepareGenesis(tx, {
      epochId,
      genesisActorId: `genesis-${randomUUID()}`,
      serverActorId: `server-${randomUUID()}`,
      createdAt: Date.now(),
    });
    activatePreparedEpoch(tx, epochId);
    return epochId;
  });
}
