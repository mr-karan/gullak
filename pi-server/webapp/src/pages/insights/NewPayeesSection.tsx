import { useMemo } from "react";

import { currentMonthRange } from "@/lib/dates";
import { fmtCompact, fmtDayMonth } from "@/lib/money";
import { useNewPayees } from "@/api/insights";
import { Panel } from "@/components/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { CenterNote } from "@/components/states";

// Payees seen for the first time this month (their earliest txn ever lands in
// the window). A register-style table: payee + first-seen, period total right.
export function NewPayeesSection({ enabled }: { enabled: boolean }) {
  const range = useMemo(() => currentMonthRange(), []);
  const q = useNewPayees(range, enabled);
  if (q.notDeployed) return null;

  const loading = q.isLoading;
  const rows = q.data?.payees ?? [];

  return (
    <Panel
      title="New payees this month"
      right={
        rows.length > 0 ? (
          <span className="text-xs tabular-nums text-ink-2">{rows.length} rows</span>
        ) : undefined
      }
    >
      {loading ? (
        <Skeleton className="m-4 h-52" />
      ) : rows.length === 0 ? (
        <div className="px-4">
          <CenterNote>No new payees this month.</CenterNote>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-rule text-[11px] uppercase tracking-wider text-ink-2">
                <th className="px-4 py-2 text-left font-medium">Payee</th>
                <th className="hidden px-4 py-2 text-left font-medium sm:table-cell">First seen</th>
                <th className="px-4 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.payeeId}
                  className="border-t border-rule/60 transition-colors first:border-t-0 hover:bg-paper-2/60"
                >
                  <td className="px-4 py-2.5">
                    <span className="block max-w-[22ch] truncate font-medium text-ink">
                      {r.payeeName || "Unknown"}
                    </span>
                    <span className="block truncate text-xs text-ink-2 sm:hidden">
                      First seen {fmtDayMonth(r.firstDate)} · {r.txnCount} txn
                      {r.txnCount === 1 ? "" : "s"}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-ink-2 sm:table-cell">
                    {fmtDayMonth(r.firstDate)} · {r.txnCount} txn{r.txnCount === 1 ? "" : "s"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums">
                    <span className="block font-semibold text-ink">
                      {fmtCompact(r.periodTotalCents)}
                    </span>
                    <span className="block text-xs text-ink-2">
                      first {fmtCompact(r.firstAmountCents)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
