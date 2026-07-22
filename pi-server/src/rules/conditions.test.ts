import { describe, expect, test } from "vitest";

import {
  evalCondition,
  matchesConditions,
  type Condition,
  type TriggerPayload,
  type TxnLike,
} from "./conditions.ts";

const ev = (field: string, op: string, value: unknown, txn: TxnLike) =>
  evalCondition({ field, op, value } as Condition, txn);

describe("payee conditions (case-insensitive)", () => {
  const txn: TxnLike = { payeeName: "Blinkit" };
  test("is / isNot", () => {
    expect(ev("payee", "is", "blinkit", txn)).toBe(true);
    expect(ev("payee", "is", "Swiggy", txn)).toBe(false);
    expect(ev("payee", "isNot", "swiggy", txn)).toBe(true);
    expect(ev("payee", "isNot", "BLINKIT", txn)).toBe(false);
  });
  test("contains", () => {
    expect(ev("payee", "contains", "link", txn)).toBe(true);
    expect(ev("payee", "contains", "zomato", txn)).toBe(false);
  });
  test("oneOf (array value)", () => {
    expect(ev("payee", "oneOf", ["swiggy", "blinkit", "zepto"], txn)).toBe(true);
    expect(ev("payee", "oneOf", ["swiggy", "zepto"], txn)).toBe(false);
    expect(ev("payee", "oneOf", "not-an-array", txn)).toBe(false);
  });
  test("matches (regex) — valid", () => {
    expect(ev("payee", "matches", "^blink", txn)).toBe(true);
    expect(ev("payee", "matches", "kit$", txn)).toBe(true);
    expect(ev("payee", "matches", "^zom", txn)).toBe(false);
  });
  test("matches — invalid regex is no-match, never throws", () => {
    expect(() => ev("payee", "matches", "[unterminated(", txn)).not.toThrow();
    expect(ev("payee", "matches", "[unterminated(", txn)).toBe(false);
  });
  test("null payee coerces to empty string", () => {
    const none: TxnLike = { payeeName: null };
    expect(ev("payee", "is", "blinkit", none)).toBe(false);
    expect(ev("payee", "isNot", "blinkit", none)).toBe(true);
    expect(ev("payee", "contains", "x", none)).toBe(false);
  });
});

describe("amount conditions (integer minor units)", () => {
  test("is / gt / lt", () => {
    expect(ev("amount", "is", -500, { amountCents: -500 })).toBe(true);
    expect(ev("amount", "gt", -600, { amountCents: -500 })).toBe(true);
    expect(ev("amount", "lt", 0, { amountCents: -500 })).toBe(true);
  });
  test("inflow / outflow (value ignored)", () => {
    expect(ev("amount", "inflow", undefined, { amountCents: 1000 })).toBe(true);
    expect(ev("amount", "inflow", undefined, { amountCents: -1000 })).toBe(false);
    expect(ev("amount", "outflow", undefined, { amountCents: -1000 })).toBe(true);
    expect(ev("amount", "outflow", undefined, { amountCents: 1000 })).toBe(false);
  });
  test("between (inclusive bounds)", () => {
    expect(ev("amount", "between", [100, 200], { amountCents: 150 })).toBe(true);
    expect(ev("amount", "between", [100, 200], { amountCents: 100 })).toBe(true); // lo boundary
    expect(ev("amount", "between", [100, 200], { amountCents: 200 })).toBe(true); // hi boundary
    expect(ev("amount", "between", [100, 200], { amountCents: 201 })).toBe(false);
    expect(ev("amount", "between", [100], { amountCents: 150 })).toBe(false); // malformed
  });
  test("isapprox — ±7.5% boundary inclusive", () => {
    // 7.5% of 1000 = 75 → [925, 1075] inclusive.
    expect(ev("amount", "isapprox", 1000, { amountCents: 1075 })).toBe(true); // upper boundary
    expect(ev("amount", "isapprox", 1000, { amountCents: 925 })).toBe(true); // lower boundary
    expect(ev("amount", "isapprox", 1000, { amountCents: 1076 })).toBe(false); // just over
    expect(ev("amount", "isapprox", 1000, { amountCents: 924 })).toBe(false); // just under
    expect(ev("amount", "isapprox", 1000, { amountCents: 1000 })).toBe(true);
  });
  test("no amount on txn is no-match", () => {
    expect(ev("amount", "gt", 0, {})).toBe(false);
    expect(ev("amount", "inflow", undefined, {})).toBe(false);
  });
});

