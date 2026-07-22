// Rules engine — orchestration.
//
// `runRules` loads the enabled rules, orders them by stage (pre → main → post)
// and then priority (lower first), and threads a txn through each rule whose
// conditions match. Rules are SERVER-ONLY config: this never calls
// recordChange() and is never synced to the phone.
//
// `stage` is a first-class column on the rules table (see schema.ts).

import { eq } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import { rules } from "../db/schema.ts";
import { applyActions, type ActionPayload } from "./actions.ts";
import { ruleActionsSchema, ruleTriggerSchema } from "./schema.ts";
import {
  matchesConditions,
  type Stage,
  type TriggerPayload,
  type TxnLike,
} from "./conditions.ts";

export type { TxnLike } from "./conditions.ts";

const STAGE_RANK: Record<Stage, number> = { pre: 0, main: 1, post: 2 };

function stageRank(stage: string | undefined): number {
  return stage && stage in STAGE_RANK ? STAGE_RANK[stage as Stage] : STAGE_RANK.main;
}

interface CompiledRule {
  trigger: TriggerPayload;
  action: ActionPayload;
  rank: number;
  priority: number;
  createdAt: number;
}

function compile(row: {
  id: string;
  triggerPayload: string;
  actionPayload: string;
  stage: string;
  priority: number;
  createdAt: number;
}): CompiledRule | null {
  // A malformed rule must never crash the ingest path or become an accidental
  // match-all. Strict validation makes invalid persisted config inert.
  try {
    const trigger = ruleTriggerSchema.safeParse(JSON.parse(row.triggerPayload));
    const action = ruleActionsSchema.safeParse(JSON.parse(row.actionPayload));
    if (!trigger.success || !action.success) {
      console.warn("rules_invalid_skipped", { ruleId: row.id });
      return null;
    }
    return {
      trigger: trigger.data as TriggerPayload,
      action: action.data as ActionPayload,
      rank: stageRank(row.stage),
      priority: row.priority,
      createdAt: row.createdAt,
    };
  } catch {
    return null;
  }
}

/** Run the enabled rules against a txn, returning the normalized/categorized
    txn. Disabled rules are skipped. Ordering: stage (pre→main→post), then
    priority ascending, then createdAt for a stable tiebreak. */
export function runRules(db: Db, txn: TxnLike): TxnLike {
  const rows = db.select().from(rules).where(eq(rules.enabled, true)).all();

  const compiled = rows
    .map((r) =>
      compile({
        id: r.id,
        triggerPayload: r.triggerPayload,
        actionPayload: r.actionPayload,
        stage: r.stage,
        priority: r.priority,
        createdAt: r.createdAt,
      }),
    )
    .filter((r): r is CompiledRule => r !== null)
    .sort(
      (a, b) =>
        a.rank - b.rank || a.priority - b.priority || a.createdAt - b.createdAt,
    );

  let out = txn;
  for (const rule of compiled) {
    if (matchesConditions(rule.trigger, out)) {
      out = applyActions(rule.action, out);
    }
  }
  return out;
}
