import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { MONTHS_SHORT } from "@/lib/dates";
import { fmtCompact } from "@/lib/money";
import { useNetWorthHistory } from "@/api/insights";
import { Panel } from "@/components/Panel";
import { Skeleton } from "@/components/ui/skeleton";

function monthLabel(ym: string): string {
  const m = Number(ym.split("-")[1]);
  return MONTHS_SHORT[m - 1] ?? ym;
}

// Net worth (cash + latest-month portfolio) as a single line over 12 months.
// Investments have no history, so only the final point includes portfolio
// value — the caption says so plainly rather than faking a flat line backward.
export function NetWorthHistorySection({ enabled }: { enabled: boolean }) {
  const q = useNetWorthHistory(12, enabled);
  if (q.notDeployed) return null;

  const loading = q.isLoading;
  const data = (q.data?.history ?? []).map((p) => ({
    month: monthLabel(p.month),
    total: p.totalCents,
  }));
  if (!loading && data.length === 0) return null;

  return (
    <Panel title="Net worth over time">
      <div className="p-4">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          <>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
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
                  <Tooltip cursor={{ stroke: "var(--rule)" }} content={<NetWorthTooltip />} />
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke="var(--brand)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-3 text-xs text-ink-2">
              Investments aren&rsquo;t tracked historically — only the latest month includes
              portfolio value; earlier months reflect cash alone.
            </p>
          </>
        )}
      </div>
    </Panel>
  );
}

function NetWorthTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const total = payload[0]?.value ?? 0;
  return (
    <div className="rounded-md border border-rule bg-card px-3 py-2 text-xs">
      <p className="font-medium text-ink">{label}</p>
      <p className="tnum text-ink">{fmtCompact(total)}</p>
    </div>
  );
}
