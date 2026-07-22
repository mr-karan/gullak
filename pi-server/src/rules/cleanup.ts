import { eq, inArray } from "drizzle-orm";

import type { Db } from "../db/index.ts";
import { accounts, rules, type Rule } from "../db/schema.ts";
import { nowMs } from "../repos/changelog.ts";
import { verifyBackupProof, type BackupProof } from "../sync/operator.ts";
import { ruleActionsSchema, ruleTriggerSchema } from "./schema.ts";

export class LegacyRuleCleanupError extends Error {}

type SmsMigration = {
  id: string;
  triggerPayload: string;
  actionPayload: string;
};

export type LegacyRuleCleanupPlan = {
  deletePayeeMemoryIds: string[];
  migrateSms: SmsMigration[];
  alreadyCanonical: number;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function exactKeys(value: Record<string, unknown>, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function planLegacyRuleCleanup(rows: Rule[]): LegacyRuleCleanupPlan {
  const plan: LegacyRuleCleanupPlan = {
    deletePayeeMemoryIds: [],
    migrateSms: [],
    alreadyCanonical: 0,
  };
  const unrecognized: string[] = [];

  for (const row of rows) {
    let trigger: unknown;
    let action: unknown;
    try {
      trigger = JSON.parse(row.triggerPayload);
      action = JSON.parse(row.actionPayload);
    } catch {
      unrecognized.push(row.id);
      continue;
    }
    if (ruleTriggerSchema.safeParse(trigger).success && ruleActionsSchema.safeParse(action).success) {
      plan.alreadyCanonical += 1;
      continue;
    }

    const t = object(trigger);
    const a = object(action);
    if (t === null || a === null) {
      unrecognized.push(row.id);
      continue;
    }
    const isPayeeMemory =
      row.name === "Payee memory" &&
      row.triggerType === "payee" &&
      t.match === "equals" &&
      typeof t.payeeId === "string" &&
      row.id === t.payeeId &&
      exactKeys(t, ["match", "payeeId"]) &&
      typeof a.accountId === "string" &&
      (a.categoryId === undefined || typeof a.categoryId === "string") &&
      exactKeys(a, ["accountId", "categoryId"]);
    if (isPayeeMemory) {
      plan.deletePayeeMemoryIds.push(row.id);
      continue;
    }

    const isSmsRule =
      row.triggerType === "sms_body" &&
      t.match === "contains" &&
      typeof t.value === "string" &&
      t.value.trim().length > 0 &&
      exactKeys(t, ["match", "value"]) &&
      typeof a.accountId === "string" &&
      exactKeys(a, ["accountId"]);
    if (isSmsRule) {
      plan.migrateSms.push({
        id: row.id,
        triggerPayload: JSON.stringify({
          match: "all",
          conditions: [{ field: "smsBody", op: "contains", value: t.value }],
        }),
        actionPayload: JSON.stringify({
          actions: [{ type: "set_account", value: a.accountId }],
        }),
      });
      continue;
    }
    unrecognized.push(row.id);
  }

  if (unrecognized.length > 0) {
    throw new LegacyRuleCleanupError(
      `refusing cleanup: ${unrecognized.length} unrecognized invalid rule(s)`,
    );
  }
  return plan;
}

export async function cleanupLegacyRulesWithGuardrails(
  db: Db,
  options: {
    confirmation: string;
    backup: BackupProof;
    dryRun: boolean;
  },
) {
  if (options.confirmation !== "CLEANUP-LEGACY-RULES") {
    throw new LegacyRuleCleanupError(
      "cleanup requires --confirm CLEANUP-LEGACY-RULES",
    );
  }
  const backup = await verifyBackupProof(options.backup, db);
  const plan = planLegacyRuleCleanup(db.select().from(rules).all());
  const accountIds = new Set(db.select({ id: accounts.id }).from(accounts).all().map((row) => row.id));
  const missingAccounts = plan.migrateSms.filter((migration) => {
    const payload = JSON.parse(migration.actionPayload) as { actions: [{ value: string }] };
    return !accountIds.has(payload.actions[0].value);
  });
  if (missingAccounts.length > 0) {
    throw new LegacyRuleCleanupError(
      `refusing cleanup: ${missingAccounts.length} SMS rule account reference(s) are missing`,
    );
  }

  const summary = {
    deletedPayeeMemory: plan.deletePayeeMemoryIds.length,
    migratedSmsRules: plan.migrateSms.length,
    alreadyCanonical: plan.alreadyCanonical,
  };
  if (options.dryRun) return { action: "cleanup-legacy-rules", dryRun: true, backup, ...summary };

  const at = nowMs();
  db.transaction((tx) => {
    if (plan.deletePayeeMemoryIds.length > 0) {
      tx.delete(rules).where(inArray(rules.id, plan.deletePayeeMemoryIds)).run();
    }
    for (const migration of plan.migrateSms) {
      tx.update(rules)
        .set({
          triggerType: "user",
          triggerPayload: migration.triggerPayload,
          actionPayload: migration.actionPayload,
          updatedAt: at,
        })
        .where(eq(rules.id, migration.id))
        .run();
    }
  });

  const remaining = db.select().from(rules).all();
  const invalidRemaining = remaining.filter((row) => {
    try {
      return !(
        ruleTriggerSchema.safeParse(JSON.parse(row.triggerPayload)).success &&
        ruleActionsSchema.safeParse(JSON.parse(row.actionPayload)).success
      );
    } catch {
      return true;
    }
  });
  if (invalidRemaining.length > 0) {
    throw new LegacyRuleCleanupError(
      `post-cleanup validation found ${invalidRemaining.length} invalid rule(s)`,
    );
  }
  return { action: "cleanup-legacy-rules", dryRun: false, backup, ...summary };
}
