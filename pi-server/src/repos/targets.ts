import { eq } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import { categoryTargets } from "../db/schema.ts";
import type { CategoryTarget } from "../db/schema.ts";
import { nowMs } from "./changelog.ts";

// Per-category budget TARGETS (YNAB "targets"). Server-only config: like
// goals/holdings these never get a sync event and aren't in the Drift
// mirror. One target per category → categoryId is the primary key, so an
// upsert replaces the existing row rather than duplicating it.

export type TargetType = "monthly" | "by_date";

export interface UpsertTargetArgs {
  categoryId: string;
  type: TargetType;
  amountCents: number;
  byDate?: string | null;
}

/** All targets, keyed nowhere in particular — the caller maps by categoryId. */
export function listTargets(db: Db): CategoryTarget[] {
  return db.select().from(categoryTargets).all();
}

/** Upsert by categoryId (PK). Preserves createdAt on an existing row. */
export function upsertTarget(db: Db, args: UpsertTargetArgs): CategoryTarget {
  const existing = db
    .select()
    .from(categoryTargets)
    .where(eq(categoryTargets.categoryId, args.categoryId))
    .get();

  const at = nowMs();
  const row = {
    categoryId: args.categoryId,
    type: args.type,
    amountCents: args.amountCents,
    byDate: args.byDate ?? null,
    createdAt: existing?.createdAt ?? at,
    updatedAt: at,
  };

  if (existing) {
    db.update(categoryTargets)
      .set(row)
      .where(eq(categoryTargets.categoryId, args.categoryId))
      .run();
  } else {
    db.insert(categoryTargets).values(row).run();
  }
  return row;
}

/** Delete a target by categoryId. Returns true if a row was removed. */
export function deleteTarget(db: Db, categoryId: string): boolean {
  const existing = db
    .select({ id: categoryTargets.categoryId })
    .from(categoryTargets)
    .where(eq(categoryTargets.categoryId, categoryId))
    .get();
  if (!existing) return false;
  db.delete(categoryTargets).where(eq(categoryTargets.categoryId, categoryId)).run();
  return true;
}
