import {
  Bar,
  BarChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MONTHS_SHORT } from "@/lib/dates";
import { fmtCompact } from "@/lib/money";
import { useCashFlow } from "@/api/insights";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { SectionTitle } from "./CompareSection";

function monthLabel(ym: string): string {
  const m = Number(ym.split("-")[1]);
  return MONTHS_SHORT[m - 1] ?? ym;
}

interface Datum {
  month: string;
  income: number;
  expense: number;
}

// A longer (12-month) cash-flow view sourced from the server-side /cash-flow
// grouping — distinct from the 6-month CashFlowChart, which sums per-month
// /summary calls on the client. Income above the axis, expense below.
export function CashTrendSection({ enabled }: { enabled: boolean }) {
  const q = useCashFlow(12, enabled);
  if (q.notDeployed) return null;

  const loading = q.isLoading;
  const data: Datum[] = (q.data?.series ?? []).map((p) => ({
    month: monthLabel(p.month),
    income: p.incomeCents,
    expense: -Math.abs(p.expenseCents),
  }));
  if (!loading && data.length === 0) return null;

  return (
    <section>
      <SectionTitle>Cash flow · last 12 months</SectionTitle>
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
                <Tooltip cursor={{ fill: "var(--paper-3)" }} content={<FlowTooltip />} />
                <Bar dataKey="income" fill="var(--pos)" isAnimationActive={false} maxBarSize={18} />
                <Bar dataKey="expense" fill="var(--neg)" isAnimationActive={false} maxBarSize={18} />
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
