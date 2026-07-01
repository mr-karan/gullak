import { expect, test } from "vitest";

import { mapCategory, paymentModeForKind, type SheetType } from "./mapping.ts";

// These tests pin the sheet category mapping against two fixed contracts:
//   1. The app's DEFAULT category tree (app/lib/features/categories/data/
//      category_repository.dart) — every category a fresh install can produce.
//   2. The Finance Tracker sheet's own 9 categories + Need/Want/Saving types
//      (Setup tab A11:A19 / B11:B19).
// If either drifts, a real expense could silently vanish from the sheet or land
// under a category/type the sheet doesn't have. Keep these in sync by hand when
// the default tree or the sheet's Setup tab changes.

// The sheet's 9 categories and their fixed type (Setup tab). "Household Help"
// has no default category mapping onto it yet — that's intentional.
const SHEET_CATEGORY_TYPES: Record<string, SheetType> = {
  "House Loan EMI": "Need",
  Rent: "Need",
  Groceries: "Need",
  "Utilities & Bills": "Need",
  "Household Help": "Need",
  "Transport & Fuel": "Need",
  "Health & Insurance": "Need",
  "Car Maintenance": "Need",
  "Dining & Delivery": "Want",
  "Shopping & Lifestyle": "Want",
  Alcohol: "Want",
  "Travel & Trips": "Want",
  Subscriptions: "Want",
  Family: "Need",
  "Investments & Savings": "Saving",
};

// Default SPENDING leaf categories → the (category, type) we expect on the
// sheet. Every leaf must map: a default expense category must never silently
// drop out of the export.
const SPENDING_LEAF_EXPECTATIONS: Record<
  string,
  { category: string; type: SheetType }
> = {
  Groceries: { category: "Groceries", type: "Need" },
  "Eating Out": { category: "Dining & Delivery", type: "Want" },
  Transport: { category: "Transport & Fuel", type: "Need" },
  Health: { category: "Health & Insurance", type: "Need" },
  Rent: { category: "Rent", type: "Need" },
  Utilities: { category: "Utilities & Bills", type: "Need" },
  "Phone & Internet": { category: "Utilities & Bills", type: "Need" },
  Insurance: { category: "Health & Insurance", type: "Need" },
  Shopping: { category: "Shopping & Lifestyle", type: "Want" },
  Entertainment: { category: "Shopping & Lifestyle", type: "Want" },
  Travel: { category: "Travel & Trips", type: "Want" },
  "Personal Care": { category: "Shopping & Lifestyle", type: "Want" },
  "Emergency Fund": { category: "Investments & Savings", type: "Saving" },
  Investments: { category: "Investments & Savings", type: "Saving" },
  Gifts: { category: "Shopping & Lifestyle", type: "Want" },
  Donations: { category: "Shopping & Lifestyle", type: "Want" },
};

// Default INCOME categories — never expenses, must all be excluded (null).
const INCOME_CATEGORIES = [
  "Income",
  "Salary",
  "Interest",
  "Refunds",
  "Other Income",
];

test("every default spending leaf maps to a sheet category", () => {
  for (const [leaf, expected] of Object.entries(SPENDING_LEAF_EXPECTATIONS)) {
    const got = mapCategory(leaf);
    expect(got, `leaf "${leaf}" must map`).not.toBeNull();
    expect(got).toEqual(expected);
  }
});

test("every mapped category is a real sheet category with the sheet's type", () => {
  // Guards against typos and Need/Want/Saving drift: anything the mapper emits
  // must be one of the 9 Setup-tab categories AND carry that category's type.
  for (const leaf of Object.keys(SPENDING_LEAF_EXPECTATIONS)) {
    const got = mapCategory(leaf);
    if (!got) continue;
    expect(
      SHEET_CATEGORY_TYPES,
      `"${got.category}" is not a Setup-tab category`,
    ).toHaveProperty(got.category);
    expect(got.type, `type drift for "${got.category}"`).toBe(
      SHEET_CATEGORY_TYPES[got.category]!,
    );
  }
});

test("income categories are unmapped (sync keeps them out by amount sign)", () => {
  // Income has no sheet spend-category, so mapCategory returns null. They stay
  // out of the expense sheet because sync.ts only exports debits (amount < 0),
  // NOT because the category is force-excluded.
  for (const name of INCOME_CATEGORIES) {
    expect(mapCategory(name), `income "${name}" has no spend category`).toBeNull();
  }
});

test("parent-category behavior is explicit and stable", () => {
  // Transactions normally carry leaf categories, but a row tagged at the parent
  // level should still behave predictably. These assertions document the call:
  // the four spending parents fold into a representative sheet bucket, while
  // "Giving" is excluded at the parent level even though its children
  // (Gifts/Donations) are exported — gifts/donations are real discretionary
  // spend; a bare "Giving" parent is too ambiguous to bucket.
  expect(mapCategory("Daily Living")).toEqual({
    category: "Groceries",
    type: "Need",
  });
  expect(mapCategory("Home & Bills")).toEqual({
    category: "Utilities & Bills",
    type: "Need",
  });
  expect(mapCategory("Lifestyle")).toEqual({
    category: "Shopping & Lifestyle",
    type: "Want",
  });
  expect(mapCategory("Savings & Goals")).toEqual({
    category: "Investments & Savings",
    type: "Saving",
  });
  expect(mapCategory("Giving")).toBeNull();
});

test("mapCategory is case-insensitive and trims whitespace", () => {
  expect(mapCategory("  groceries  ")).toEqual({
    category: "Groceries",
    type: "Need",
  });
  expect(mapCategory("EATING OUT")).toEqual({
    category: "Dining & Delivery",
    type: "Want",
  });
});

test("unmapped categories return null so the row is pushed BLANK, not dropped", () => {
  // A null from mapCategory is NOT a drop — sync.ts pushes the row with a blank
  // Category for the user to fill in-sheet. Nothing vanishes. This is the rule:
  // if a row exists in SQLite it exists in the sheet. Covers null/empty/junk
  // AND the non-canonical buckets that were previously force-excluded (cash
  // withdrawal, fees, taxes, self transfer, giving, and the "Money" catch-all
  // that used to silently swallow real P2P spends).
  for (const c of [
    null,
    "",
    "   ",
    "Totally Made Up Category",
    "Cash Withdrawal",
    "Fees & Charges",
    "Taxes",
    "Self Transfer",
    "Giving",
    "Money",
  ]) {
    expect(mapCategory(c), `"${c}" should map to null (pushed blank)`).toBeNull();
  }
});

test("paymentModeForKind maps account kinds to sheet payment modes", () => {
  expect(paymentModeForKind("credit_card")).toBe("Credit Card");
  expect(paymentModeForKind("cash")).toBe("Cash");
  expect(paymentModeForKind("checking")).toBe("UPI");
  expect(paymentModeForKind(null)).toBe("UPI");
  expect(paymentModeForKind(undefined)).toBe("UPI");
});
