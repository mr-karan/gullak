// Register filter model. Server filters by date range (+ accountId when
// scoped); category / uncategorized / search are applied client-side over the
// fetched window. Mirrors the legacy Alpine `transactions` store contract.

import type { DateRange } from "@/lib/dates";
import { iso } from "@/lib/dates";
import type { Category, CategoryGroup, Transaction } from "@/lib/types";

export type RangeKey = "month" | "last-month" | "3m" | "year" | "custom";

export const RANGE_OPTIONS: { key: RangeKey; label: string }[] = [
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "3m", label: "Last 3 months" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

export function isRangeKey(v: string | null): v is RangeKey {
  return v === "month" || v === "last-month" || v === "3m" || v === "year" || v === "custom";
}

/** Inclusive [startDate, endDate] for the active range. Custom needs both
 *  endpoints, else it falls back to this month. */
export function rangeToDates(
  key: RangeKey,
  customStart: string,
  customEnd: string,
  now = new Date(),
): DateRange {
  if (key === "custom" && customStart && customEnd) {
    return { startDate: customStart, endDate: customEnd };
  }
  let start: Date;
  let end: Date = now;
  if (key === "last-month") {
    start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    end = new Date(now.getFullYear(), now.getMonth(), 0);
  } else if (key === "3m") {
    start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
  } else if (key === "year") {
    start = new Date(now.getFullYear(), 0, 1);
  } else {
    start = new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return { startDate: iso(start), endDate: iso(end) };
}

export interface CatGroup {
  group: string;
  categories: { id: string; name: string }[];
}

/** Categories bucketed by their group, ungrouped ones under "Other". Empty
 *  buckets are dropped so the combobox never shows a bare heading. */
export function buildCategoryGroups(categories: Category[], groups: CategoryGroup[]): CatGroup[] {
  const byId = new Map<string, CatGroup>();
  for (const g of groups) byId.set(g.id, { group: g.name, categories: [] });
  const other: CatGroup = { group: "Other", categories: [] };
  for (const c of categories) {
    const bucket = (c.groupId && byId.get(c.groupId)) || other;
    bucket.categories.push({ id: c.id, name: c.name });
  }
  return [...byId.values(), other].filter((b) => b.categories.length > 0);
}

/** Client-side predicate: category id, uncategorized-only, and a free-text
 *  search over payee / notes / location. */
export function matchesFilters(
  t: Transaction,
  opts: { categoryId: string | null; uncategorizedOnly: boolean; search: string },
): boolean {
  if (opts.categoryId && t.categoryId !== opts.categoryId) return false;
  if (opts.uncategorizedOnly && t.categoryId) return false;
  const q = opts.search.trim().toLowerCase();
  if (q) {
    const hay = `${t.payeeName ?? ""} ${t.notes ?? ""} ${t.locationName ?? ""}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** One rendered register line. A normal txn is shown directly; a group parent
 *  (#46) carries its member children and a DERIVED total (children carry the
 *  real money — the stored parent's amountCents is always 0). */
export interface DisplayRow {
  txn: Transaction;
  /** Present only for a group parent: its member rows, hidden from top level. */
  children?: Transaction[];
  /** Amount shown for this line: the txn's own amount, or a group parent's
   *  derived total (sum of its children). */
  displayCents: number;
}

export interface DateGroup {
  date: string;
  rows: DisplayRow[];
  netCents: number;
}

/** Group rows by date descending; each group carries its day net. Input is
 *  already newest-first from the server. Group parents (#46) collapse their
 *  children: children whose parent is in view render nested under the parent
 *  and are removed from the top level. The parent's shown amount is the derived
 *  sum of its children (the stored parent amount is 0), so day nets and totals
 *  never double-count. */
export function groupByDate(rows: Transaction[]): DateGroup[] {
  const parentPresent = new Set<string>();
  for (const t of rows) if (t.isGroupParent) parentPresent.add(t.id);

  const childrenByParent = new Map<string, Transaction[]>();
  for (const t of rows) {
    if (t.groupParentId && parentPresent.has(t.groupParentId)) {
      const b = childrenByParent.get(t.groupParentId);
      if (b) b.push(t);
      else childrenByParent.set(t.groupParentId, [t]);
    }
  }

  // Top level: everything except children whose parent is in view.
  const top = rows.filter(
    (t) => !(t.groupParentId && parentPresent.has(t.groupParentId)),
  );

  const map = new Map<string, DisplayRow[]>();
  for (const t of top) {
    const children = t.isGroupParent
      ? (childrenByParent.get(t.id) ?? [])
      : undefined;
    const displayCents = children
      ? children.reduce((s, c) => s + c.amountCents, 0)
      : t.amountCents;
    const row: DisplayRow = { txn: t, children, displayCents };
    const bucket = map.get(t.date);
    if (bucket) bucket.push(row);
    else map.set(t.date, [row]);
  }

  return [...map.keys()]
    .sort((a, b) => b.localeCompare(a))
    .map((date) => {
      const groupRows = map.get(date)!;
      return {
        date,
        rows: groupRows,
        netCents: groupRows.reduce((s, r) => s + r.displayCents, 0),
      };
    });
}

/** Sticky date-header label: Today / Yesterday / weekday within a week, else
 *  "Fri, 10 Jul". The per-row date column already carries the "dd MMM", so this
 *  never repeats a bare numeric date. */
export function dateHeaderLabel(dateStr: string, now = new Date()): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((today.getTime() - dt.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) {
    return dt.toLocaleDateString("en-IN", { weekday: "long" });
  }
  return dt.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" });
}
