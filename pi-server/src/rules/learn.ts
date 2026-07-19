// Rules engine — auto-learning payee→category rules (#39).
//
// Port of Actual's updateCategoryRules/getProbableCategory: when a transaction
// is categorized, look at that payee's recent history and, if a clear habit has
// formed, silently record a LEARNED rule so future transactions for the same
// payee get categorized automatically by the engine (runRules).
//
// Learned rules live in the SAME `rules` table as user rules — they are just
// rows with triggerType='learned' (a payee 'is' condition + a set_category
// action). No separate table, no recordChange (rules are server-only config).
//
// Best-effort by contract: learning must NEVER break a categorize, so the public
// entry point swallows and logs any error.

import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import { categories, payees, rules, transactions } from "../db/schema.ts";
import { newId, nowMs } from "../repos/changelog.ts";

// Look at the payee's last N categorized transactions; if at least THRESHOLD of
// them agree on one category, that's a habit worth learning. Mirrors Actual's
// 5-of-recent / majority heuristic.
const LEARN_LOOKBACK = 5;
const LEARN_THRESHOLD = 3;

export interface LearnCategoryArgs {
  payeeId?: string | null;
  payeeName?: string | null;
  categoryId?: string | null;
}

/** Auto-learn a payee→category rule from recent history. Best-effort: never
    throws into the caller — a failure here must not break the categorize that
    triggered it. */
export function learnCategory(db: Db, args: LearnCategoryArgs): void {
  try {
    learnCategoryImpl(db, args);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn(
      `learnCategory failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function learnCategoryImpl(db: Db, args: LearnCategoryArgs): void {
  const categoryId = args.categoryId?.trim();
  if (!categoryId) return; // nothing to learn without a target category

  const payeeId = args.payeeId?.trim() || null;
  let payeeName = args.payeeName?.trim() || null;

  // Need SOME payee identity to attribute the habit to.
  if (!payeeId && !payeeName) return;

  // Opt-out (#39): if this payee has learnCategories=false, don't learn from it.
  // Only checkable by payeeId; also lets us backfill the name for the rule
  // condition when the caller only had an id.
  if (payeeId) {
    const payee = db
      .select({ name: payees.name, learnCategories: payees.learnCategories })
      .from(payees)
      .where(eq(payees.id, payeeId))
      .get();
    if (payee && payee.learnCategories === false) return;
    if (!payeeName && payee) payeeName = payee.name;
  }

  // The learned rule matches on payee NAME (engine field 'payee'), so a name is
  // required to write a usable condition.
  if (!payeeName) return;

  // Last N categorized, top-level, non-group transactions for this payee.
  const payeeFilter = payeeId
    ? eq(transactions.payeeId, payeeId)
    : sql`lower(${transactions.payeeName}) = ${payeeName.toLowerCase()}`;

  const recent = db
    .select({ categoryId: transactions.categoryId })
    .from(transactions)
    .where(
      and(
        payeeFilter,
        isNotNull(transactions.categoryId),
        isNull(transactions.parentId),
        eq(transactions.isGroupParent, false),
      ),
    )
    .orderBy(desc(transactions.date), desc(transactions.createdAt))
    .limit(LEARN_LOOKBACK)
    .all();

  if (recent.length < LEARN_THRESHOLD) return;

  // Count categories among the recent set; find the dominant one. With a
  // 5-row window a count of ≥3 is necessarily unique (3+3 > 5).
  const counts = new Map<string, number>();
  for (const r of recent) {
    if (!r.categoryId) continue;
    counts.set(r.categoryId, (counts.get(r.categoryId) ?? 0) + 1);
  }
  let topCategory: string | null = null;
  let topCount = 0;
  for (const [cat, n] of counts) {
    if (n > topCount) {
      topCount = n;
      topCategory = cat;
    }
  }
  if (!topCategory || topCount < LEARN_THRESHOLD) return;

  upsertLearnedRule(db, payeeName, topCategory);
}

/** Insert or update the single learned rule for a payee. A learned rule is a
    row with triggerType='learned' whose one condition is
    {field:'payee', op:'is', value:<normalized name>}. If one already exists for
    this payee, update its set_category action; otherwise insert a new rule. */
function upsertLearnedRule(
  db: Db,
  payeeName: string,
  categoryId: string,
): void {
  const normalized = payeeName.trim().toLowerCase();

  const learnedRows = db
    .select()
    .from(rules)
    .where(eq(rules.triggerType, "learned"))
    .all();

  const existing = learnedRows.find((row) => {
    try {
      const trigger = JSON.parse(row.triggerPayload) as {
        conditions?: { field?: string; op?: string; value?: unknown }[];
      };
      const conds = Array.isArray(trigger?.conditions) ? trigger.conditions : [];
      return conds.some(
        (c) =>
          c &&
          c.field === "payee" &&
          c.op === "is" &&
          typeof c.value === "string" &&
          c.value.trim().toLowerCase() === normalized,
      );
    } catch {
      return false;
    }
  });

  const actionPayload = JSON.stringify({
    actions: [{ type: "set_category", value: categoryId }],
  });
  const at = nowMs();

  if (existing) {
    // Habit changed → point the existing rule at the new category. No duplicate
    // row. No-op churn (same category) is cheap enough to not special-case.
    db.update(rules)
      .set({ actionPayload, updatedAt: at })
      .where(eq(rules.id, existing.id))
      .run();
    return;
  }

  // Nicer label if we can resolve the category name; fall back to the id.
  const category = db
    .select({ name: categories.name })
    .from(categories)
    .where(eq(categories.id, categoryId))
    .get();
  const label = category?.name ?? categoryId;

  db.insert(rules)
    .values({
      id: newId(),
      name: `Learned: ${payeeName} → ${label}`,
      enabled: true,
      stage: "main",
      priority: 100,
      triggerType: "learned",
      triggerPayload: JSON.stringify({
        match: "all",
        conditions: [{ field: "payee", op: "is", value: normalized }],
      }),
      actionPayload,
      createdAt: at,
      updatedAt: at,
    })
    .run();
}
