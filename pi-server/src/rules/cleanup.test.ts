import { describe, expect, test } from "vitest";

import type { Rule } from "../db/schema.ts";
import { LegacyRuleCleanupError, planLegacyRuleCleanup } from "./cleanup.ts";

function row(overrides: Partial<Rule>): Rule {
  return {
    id: "r1",
    name: "rule",
    enabled: true,
    priority: 10,
    triggerType: "user",
    triggerPayload: JSON.stringify({
      match: "all",
      conditions: [{ field: "payee", op: "contains", value: "shop" }],
    }),
    actionPayload: JSON.stringify({
      actions: [{ type: "set_category", value: "category" }],
    }),
    stage: "main",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("planLegacyRuleCleanup", () => {
  test("deletes only exact obsolete payee-memory rows", () => {
    const plan = planLegacyRuleCleanup([
      row({
        id: "payee-1",
        name: "Payee memory",
        triggerType: "payee",
        triggerPayload: JSON.stringify({ match: "equals", payeeId: "payee-1" }),
        actionPayload: JSON.stringify({ accountId: "account-1", categoryId: "category-1" }),
      }),
    ]);
    expect(plan.deletePayeeMemoryIds).toEqual(["payee-1"]);
  });

  test("converts an exact legacy SMS rule to canonical semantics", () => {
    const plan = planLegacyRuleCleanup([
      row({
        id: "sms-1",
        triggerType: "sms_body",
        triggerPayload: JSON.stringify({ match: "contains", value: "Kotak UPI" }),
        actionPayload: JSON.stringify({ accountId: "account-1" }),
      }),
    ]);
    expect(JSON.parse(plan.migrateSms[0]!.triggerPayload)).toEqual({
      match: "all",
      conditions: [{ field: "smsBody", op: "contains", value: "Kotak UPI" }],
    });
    expect(JSON.parse(plan.migrateSms[0]!.actionPayload)).toEqual({
      actions: [{ type: "set_account", value: "account-1" }],
    });
  });

  test("refuses unknown invalid shapes instead of guessing", () => {
    expect(() =>
      planLegacyRuleCleanup([
        row({ triggerPayload: JSON.stringify({ surprise: true }), actionPayload: "{}" }),
      ]),
    ).toThrow(LegacyRuleCleanupError);
  });
});