describe("SMS body conditions", () => {
  const txn: TxnLike = { smsBody: "INR 500 spent on Kotak UPI ref 123" };
  test("matches case-insensitively", () => {
    expect(ev("smsBody", "contains", "kotak upi", txn)).toBe(true);
    expect(ev("smsBody", "is", "other", txn)).toBe(false);
    expect(ev("smsBody", "matches", "UPI\\s+ref", txn)).toBe(true);
  });
});

describe("date conditions", () => {
  const txn: TxnLike = { date: "2026-07-19" };
  test("is / month / year", () => {
    expect(ev("date", "is", "2026-07-19", txn)).toBe(true);
    expect(ev("date", "is", "2026-07-20", txn)).toBe(false);
    expect(ev("date", "month", 7, txn)).toBe(true);
    expect(ev("date", "month", 6, txn)).toBe(false);
    expect(ev("date", "year", 2026, txn)).toBe(true);
    expect(ev("date", "year", 2025, txn)).toBe(false);
  });
  test("missing/invalid date is no-match", () => {
    expect(ev("date", "month", 7, {})).toBe(false);
    expect(ev("date", "month", 7, { date: "nonsense" })).toBe(false);
  });
});

describe("id conditions (account / category / payeeId)", () => {
  const txn: TxnLike = { accountId: "acc-1", categoryId: "cat-9", payeeId: "pay-3" };
  test("is (exact, case-sensitive)", () => {
    expect(ev("account", "is", "acc-1", txn)).toBe(true);
    expect(ev("account", "is", "ACC-1", txn)).toBe(false);
    expect(ev("category", "is", "cat-9", txn)).toBe(true);
    expect(ev("payeeId", "is", "pay-3", txn)).toBe(true);
  });
  test("oneOf", () => {
    expect(ev("account", "oneOf", ["acc-2", "acc-1"], txn)).toBe(true);
    expect(ev("category", "oneOf", ["cat-1", "cat-2"], txn)).toBe(false);
  });
  test("null field is no-match", () => {
    expect(ev("category", "is", "cat-9", { categoryId: null })).toBe(false);
  });
});

describe("unknown field / op", () => {
  test("returns false, never throws", () => {
    expect(ev("bogus", "is", "x", { payeeName: "x" })).toBe(false);
    expect(ev("payee", "bogusOp", "x", { payeeName: "x" })).toBe(false);
  });
});

describe("matchesConditions — match all vs any", () => {
  const txn: TxnLike = { payeeName: "Blinkit", amountCents: -50000 };
  const conds: Condition[] = [
    { field: "payee", op: "is", value: "blinkit" },
    { field: "amount", op: "outflow" },
  ];
  test("match=all requires every condition", () => {
    const trigger: TriggerPayload = { match: "all", conditions: conds };
    expect(matchesConditions(trigger, txn)).toBe(true);
    expect(
      matchesConditions(
        { match: "all", conditions: [...conds, { field: "payee", op: "is", value: "zomato" }] },
        txn,
      ),
    ).toBe(false);
  });
  test("match=any requires at least one", () => {
    const trigger: TriggerPayload = {
      match: "any",
      conditions: [{ field: "payee", op: "is", value: "zomato" }, { field: "amount", op: "outflow" }],
    };
    expect(matchesConditions(trigger, txn)).toBe(true);
    expect(
      matchesConditions(
        { match: "any", conditions: [{ field: "payee", op: "is", value: "zomato" }] },
        txn,
      ),
    ).toBe(false);
  });
  test("default match is all", () => {
    expect(matchesConditions({ conditions: conds }, txn)).toBe(true);
  });
  test("empty conditions: all=true (vacuous), any=false", () => {
    expect(matchesConditions({ match: "all", conditions: [] }, txn)).toBe(true);
    expect(matchesConditions({ match: "any", conditions: [] }, txn)).toBe(false);
  });
});
