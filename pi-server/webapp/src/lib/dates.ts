// Local-date helpers. The API uses "YYYY-MM-DD" text in the user's local sense,
// so we format from local Date parts (never toISOString, which is UTC).

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function iso(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

/** Inclusive [first-of-month, today]. */
export function currentMonthRange(now = new Date()): DateRange {
  return { startDate: iso(new Date(now.getFullYear(), now.getMonth(), 1)), endDate: iso(now) };
}

export const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** "January 2026" style label for a first-of-month range. */
export function monthTitle(now = new Date()): string {
  return now.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
