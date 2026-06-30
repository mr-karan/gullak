// Bridges Gullak's category names onto the Finance Tracker sheet's canonical
// category set (+ Need/Want/Saving type). Post-unification the two sets are the
// SAME spend categories, so most entries here are identity — the legacy rows
// (eating out, transport, fuel, …) are aliases kept so transactions captured
// before the category migration still map cleanly.
//
// NO category is dropped: if a row exists in SQLite it must exist in the sheet
// (the owner's rule). A category we don't recognise simply maps to null, and
// sync.ts pushes it with a BLANK Category/Type for the user to fill in-sheet —
// never silently swallowed. (sync.ts still skips transfer legs / split children
// to avoid double-counting, and income/credits because the sheet's Amount
// column is expense-only — those are structural, not category, decisions.)
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
  "car maintenance": { category: "Car Maintenance", type: NEED },
  "dining & delivery": { category: "Dining & Delivery", type: WANT },
  "shopping & lifestyle": { category: "Shopping & Lifestyle", type: WANT },
  alcohol: { category: "Alcohol", type: WANT },
  "travel & trips": { category: "Travel & Trips", type: WANT },
  subscriptions: { category: "Subscriptions", type: WANT },
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
  "personal care": { category: "Shopping & Lifestyle", type: WANT },
  gifts: { category: "Shopping & Lifestyle", type: WANT },
  donations: { category: "Shopping & Lifestyle", type: WANT },
  family: { category: "Family", type: NEED },
  travel: { category: "Travel & Trips", type: WANT },
  investments: { category: "Investments & Savings", type: SAVING },
  "savings & goals": { category: "Investments & Savings", type: SAVING },
  "emergency fund": { category: "Investments & Savings", type: SAVING },
};

/**
 * Map a Gullak category onto a sheet category + Need/Want/Saving type.
 * Returns null when the category is unknown/unmapped (including null) — the
 * caller pushes the row anyway with a BLANK Category for the user to fill.
 * Nothing is dropped here: a real spend must never vanish just because its
 * category isn't in the canonical set.
 */
export function mapCategory(gullakCategory: string | null): SheetCategory | null {
  if (!gullakCategory) return null; // uncategorised → push blank
  return MAP[gullakCategory.trim().toLowerCase()] ?? null; // unknown → push blank
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
