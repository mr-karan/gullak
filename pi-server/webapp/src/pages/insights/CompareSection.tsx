import { useMemo } from "react";

import { cn } from "@/lib/utils";
import { fmtCompact, fmtCentsSigned } from "@/lib/money";
import { useSummaries } from "@/api/summary";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { compareRanges } from "./months";

// This month vs last: income, spending, net — each with a delta line. Spending
// is shown as a positive magnitude; a smaller spend delta is the good one, so
// its tone is inverted.
export function CompareSection({ enabled }: { enabled: boolean }) {
  const { thisMonth, lastMonth } = useMemo(() => compareRanges(), []);
  const [thisQ, lastQ] = useSummaries([thisMonth, lastMonth], enabled);

  const loading = thisQ.isLoading || lastQ.isLoading;

  const t = thisQ.data;
  const l = lastQ.data;
  const blocks = [
    {
      label: "Income",
      value: t?.incomeCents ?? 0,
      delta: (t?.incomeCents ?? 0) - (l?.incomeCents ?? 0),
      goodWhenUp: true,
    },
    {
      label: "Spending",
      value: Math.abs(t?.expenseCents ?? 0),
      delta: Math.abs(t?.expenseCents ?? 0) - Math.abs(l?.expenseCents ?? 0),
      goodWhenUp: false,
    },
    {
      label: "Net",
      value: t?.netCents ?? 0,
      delta: (t?.netCents ?? 0) - (l?.netCents ?? 0),
      goodWhenUp: true,
    },
  ];

  return (
    <section>
      <SectionTitle>This month vs last</SectionTitle>
      {loading ? (
        <Skeleton className="mt-3 h-28 w-full rounded-lg" />
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {blocks.map((b) => {
            const good = b.delta === 0 ? null : b.goodWhenUp ? b.delta > 0 : b.delta < 0;
            return (
              <Card key={b.label} className="p-5">
                <p className="text-xs text-ink-2">{b.label}</p>
                <p className="mt-1 text-2xl font-[620] tnum tracking-tight text-ink">
                  {fmtCompact(b.value)}
                </p>
                <p
                  className={cn(
                    "mt-1 text-xs tnum",
                    good === null && "text-ink-2",
                    good === true && "text-pos",
                    good === false && "text-neg",
                  )}
                >
                  {b.delta === 0
                    ? "No change vs last month"
                    : `${fmtCentsSigned(b.delta)} vs last month`}
                </p>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-lg tracking-tight text-ink">{children}</h2>;
}
