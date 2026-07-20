import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { fmtCompact } from "@/lib/money";
import { MONTHS_SHORT, type DateRange } from "@/lib/dates";
import { useCategories } from "@/api/categories";
import { useTransactions } from "@/api/transactions";
import { Panel } from "@/components/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { CenterNote } from "@/components/states";

interface GridRow {
  name: string;
  months: number[]; // 12 cells of outflow, integer cents
  total: number;
}

function cell(cents: number): string {
  return cents > 0 ? fmtCompact(cents) : "—";
}

// Yearly category × month spend grid. Aggregated client-side from a whole year
// of transactions. The table idiom from the register: column headers, tabular
// cells, hairline rows, and a sticky first column so category names stay pinned
// while months scroll. The year toggle rides in the Panel header.
export function CategoryMonthGrid({
  year,
  thisYear,
  onYearChange,
  enabled,
}: {
  year: number;
  thisYear: number;
  onYearChange: (year: number) => void;
  enabled: boolean;
}) {
  const range = useMemo<DateRange>(
    () => ({ startDate: `${year}-01-01`, endDate: `${year}-12-31` }),
    [year],
  );
  const txnQ = useTransactions(range, undefined, enabled);
  const catQ = useCategories(enabled);

  const categoryName = useMemo(() => {
    const map = new Map((catQ.data ?? []).map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "Uncategorized") : "Uncategorized");
  }, [catQ.data]);

  const { rows, monthTotals, grandTotal } = useMemo(() => {
    const byCategory: Record<string, number[]> = {};
    const monthTotals = new Array(12).fill(0);
    for (const t of txnQ.data?.transactions ?? []) {
      if (t.amountCents >= 0) continue; // expenses only
      const mi = Number.parseInt((t.date || "").slice(5, 7), 10) - 1;
      if (Number.isNaN(mi) || mi < 0 || mi > 11) continue;
      const name = categoryName(t.categoryId);
      const abs = Math.abs(t.amountCents);
      if (!byCategory[name]) byCategory[name] = new Array(12).fill(0);
      byCategory[name][mi] += abs;
      monthTotals[mi] += abs;
    }
    const rows: GridRow[] = Object.entries(byCategory)
      .map(([name, months]) => ({ name, months, total: months.reduce((s, v) => s + v, 0) }))
      .sort((a, b) => b.total - a.total);
    return { rows, monthTotals, grandTotal: monthTotals.reduce((s, v) => s + v, 0) };
  }, [txnQ.data, categoryName]);

  const loading = txnQ.isLoading || catQ.isLoading;

  return (
    <Panel
      title="Category by month"
      right={
        <div className="flex items-center gap-0.5 rounded-md bg-paper-3 p-0.5">
          <YearTab active={year === thisYear} onClick={() => onYearChange(thisYear)}>
            This year
          </YearTab>
          <YearTab active={year === thisYear - 1} onClick={() => onYearChange(thisYear - 1)}>
            Last year
          </YearTab>
        </div>
      }
    >
      {loading ? (
        <Skeleton className="m-4 h-64" />
      ) : rows.length === 0 ? (
        <div className="px-4">
          <CenterNote>Nothing logged in {year} yet.</CenterNote>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-rule text-[11px] uppercase tracking-wider text-ink-2">
                <th className="sticky left-0 z-10 bg-card px-4 py-2 text-left font-medium">
                  Category
                </th>
                {MONTHS_SHORT.map((m) => (
                  <th key={m} className="px-3 py-2 text-right font-medium">
                    {m}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.name}
                  className="border-t border-rule/60 transition-colors hover:bg-paper-2/60"
                >
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-card px-4 py-2 font-medium text-ink">
                    {r.name}
                  </td>
                  {r.months.map((v, i) => (
                    <td
                      key={i}
                      className={cn(
                        "px-3 py-2 text-right tabular-nums",
                        v > 0 ? "text-ink" : "text-ink-2",
                      )}
                    >
                      {cell(v)}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">
                    {cell(r.total)}
                  </td>
                </tr>
              ))}
              <tr className="border-t-2 border-rule bg-paper-2">
                <td className="sticky left-0 z-10 bg-paper-2 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                  Total
                </td>
                {monthTotals.map((v, i) => (
                  <td key={i} className="px-3 py-2 text-right font-medium tabular-nums text-ink">
                    {cell(v)}
                  </td>
                ))}
                <td className="px-4 py-2 text-right font-semibold tabular-nums text-ink">
                  {cell(grandTotal)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

function YearTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active ? "bg-card text-ink shadow-sm" : "text-ink-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}
