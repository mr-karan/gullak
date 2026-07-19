// Money is integer minor units (paise/cents) everywhere in the API. This is the
// single display boundary — never do decimal-string math elsewhere.

const inr2 = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Integer minor units -> "₹1,23,456.00". Always 2dp, Indian grouping. */
export function fmtCents(cents: number | null | undefined): string {
  return inr2.format((cents ?? 0) / 100);
}

/** Signed money that keeps a leading minus for negative balances/nets. */
export function fmtCentsSigned(cents: number | null | undefined): string {
  const v = (cents ?? 0) / 100;
  const s = inr2.format(Math.abs(v));
  return v < 0 ? `-${s}` : s;
}

/** Compact ₹ for large figures: Cr / L / K. Integer minor units in. */
export function fmtCompact(cents: number | null | undefined): string {
  const rupees = Math.round((cents ?? 0) / 100);
  const abs = Math.abs(rupees);
  const sign = rupees < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${trim(abs / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${trim(abs / 1_00_000)}L`;
  if (abs >= 1_000) return `${sign}₹${trim(abs / 1_000, 1)}K`;
  return `${sign}₹${abs.toLocaleString("en-IN")}`;
}

function trim(n: number, dp = 2): string {
  return n.toFixed(dp).replace(/\.?0+$/, "");
}

/** Signed percentage for P&L. */
export function fmtPct(n: number | null | undefined): string {
  const v = Number(n) || 0;
  return `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
}

/** "01 Jul" short label for register/date columns. */
export function fmtDayMonth(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

/** Import/epoch-ms timestamp -> "05 Jul 2026". Empty for unparseable input. */
export function fmtEpochDate(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "";
  let d: Date;
  if (typeof v === "number") d = new Date(v);
  else if (/^\d+$/.test(String(v))) d = new Date(Number(v));
  else d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
