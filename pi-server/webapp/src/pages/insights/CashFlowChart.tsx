import { useMemo } from "react";
import {
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { fmtCompact } from "@/lib/money";
import { useSummaries } from "@/api/summary";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { SectionTitle } from "./CompareSection";
import { lastNMonths } from "./months";

interface Datum {
  month: string;
  income: number;
  expense: number;
}

// Flat month-by-month cash flow: income above the axis (pos), expense below
// (neg). Colours come straight from the design tokens; no gradients, no
// animation, a bare tooltip.
export function CashFlowChart({ enabled }: { enabled: boolean }) {
  const months = useMemo(() => lastNMonths(6), []);
  const ranges = useMemo(() => months.map((m) => m.range), [months]);
  const results = useSummaries(ranges, enabled);

  const loading = results.some((r) => r.isLoading);
  const data: Datum[] = months.map((m, i) => ({
    month: m.label,
    income: results[i]?.data?.incomeCents ?? 0,
    expense: -Math.abs(results[i]?.data?.expenseCents ?? 0),
  }));

  return (
    <section>
      <SectionTitle>Cash-flow trend</SectionTitle>
      <Card className="mt-3 p-5">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: "var(--ink-2)", fontSize: 12 }}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  width={52}
                  tick={{ fill: "var(--ink-2)", fontSize: 12 }}
                  tickFormatter={(v: number) => fmtCompact(v)}
                />
                <ReferenceLine y={0} stroke="var(--rule)" />
                <Tooltip
                  cursor={{ fill: "var(--paper-3)" }}
                  content={<FlowTooltip />}
                />
                <Bar dataKey="income" fill="var(--pos)" isAnimationActive={false} maxBarSize={22} />
                <Bar dataKey="expense" fill="var(--neg)" isAnimationActive={false} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </section>
  );
}

function FlowTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey?: string | number; value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const income = payload.find((p) => p.dataKey === "income")?.value ?? 0;
  const expense = Math.abs(payload.find((p) => p.dataKey === "expense")?.value ?? 0);
  return (
    <div className="rounded-md border border-rule bg-card px-3 py-2 text-xs">
      <p className="font-medium text-ink">{label}</p>
      <p className="tnum text-pos">In {fmtCompact(income)}</p>
      <p className="tnum text-neg">Out {fmtCompact(expense)}</p>
    </div>
  );
}
