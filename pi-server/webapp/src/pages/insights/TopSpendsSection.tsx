import { useMemo } from "react";

import { currentMonthRange } from "@/lib/dates";
import { fmtCompact, fmtDayMonth } from "@/lib/money";
import { useTopSpends } from "@/api/insights";
import { useAccounts } from "@/api/accounts";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CenterNote } from "@/components/states";

import { SectionTitle } from "./CompareSection";

// The single largest outflows this month, ranked. Payee · date · account on the
// left, amount on the right — same list rhythm as the breakdown bar lists.
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
    <section>
      <SectionTitle>Top spends this month</SectionTitle>
      <Card className="mt-3 p-5">
        {loading ? (
          <Skeleton className="h-52 w-full" />
        ) : rows.length === 0 ? (
          <CenterNote>No outflow this month yet.</CenterNote>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((t) => (
              <li key={t.id} className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{t.payeeName || "Unknown"}</p>
                  <p className="text-xs text-ink-2">
                    {fmtDayMonth(t.date)} · {accountName(t.accountId)}
                  </p>
                </div>
                <span className="shrink-0 text-sm tnum text-neg">
                  {fmtCompact(t.amountCents)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
