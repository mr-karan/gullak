import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { fmtCompact } from "@/lib/money";
import { MONTHS_SHORT, type DateRange } from "@/lib/dates";
import { useCategories } from "@/api/categories";
import { useTransactions } from "@/api/transactions";
import { Card } from "@/components/ui/card";
import { LedgerRule } from "@/components/LedgerRule";
import { Skeleton } from "@/components/ui/skeleton";
import { CenterNote } from "@/components/states";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import { SectionTitle } from "./CompareSection";

interface GridRow {
  name: string;
  months: number[]; // 12 cells of outflow, integer cents
  total: number;
}

function cell(cents: number): string {
  return cents > 0 ? fmtCompact(cents) : "—";
}

// Yearly category × month spend grid, ported from the legacy Reports view.
// Aggregated client-side from a whole year of transactions. No drill-down in
// v1 (the legacy cell drawer is out of scope).
export function CategoryMonthGrid({ year, enabled }: { year: number; enabled: boolean }) {
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
    <section>
      <SectionTitle>Category by month</SectionTitle>
      <Card className="mt-3 p-0">
        {loading ? (
          <Skeleton className="m-5 h-64" />
        ) : rows.length === 0 ? (
          <div className="px-5">
            <CenterNote>Nothing logged in {year} yet.</CenterNote>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="sticky left-0 bg-card">Category</TableHead>
                {MONTHS_SHORT.map((m) => (
                  <TableHead key={m} className="text-right">
                    {m}
                  </TableHead>
                ))}
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <tr aria-hidden>
                <td colSpan={14} className="p-0">
                  <LedgerRule />
                </td>
              </tr>
              {rows.map((r) => (
                <TableRow key={r.name}>
                  <TableCell className="sticky left-0 bg-card font-medium text-ink">
                    {r.name}
                  </TableCell>
                  {r.months.map((v, i) => (
                    <TableCell
                      key={i}
                      className={cn("text-right tnum", v > 0 ? "text-ink" : "text-ink-2")}
                    >
                      {cell(v)}
                    </TableCell>
                  ))}
                  <TableCell className="text-right tnum font-[620] text-ink">
                    {cell(r.total)}
                  </TableCell>
                </TableRow>
              ))}
              <TableRow className="hover:bg-transparent">
                <TableCell className="sticky left-0 bg-card font-medium text-ink">Total</TableCell>
                {monthTotals.map((v, i) => (
                  <TableCell key={i} className="text-right tnum font-medium text-ink">
                    {cell(v)}
                  </TableCell>
                ))}
                <TableCell className="text-right tnum font-[620] text-ink">
                  {cell(grandTotal)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        )}
      </Card>
    </section>
  );
}
