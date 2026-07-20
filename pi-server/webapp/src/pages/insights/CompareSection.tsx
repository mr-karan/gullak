import { useMemo } from "react";

import { fmtCompact } from "@/lib/money";
import { useSummaries } from "@/api/summary";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { Skeleton } from "@/components/ui/skeleton";

import { compareRanges } from "./months";

// This month vs last: income, spending, net — each a stat cell with a delta
// pill. Spending is shown as a positive magnitude; a smaller spend delta is the
// good one, so its tone is inverted. The divided instrument idiom from Accounts.
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
    <Panel title="This month vs last">
      {loading ? (
        <Skeleton className="m-4 h-24" />
      ) : (
        <div className="grid grid-cols-1 divide-y divide-rule sm:grid-cols-3 sm:divide-x sm:divide-y-0">
          {blocks.map((b) => {
            const good = b.delta === 0 ? null : b.goodWhenUp ? b.delta > 0 : b.delta < 0;
            const signed = `${b.delta > 0 ? "+" : ""}${fmtCompact(b.delta)}`;
            return (
              <div key={b.label} className="min-w-0 px-5 py-4">
                <p className="text-[11px] font-medium uppercase tracking-wider text-ink-2">
                  {b.label}
                </p>
                <p className="mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight text-ink">
                  {fmtCompact(b.value)}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  {b.delta === 0 ? (
                    <span className="text-xs text-ink-2">No change</span>
                  ) : (
                    <>
                      <Pill tone={good ? "pos" : "neg"}>{signed}</Pill>
                      <span className="text-xs text-ink-2">vs last month</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Panel>
  );
}
