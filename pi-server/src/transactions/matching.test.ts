import { describe, expect, test } from "vitest";

import {
  dayDiff,
  matchTransactions,
  reconcileTransactions,
  shiftYmd,
  type ExistingTxn,
  type MatchInput,
} from "./matching.ts";

const ACC = "acc-1";

function existing(over: Partial<ExistingTxn> & { id: string }): ExistingTxn {
  return {
    accountId: ACC,
    amountCents: -48000,
    date: "2026-06-10",
    importedId: null,
    payeeName: null,
    ...over,
  };
}

function incoming(over: Partial<MatchInput> = {}): MatchInput {
  return {
    accountId: ACC,
    amountCents: -48000,
    date: "2026-06-10",
    importedId: null,
    payeeName: null,
    ...over,
  };
}

describe("matchTransactions — exact pass", () => {
  test("exact importedId wins over a closer fuzzy candidate", () => {
    const far = existing({ id: "far", importedId: "sms:abc", date: "2026-06-04" }); // 6 days away
    const near = existing({ id: "near", date: "2026-06-10" }); // same day, exact amount
    const res = matchTransactions(
      incoming({ importedId: "sms:abc", date: "2026-06-10" }),
      [near, far],
    );
    expect(res).toEqual({ matched: true, matchType: "exact", matchedId: "far" });
  });

  test("exact pass ignores the date window (id is globally unique)", () => {
    const old = existing({ id: "old", importedId: "sms:xyz", date: "2026-01-01" });
    const res = matchTransactions(incoming({ importedId: "sms:xyz" }), [old]);
    expect(res.matchType).toBe("exact");
    expect(res.matchedId).toBe("old");
  });

  test("different account never matches on importedId", () => {
    const other = existing({ id: "o", accountId: "acc-2", importedId: "sms:abc" });
    const res = matchTransactions(incoming({ importedId: "sms:abc" }), [other]);
    expect(res.matched).toBe(false);
  });
});

describe("matchTransactions — fuzzy amount pass", () => {
  test("±7-day window: day 7 matches, day 8 does not", () => {
    const day7 = existing({ id: "d7", date: shiftYmd("2026-06-10", 7) });
    const day8 = existing({ id: "d8", date: shiftYmd("2026-06-10", 8) });

    expect(matchTransactions(incoming({ date: "2026-06-10" }), [day7])).toEqual({
      matched: true,
      matchType: "fuzzy-amount",
      matchedId: "d7",
    });
    expect(matchTransactions(incoming({ date: "2026-06-10" }), [day8]).matched).toBe(
      false,
    );
  });

  test("payee tiebreak among equal-amount same-day candidates", () => {
    const a = existing({ id: "a", payeeName: "Amazon", date: "2026-06-10" });
    const b = existing({ id: "b", payeeName: "Blinkit", date: "2026-06-10" });
    const res = matchTransactions(
      incoming({ payeeName: "blinkit", date: "2026-06-10" }),
      [a, b],
    );
    expect(res.matchType).toBe("fuzzy-amount");
    expect(res.matchedId).toBe("b"); // payee match beats the arbitrary first row
  });

  test("without a payee match, nearest date wins", () => {
    const near = existing({ id: "near", date: "2026-06-11" }); // 1 day
    const far = existing({ id: "far", date: "2026-06-06" }); // 4 days
    const res = matchTransactions(incoming({ date: "2026-06-10" }), [far, near]);
    expect(res.matchedId).toBe("near");
  });
});

describe("matchTransactions — fuzzy date pass", () => {
  test("different amount within window matches by nearest date", () => {
    const near = existing({ id: "near", amountCents: -12345, date: "2026-06-11" });
    const far = existing({ id: "far", amountCents: -999, date: "2026-06-05" });
    const res = matchTransactions(incoming({ date: "2026-06-10" }), [far, near]);
    expect(res.matchType).toBe("fuzzy-date");
    expect(res.matchedId).toBe("near");
  });
});

describe("matchTransactions — strictIdChecking", () => {
  test("an existing row WITH importedId is not fuzzy-claimable", () => {
    const bankRow = existing({ id: "bank", importedId: "sms:already", date: "2026-06-10" });
    // Incoming has a DIFFERENT importedId, same amount + date → would fuzzy-match
    // if not for strictIdChecking. It must not steal the bank row's slot.
    const res = matchTransactions(
      incoming({ importedId: "sms:different", date: "2026-06-10" }),
      [bankRow],
    );
    expect(res.matched).toBe(false);
  });

  test("an existing row WITH importedId is still exact-claimable", () => {
    const bankRow = existing({ id: "bank", importedId: "sms:same" });
    const res = matchTransactions(incoming({ importedId: "sms:same" }), [bankRow]);
    expect(res).toEqual({ matched: true, matchType: "exact", matchedId: "bank" });
  });
});

describe("matchTransactions — claimed set", () => {
  test("two incoming, one existing → only one matches", () => {
    const only = existing({ id: "only", date: "2026-06-10" });
    const claimed = new Set<string>();
    const first = matchTransactions(incoming({ date: "2026-06-10" }), [only], claimed);
    const second = matchTransactions(incoming({ date: "2026-06-10" }), [only], claimed);
    expect(first.matched).toBe(true);
    expect(first.matchedId).toBe("only");
    expect(second.matched).toBe(false);
  });
});

describe("reconcileTransactions", () => {
  test("partitions incoming into added and matched", () => {
    const e1 = existing({ id: "e1", importedId: "sms:1", date: "2026-06-10" });
    const e2 = existing({ id: "e2", amountCents: -7000, date: "2026-06-12" });

    const rows: MatchInput[] = [
      incoming({ importedId: "sms:1", date: "2026-06-10" }), // exact → e1
      incoming({ amountCents: -7000, date: "2026-06-12" }), // fuzzy-amount → e2
      incoming({ amountCents: -55555, date: "2026-06-10", accountId: "acc-9" }), // no account → added
    ];

    const res = reconcileTransactions(rows, [e1, e2]);
    expect(res.matched).toHaveLength(2);
    expect(res.added).toHaveLength(1);
    expect(res.matched.map((m) => m.matchedId).sort()).toEqual(["e1", "e2"]);
    expect(res.added[0]!.accountId).toBe("acc-9");
  });

  test("does not double-claim: two identical incoming, one existing", () => {
    const only = existing({ id: "only", date: "2026-06-10" });
    const res = reconcileTransactions(
      [incoming({ date: "2026-06-10" }), incoming({ date: "2026-06-10" })],
      [only],
    );
    expect(res.matched).toHaveLength(1);
    expect(res.added).toHaveLength(1);
    expect(res.matched[0]!.matchedId).toBe("only");
  });
});

describe("date helpers", () => {
  test("dayDiff counts signed days", () => {
    expect(dayDiff("2026-06-10", "2026-06-03")).toBe(7);
    expect(dayDiff("2026-06-03", "2026-06-10")).toBe(-7);
  });

  test("shiftYmd crosses month boundaries", () => {
    expect(shiftYmd("2026-06-30", 1)).toBe("2026-07-01");
    expect(shiftYmd("2026-06-01", -1)).toBe("2026-05-31");
  });
});
