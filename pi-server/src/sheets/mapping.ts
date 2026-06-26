// Maps Gullak's category taxonomy onto the Finance Tracker sheet's 9
// categories (+ Need/Want/Saving type). The EXCLUDE set (transfers, tax,
// card-bill fees, cash withdrawals, all income) is dropped via
// isExcludedCategory(). NOTE: uncategorised/unmapped expenses are NOT dropped —
// sync.ts pushes them with a blank Category for the user to fill in-sheet
// (mapCategory returns null for those; the caller treats null as "blank").

export type SheetType = "Need" | "Want" | "Saving";

export interface SheetCategory {
  category: string;
  type: SheetType;
}

const MAP: Record<string, SheetCategory> = {
  // Needs
  groceries: { category: "Groceries", type: "Need" },
  "daily living": { category: "Groceries", type: "Need" },
  fuel: { category: "Transport & Fuel", type: "Need" },
  transport: { category: "Transport & Fuel", type: "Need" },
  health: { category: "Health & Insurance", type: "Need" },
  insurance: { category: "Health & Insurance", type: "Need" },
  utilities: { category: "Utilities & Bills", type: "Need" },
  "home & bills": { category: "Utilities & Bills", type: "Need" },
  "phone & internet": { category: "Utilities & Bills", type: "Need" },
  rent: { category: "House Loan EMI", type: "Need" },
  // Wants
  "eating out": { category: "Dining & Delivery", type: "Want" },
  shopping: { category: "Shopping & Lifestyle", type: "Want" },
  lifestyle: { category: "Shopping & Lifestyle", type: "Want" },
  entertainment: { category: "Shopping & Lifestyle", type: "Want" },
  subscriptions: { category: "Shopping & Lifestyle", type: "Want" },
  travel: { category: "Travel & Trips", type: "Want" },
  "personal care": { category: "Shopping & Lifestyle", type: "Want" },
  alcohol: { category: "Shopping & Lifestyle", type: "Want" },
  gifts: { category: "Shopping & Lifestyle", type: "Want" },
  donations: { category: "Shopping & Lifestyle", type: "Want" },
  family: { category: "Shopping & Lifestyle", type: "Want" },
  // Savings
  investments: { category: "Investments & Savings", type: "Saving" },
  "savings & goals": { category: "Investments & Savings", type: "Saving" },
  "emergency fund": { category: "Investments & Savings", type: "Saving" },
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
