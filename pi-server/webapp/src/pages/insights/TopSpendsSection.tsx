import { useMemo } from "react";

import { currentMonthRange } from "@/lib/dates";
import { fmtCompact, fmtDayMonth } from "@/lib/money";
import { useTopSpends } from "@/api/insights";
import { useAccounts } from "@/api/accounts";
import { Panel } from "@/components/Panel";
import { Skeleton } from "@/components/ui/skeleton";
import { CenterNote } from "@/components/states";

// The single largest outflows this month, ranked — a register-style table
// matching the Transactions screen: payee + date/account fold, amount right.
export function TopSpendsSection({ enabled }: { enabled: boolean }) {
  const range = useMemo(() => currentMonthRange(), []);
  const q = useTopSpends(range, undefined, 10, enabled);
  const accountsQ = useAccounts(enabled);
  const accountName = useMemo(() => {
    const map = new Map((accountsQ.data ?? []).map((a) => [a.id, a.name]));
    return (id: string) => map.get(id) ?? "Account";
  }, [accountsQ.data]);

  if (q.notDeployed) return null;

  const loading = q.isLoading || accountsQ.isLoading;
  const rows = q.data?.transactions ?? [];

  return (
    <Panel
      title="Top spends this month"
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
          <CenterNote>No outflow this month yet.</CenterNote>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-rule text-[11px] uppercase tracking-wider text-ink-2">
                <th className="px-4 py-2 text-left font-medium">Payee</th>
                <th className="hidden px-4 py-2 text-left font-medium sm:table-cell">Date</th>
                <th className="hidden px-4 py-2 text-left font-medium sm:table-cell">Account</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-rule/60 transition-colors first:border-t-0 hover:bg-paper-2/60"
                >
                  <td className="px-4 py-2.5">
                    <span className="block max-w-[22ch] truncate font-medium text-ink">
                      {t.payeeName || "Unknown"}
                    </span>
                    <span className="block truncate text-xs text-ink-2 sm:hidden">
                      {fmtDayMonth(t.date)} · {accountName(t.accountId)}
                    </span>
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-ink-2 sm:table-cell">
                    {fmtDayMonth(t.date)}
                  </td>
                  <td className="hidden px-4 py-2.5 text-ink-2 sm:table-cell">
                    {accountName(t.accountId)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-neg">
                    {fmtCompact(t.amountCents)}
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
