import { useMemo } from "react";

import { currentMonthRange } from "@/lib/dates";
import { fmtCompact, fmtDayMonth } from "@/lib/money";
import { useNewPayees } from "@/api/insights";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CenterNote } from "@/components/states";

import { SectionTitle } from "./CompareSection";

// Payees seen for the first time this month (their earliest txn ever lands in
// the window). Period total on the right, first-seen date + first amount below.
export function NewPayeesSection({ enabled }: { enabled: boolean }) {
  const range = useMemo(() => currentMonthRange(), []);
  const q = useNewPayees(range, enabled);
  if (q.notDeployed) return null;

  const loading = q.isLoading;
  const rows = q.data?.payees ?? [];

  return (
    <section>
      <SectionTitle>New payees this month</SectionTitle>
      <Card className="mt-3 p-5">
        {loading ? (
          <Skeleton className="h-52 w-full" />
        ) : rows.length === 0 ? (
          <CenterNote>No new payees this month.</CenterNote>
        ) : (
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.payeeId} className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{r.payeeName || "Unknown"}</p>
                  <p className="text-xs text-ink-2">
                    First seen {fmtDayMonth(r.firstDate)} · {r.txnCount} txn
                    {r.txnCount === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm tnum text-ink">{fmtCompact(r.periodTotalCents)}</p>
                  <p className="text-xs tnum text-ink-2">
                    first {fmtCompact(r.firstAmountCents)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}
