import { iso, type DateRange } from "@/lib/dates";
import { MONTHS_SHORT } from "@/lib/dates";

export interface LabelledRange {
  label: string;
  range: DateRange;
}

/** Full calendar month [1st, last day] for a given year/month index (0-11). */
export function fullMonthRange(year: number, monthIndex: number): DateRange {
  return {
    startDate: iso(new Date(year, monthIndex, 1)),
    endDate: iso(new Date(year, monthIndex + 1, 0)),
  };
}

/** This month so far [1st, today] and last month in full — the compare pair. */
export function compareRanges(now = new Date()): { thisMonth: DateRange; lastMonth: DateRange } {
  const thisMonth: DateRange = {
    startDate: iso(new Date(now.getFullYear(), now.getMonth(), 1)),
    endDate: iso(now),
  };
  const lastMonth = fullMonthRange(now.getFullYear(), now.getMonth() - 1);
  return { thisMonth, lastMonth };
}

/** The last `n` months, oldest → newest, ending with the current month. */
export function lastNMonths(n: number, now = new Date()): LabelledRange[] {
  const out: LabelledRange[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({
      label: MONTHS_SHORT[d.getMonth()],
      range: fullMonthRange(d.getFullYear(), d.getMonth()),
    });
  }
  return out;
}
