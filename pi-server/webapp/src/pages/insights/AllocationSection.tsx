import { useMemo } from "react";

import { fmtCompact } from "@/lib/money";
import { useHoldings } from "@/api/holdings";
import { useNetWorth } from "@/api/networth";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { SectionTitle } from "./CompareSection";

// Where the net worth sits: equity vs mutual funds (live holdings) vs cash
// (net-worth). Flat bars sized by share of the total. Hidden entirely when
// holdings aren't deployed or empty — no portfolio, no section.
export function AllocationSection({ enabled }: { enabled: boolean }) {
  const holdingsQ = useHoldings(enabled);
  const netWorthQ = useNetWorth(enabled);

  const parts = useMemo(() => {
    let equity = 0;
    let mf = 0;
    for (const h of holdingsQ.data?.holdings ?? []) {
      if (h.stale) continue;
      if (h.kind === "mutual_fund") mf += h.currentCents;
      else equity += h.currentCents;
    }
    const cash = netWorthQ.data?.cashCents ?? 0;
    return [
      { label: "Equity", cents: equity },
      { label: "Mutual funds", cents: mf },
      { label: "Cash", cents: cash },
    ].filter((p) => p.cents > 0);
  }, [holdingsQ.data, netWorthQ.data]);

  const loading = holdingsQ.isLoading || netWorthQ.isLoading;
  const total = parts.reduce((s, p) => s + p.cents, 0);

  // Nothing to allocate — stay silent rather than render an empty shell.
  if (holdingsQ.notDeployed || (!loading && (parts.length === 0 || total === 0))) return null;

  return (
    <section>
      <SectionTitle>Allocation</SectionTitle>
      <Card className="mt-3 p-5">
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <ul className="flex flex-col gap-3">
            {parts.map((p) => {
              const pct = (p.cents / total) * 100;
              return (
                <li key={p.label} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-ink">{p.label}</span>
                    <span className="text-sm text-ink-2 tnum">
                      {fmtCompact(p.cents)} · {pct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-paper-3">
                    <div
                      className="h-full rounded-full bg-brand"
                      style={{ width: `${Math.max(2, pct)}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}
