// Bridges Gullak's category names onto the Finance Tracker sheet's canonical
// category set (+ Need/Want/Saving type). Post-unification the two sets are the
// SAME 12 spend categories, so most entries here are identity — the legacy
// rows (eating out, transport, fuel, …) are aliases kept so transactions
// captured before the category migration still map cleanly. The EXCLUDE set
// (transfers, tax, card-bill fees, cash withdrawals, income) is dropped via
// isExcludedCategory(). Uncategorised/unmapped expenses are NOT dropped —
// sync.ts pushes them blank for the user to fill in-sheet.
//
// CANONICAL SET (each carries a fixed Type — single source of truth shared by
// the LLM, the Gullak categories, and the sheet's Setup tab):
//   Need:   House Loan EMI, Rent, Groceries, Utilities & Bills, Household Help,
//           Transport & Fuel, Health & Insurance
//   Want:   Dining & Delivery, Shopping & Lifestyle, Alcohol, Travel & Trips
//   Saving: Investments & Savings

export type SheetType = "Need" | "Want" | "Saving";

export interface SheetCategory {
  category: string;
  type: SheetType;
}

const NEED = "Need" as const;
const WANT = "Want" as const;
const SAVING = "Saving" as const;

const MAP: Record<string, SheetCategory> = {
  // ---- Canonical 12 (identity) ----
  "house loan emi": { category: "House Loan EMI", type: NEED },
  rent: { category: "Rent", type: NEED },
  groceries: { category: "Groceries", type: NEED },
  "utilities & bills": { category: "Utilities & Bills", type: NEED },
  "household help": { category: "Household Help", type: NEED },
  "transport & fuel": { category: "Transport & Fuel", type: NEED },
  "health & insurance": { category: "Health & Insurance", type: NEED },
  "dining & delivery": { category: "Dining & Delivery", type: WANT },
  "shopping & lifestyle": { category: "Shopping & Lifestyle", type: WANT },
  alcohol: { category: "Alcohol", type: WANT },
  "travel & trips": { category: "Travel & Trips", type: WANT },
  "investments & savings": { category: "Investments & Savings", type: SAVING },
  // ---- Legacy Gullak names (aliases) → canonical, for pre-migration rows ----
  "daily living": { category: "Groceries", type: NEED },
  fuel: { category: "Transport & Fuel", type: NEED },
  transport: { category: "Transport & Fuel", type: NEED },
  health: { category: "Health & Insurance", type: NEED },
  insurance: { category: "Health & Insurance", type: NEED },
  utilities: { category: "Utilities & Bills", type: NEED },
  "home & bills": { category: "Utilities & Bills", type: NEED },
  "phone & internet": { category: "Utilities & Bills", type: NEED },
  "eating out": { category: "Dining & Delivery", type: WANT },
  shopping: { category: "Shopping & Lifestyle", type: WANT },
  lifestyle: { category: "Shopping & Lifestyle", type: WANT },
  entertainment: { category: "Shopping & Lifestyle", type: WANT },
  subscriptions: { category: "Shopping & Lifestyle", type: WANT },
  "personal care": { category: "Shopping & Lifestyle", type: WANT },
  gifts: { category: "Shopping & Lifestyle", type: WANT },
  donations: { category: "Shopping & Lifestyle", type: WANT },
  family: { category: "Shopping & Lifestyle", type: WANT },
  travel: { category: "Travel & Trips", type: WANT },
  investments: { category: "Investments & Savings", type: SAVING },
  "savings & goals": { category: "Investments & Savings", type: SAVING },
  "emergency fund": { category: "Investments & Savings", type: SAVING },
};

// Explicitly non-expense buckets — never pushed even if they carry a debit.
const EXCLUDE = new Set([
  "cash withdrawal",
  "fees & charges",
  "money",
  "taxes",
  "giving",
  // income group
  "income",
  "interest",
  "other income",
  "refunds",
  "salary",
]);

/** Returns the sheet category/type, or null when the txn must not be pushed. */
export function mapCategory(gullakCategory: string | null): SheetCategory | null {
  if (!gullakCategory) return null; // uncategorised → leave in Gullak
  const key = gullakCategory.trim().toLowerCase();
  if (EXCLUDE.has(key)) return null;
  return MAP[key] ?? null; // unknown category → skip rather than mis-bucket
}

/**
 * True for categories that must NOT appear in the sheet at all (cash
 * withdrawals, fees, taxes, giving, and every income bucket). This is distinct
 * from "uncategorised": an uncategorised expense IS pushed (with a blank
 * Category for the user to fill in-sheet), but an *explicitly excluded* one is
 * dropped so it can't distort the spend/budget math. Unknown/uncategorised →
 * false (i.e. push it blank), so the caller can rely on this only to drop the
 * deliberately-non-spend buckets.
 */
export function isExcludedCategory(gullakCategory: string | null): boolean {
  if (!gullakCategory) return false; // uncategorised is pushed blank, not dropped
  return EXCLUDE.has(gullakCategory.trim().toLowerCase());
}

/** Map a Gullak account kind onto the sheet's Payment Mode column. */
export function paymentModeForKind(kind: string | null | undefined): string {
  switch (kind) {
    case "credit_card":
      return "Credit Card";
    case "cash":
      return "Cash";
    default:
      return "UPI";
  }
}
