// Per-unit prices (avg, LTP) come off the import as plain RUPEE numbers, not
// integer minor units — so they must NOT go through fmtCents (which divides by
// 100). This is the one money value in the app that is already in rupees.
const inrRupees = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Rupee number -> "₹1,234.56". For per-unit avg/LTP prices only. */
export function fmtRupees(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return inrRupees.format(n);
}

/** Plain quantity: trims trailing zeros, keeps up to 3dp for MF fractions. */
export function fmtQty(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return n.toLocaleString("en-IN", { maximumFractionDigits: 3 });
}

/** Short "MF" / "EQ" kind label — rendered as quiet text, never a chip. */
export function kindLabel(kind: string): string {
  if (kind === "mutual_fund") return "MF";
  if (kind === "equity") return "EQ";
  return kind.toUpperCase();
}
