import { useMemo } from "react";

import { fmtCompact } from "@/lib/money";
import { currentMonthRange } from "@/lib/dates";
import { useCategories } from "@/api/categories";
import { useTransactions } from "@/api/transactions";
import { Panel } from "@/components/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { CenterNote } from "@/components/states";

interface Row {
  name: string;
  cents: number;
}

/** Flat horizontal bar list: an indigo fill on a paper-3 track, value right. */
function BarList({ rows }: { rows: Row[] }) {
  const max = rows[0]?.cents || 1;
  return (
    <ul className="flex flex-col divide-y divide-rule/60">
      {rows.map((r) => (
        <li key={r.name} className="flex flex-col gap-1.5 px-4 py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-sm text-ink">{r.name}</span>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
              {fmtCompact(r.cents)}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-3">
            <div
              className="h-full rounded-full bg-brand"
              style={{ width: `${Math.max(2, (r.cents / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function useMonthOutflow(enabled: boolean) {
  const range = useMemo(() => currentMonthRange(), []);
  const txnQ = useTransactions(range, undefined, enabled);
  const catQ = useCategories(enabled);

  const categoryName = useMemo(() => {
    const map = new Map((catQ.data ?? []).map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "Uncategorized") : "Uncategorized");
  }, [catQ.data]);

  const { byCategory, byPayee } = useMemo(() => {
    const cat: Record<string, number> = {};
    const pay: Record<string, number> = {};
    for (const t of txnQ.data?.transactions ?? []) {
      if (t.amountCents >= 0) continue; // outflow only
      const abs = Math.abs(t.amountCents);
      const cName = categoryName(t.categoryId);
      cat[cName] = (cat[cName] ?? 0) + abs;
      const pName = t.payeeName || "Unknown";
      pay[pName] = (pay[pName] ?? 0) + abs;
    }
    const top8 = (rec: Record<string, number>): Row[] =>
      Object.entries(rec)
        .map(([name, cents]) => ({ name, cents }))
        .sort((a, b) => b.cents - a.cents)
        .slice(0, 8);
    return { byCategory: top8(cat), byPayee: top8(pay) };
  }, [txnQ.data, categoryName]);

  return { loading: txnQ.isLoading || catQ.isLoading, byCategory, byPayee };
}

export function CategorySection({ enabled }: { enabled: boolean }) {
  const { loading, byCategory } = useMonthOutflow(enabled);
  return (
    <Panel title="Spending by category">
      {loading ? (
        <Skeleton className="m-4 h-52" />
      ) : byCategory.length === 0 ? (
        <div className="px-4">
          <CenterNote>Nothing spent this month yet.</CenterNote>
        </div>
      ) : (
        <BarList rows={byCategory} />
      )}
    </Panel>
  );
}

export function PayeeSection({ enabled }: { enabled: boolean }) {
  const { loading, byPayee } = useMonthOutflow(enabled);
  return (
    <Panel title="Top payees">
      {loading ? (
        <Skeleton className="m-4 h-52" />
      ) : byPayee.length === 0 ? (
        <div className="px-4">
          <CenterNote>No outflow to show this month.</CenterNote>
        </div>
      ) : (
        <BarList rows={byPayee} />
      )}
    </Panel>
  );
}
