import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Scale } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtCentsSigned, fmtDayMonth, fmtEpochDate, fmtPct } from "@/lib/money";
import { currentMonthRange, monthTitle } from "@/lib/dates";
import { useAccounts } from "@/api/accounts";
import { useCategories } from "@/api/categories";
import { useNetWorth } from "@/api/networth";
import { useNetWorthHistory } from "@/api/insights";
import { useAccountSummaries, useSummary } from "@/api/summary";
import { useTransactions } from "@/api/transactions";
import { useConnection } from "@/hooks/useConnection";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { ReconcileDialog } from "./accounts/ReconcileDialog";
import type { Account, NetWorth, Transaction } from "@/lib/types";

// ===========================================================================
// Overview — the "Vault" proof. A bold DARK-NATIVE hero: the net-worth figure
// huge in Clash Display over a violet glow, with an integrated net-worth
// sparkline; a divided stat rail; then the grouped accounts table, monthly
// cash-flow rail, and recent register — all restyled to the Vault palette via
// shared tokens. Every data hook, route and behaviour is preserved.
// ===========================================================================

type GroupKey = "cash" | "credit" | "investment";
const GROUP_ORDER: GroupKey[] = ["cash", "credit", "investment"];
const GROUP_LABEL: Record<GroupKey, string> = {
  cash: "Cash",
  credit: "Credit",
  investment: "Investment",
};

function groupOf(kind: string): GroupKey {
  const k = kind.toLowerCase();
  if (["credit_card", "credit", "loan", "liability"].includes(k)) return "credit";
  if (["investment", "tracking", "brokerage", "demat", "mutual_fund", "equity"].includes(k))
    return "investment";
  return "cash";
}

function prettyKind(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1).replaceAll("_", " ");
}

// --- Motion helpers --------------------------------------------------------

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** Count-up from 0 to `target` (~600ms ease-out). Renders the final value
    instantly under prefers-reduced-motion. */
function useCountUp(target: number, duration = 600): number {
  const reduced = usePrefersReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setValue(Math.round(target * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration, reduced]);

  return value;
}

/** A quiet staggered fade + rise on mount. Reduced-motion is handled globally
    (durations + delays collapsed in index.css). */
function Reveal({
  delay = 0,
  className,
  children,
}: {
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("vault-reveal", className)} style={{ animationDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function AccountsPage() {
  const { connected, openDialog } = useConnection();
  const range = useMemo(() => currentMonthRange(), []);
  const [reconcileTarget, setReconcileTarget] = useState<{ id: string; name: string } | null>(null);

  const accountsQ = useAccounts(connected);
  const categoriesQ = useCategories(connected);
  const netWorthQ = useNetWorth(connected);
  const historyQ = useNetWorthHistory(12, connected);
  const monthQ = useSummary(range, undefined, connected);
  const txnQ = useTransactions(range, undefined, connected);

  const accounts = accountsQ.data ?? [];
  const active = useMemo(
    () => accounts.filter((a) => !a.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    [accounts],
  );
  const summaries = useAccountSummaries(
    active.map((a) => a.id),
    connected && active.length > 0,
  );

  const balances = useMemo(
    () =>
      active.map((a, i) => ({
        ...a,
        balanceCents: a.openingBalanceCents + (summaries[i]?.data?.netCents ?? 0),
      })),
    [active, summaries],
  );
  const cashSumCents = balances.reduce((s, a) => s + a.balanceCents, 0);

  const accountName = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a.name]));
    return (id: string) => map.get(id) ?? "";
  }, [accounts]);
  const categoryName = useMemo(() => {
    const map = new Map((categoriesQ.data ?? []).map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "Uncategorized") : "—");
  }, [categoriesQ.data]);

  const recent = (txnQ.data?.transactions ?? []).slice(0, 10);
  const history = historyQ.data?.history ?? [];

  if (!connected) {
    return (
      <>
        <PageHeader title="Overview" />
        <EmptyState
          title="Not connected."
          hint="Add your pi-server API key to load balances and activity."
          action={{ label: "Connect", onClick: openDialog }}
        />
      </>
    );
  }

  const loading = accountsQ.isLoading || netWorthQ.isLoading;

  return (
    <>
      <PageHeader title="Overview" subtitle="Where your money sits today." />

      {accountsQ.isError ? (
        <ErrorState message={accountsQ.error?.message} onRetry={() => void accountsQ.refetch()} />
      ) : loading ? (
        <AccountsSkeleton />
      ) : (
        <div className="flex flex-col gap-4">
          <Reveal delay={0}>
            <NetWorthHero
              netWorth={netWorthQ.data}
              notDeployed={netWorthQ.notDeployed}
              cashSumCents={cashSumCents}
              history={history}
            />
          </Reveal>

          <Reveal delay={60}>
            <StatRail
              netWorth={netWorthQ.data}
              notDeployed={netWorthQ.notDeployed}
              cashSumCents={cashSumCents}
            />
          </Reveal>

          <Reveal delay={120}>
            <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
              <AccountsTable
                balances={balances}
                onReconcile={(a) => setReconcileTarget({ id: a.id, name: a.name })}
              />
              <MonthPanel
                incomeCents={monthQ.data?.incomeCents ?? 0}
                expenseCents={monthQ.data?.expenseCents ?? 0}
                netCents={monthQ.data?.netCents ?? 0}
                loading={monthQ.isLoading}
              />
            </div>
          </Reveal>

          <Reveal delay={180}>
            <RecentRegister
              rows={recent}
              accountName={accountName}
              categoryName={categoryName}
              loading={txnQ.isLoading}
            />
          </Reveal>
        </div>
      )}

      <ReconcileDialog
        open={reconcileTarget !== null}
        onOpenChange={(o) => {
          if (!o) setReconcileTarget(null);
        }}
        account={reconcileTarget}
      />
    </>
  );
}

// --- Sparkline: smooth area + line, brand-violet, emphasised endpoint -------
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x} ${pts[0].y}`;
  const tension = 0.18;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) * tension;
    const c1y = p1.y + (p2.y - p0.y) * tension;
    const c2x = p2.x - (p3.x - p1.x) * tension;
    const c2y = p2.y - (p3.y - p1.y) * tension;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function Sparkline({ values }: { values: number[] }) {
  const W = 100;
  const H = 36;
  const pad = 3;
  const n = values.length;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const norm = (v: number) => (v - min) / span;
  const yOf = (v: number) => pad + (1 - norm(v)) * (H - pad * 2);

  const pts = values.map((v, i) => ({ x: n === 1 ? W : (i / (n - 1)) * W, y: yOf(v) }));
  const line = smoothPath(pts);
  const area = `${line} L ${W} ${H} L 0 ${H} Z`;
  const lastTopPct = (yOf(values[n - 1]) / H) * 100;

  return (
    <div className="relative h-full w-full">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-full w-full">
        <defs>
          <linearGradient id="vault-spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" style={{ stopColor: "var(--brand)", stopOpacity: 0.32 }} />
            <stop offset="100%" style={{ stopColor: "var(--brand)", stopOpacity: 0 }} />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#vault-spark-fill)" stroke="none" />
        <path
          d={line}
          fill="none"
          style={{ stroke: "var(--brand)" }}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span
        aria-hidden="true"
        className="absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-card"
        style={{ left: "calc(100% - 5px)", top: `${lastTopPct}%` }}
      />
    </div>
  );
}

// --- Hero: the net-worth readout, the boldest surface ----------------------
function NetWorthHero({
  netWorth,
  notDeployed,
  cashSumCents,
  history,
}: {
  netWorth: NetWorth | undefined;
  notDeployed: boolean;
  cashSumCents: number;
  history: { totalCents: number }[];
}) {
  const hasInvestments = Boolean(netWorth && netWorth.investedInvestedCents > 0);
  const headlineCents = netWorth && !notDeployed ? netWorth.totalCents : cashSumCents;
  const displayCents = useCountUp(headlineCents);

  const pnlCents = netWorth?.investedPnlCents ?? 0;
  const pnlPct =
    netWorth && netWorth.investedInvestedCents
      ? (netWorth.investedPnlCents / netWorth.investedInvestedCents) * 100
      : 0;

  const series = history.map((h) => h.totalCents);
  const hasTrend = series.length >= 2;
  const first = series[0] ?? 0;
  const last = series[series.length - 1] ?? 0;
  const deltaCents = last - first;

  const caption = hasInvestments
    ? netWorth?.lastImportAt
      ? `Holdings as of the ${fmtEpochDate(netWorth.lastImportAt)} import — prices aren't live.`
      : "Cash across your accounts plus tracked holdings."
    : "Liquid cash across your accounts.";

  return (
    <section className="vault-hero-glow relative overflow-hidden rounded-2xl border border-rule">
      {hasTrend ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[46%] min-h-24">
          <Sparkline values={series} />
        </div>
      ) : null}

      <div className="relative px-6 py-7 sm:px-8 sm:py-9">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-2">Net worth</p>

        <div className="mt-2 flex flex-wrap items-end gap-x-4 gap-y-3">
          <p
            className="font-vault-figure leading-[0.9] text-ink"
            style={{ fontSize: "clamp(3.5rem, 9vw, 6rem)" }}
          >
            {fmtCentsSigned(displayCents)}
          </p>

          {hasInvestments ? (
            // Pill = real P&L% (meaningful). Caption carries the absolute 12-mo
            // change — never a first→last% (early cash-only months are ~0 and
            // make the % nonsensical).
            <span className="mb-1.5 inline-flex items-center gap-2">
              <Pill tone={pnlCents < 0 ? "neg" : "pos"} className="px-2.5 py-1 text-sm">
                {fmtPct(pnlPct)}
              </Pill>
              {hasTrend ? (
                <span className="text-xs text-ink-2">
                  {fmtCentsSigned(deltaCents)} · {series.length}-mo
                </span>
              ) : null}
            </span>
          ) : hasTrend ? (
            <span className="mb-1.5 inline-flex items-center gap-2">
              <Pill tone={deltaCents < 0 ? "neg" : "pos"} className="px-2.5 py-1 text-sm">
                {fmtCentsSigned(deltaCents)}
              </Pill>
              <span className="text-xs text-ink-2">{series.length}-mo change</span>
            </span>
          ) : null}
        </div>

        <p className="mt-4 max-w-prose text-xs text-ink-2">{caption}</p>
      </div>
    </section>
  );
}

// --- Stat rail: divided cells beneath the hero -----------------------------
function StatRail({
  netWorth,
  notDeployed,
  cashSumCents,
}: {
  netWorth: NetWorth | undefined;
  notDeployed: boolean;
  cashSumCents: number;
}) {
  const hasInvestments = Boolean(netWorth && netWorth.investedInvestedCents > 0);
  if (!hasInvestments || !netWorth) return null;

  const cashCents = notDeployed ? cashSumCents : netWorth.cashCents;
  const pnlCents = netWorth.investedPnlCents;

  return (
    <section className="overflow-hidden rounded-xl border border-rule bg-card">
      <div className="grid grid-cols-3 divide-x divide-rule">
        <StatCell label="Cash" valueCents={cashCents} />
        <StatCell label="Invested" valueCents={netWorth.investedCurrentCents} />
        <StatCell label="Unrealised P&L" valueCents={pnlCents} tone={pnlCents < 0 ? "neg" : "pos"} />
      </div>
    </section>
  );
}

function StatCell({
  label,
  valueCents,
  tone,
}: {
  label: string;
  valueCents: number;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="min-w-0 px-5 py-3.5">
      <p className="truncate text-[11px] font-medium uppercase tracking-wider text-ink-2">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-lg font-semibold tracking-tight tabular-nums",
          tone === "pos" && "text-pos",
          tone === "neg" && "text-neg",
          !tone && "text-ink",
        )}
      >
        {fmtCentsSigned(valueCents)}
      </p>
    </div>
  );
}

// --- Accounts register: a real grouped table -------------------------------
function AccountsTable({
  balances,
  onReconcile,
}: {
  balances: (Account & { balanceCents: number })[];
  onReconcile: (account: Account) => void;
}) {
  const groups = useMemo(() => {
    const buckets = new Map<GroupKey, (Account & { balanceCents: number })[]>();
    for (const a of balances) {
      const key = groupOf(a.kind);
      const arr = buckets.get(key) ?? [];
      arr.push(a);
      buckets.set(key, arr);
    }
    return GROUP_ORDER.filter((k) => buckets.has(k)).map((key) => {
      const rows = buckets.get(key)!;
      return { key, rows, subtotalCents: rows.reduce((s, a) => s + a.balanceCents, 0) };
    });
  }, [balances]);

  return (
    <Panel
      title="Accounts"
      right={
        <span className="text-xs tabular-nums text-ink-2">
          {balances.length} {balances.length === 1 ? "account" : "accounts"}
        </span>
      }
    >
      {balances.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-2">No accounts yet.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-[11px] uppercase tracking-wider text-ink-2">
              <th className="px-4 py-2 text-left font-medium">Account</th>
              <th className="px-4 py-2 text-right font-medium tabular-nums">Balance</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.key}>
                <tr className="bg-paper-2">
                  <td className="px-4 py-1.5">
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-1 rounded-full bg-brand" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                        {GROUP_LABEL[g.key]}
                      </span>
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-1.5 text-right text-xs font-semibold tabular-nums",
                      g.subtotalCents < 0 ? "text-neg" : "text-ink-2",
                    )}
                  >
                    {fmtCentsSigned(g.subtotalCents)}
                  </td>
                  <td className="bg-paper-2" />
                </tr>
                {g.rows.map((a) => (
                  <tr
                    key={a.id}
                    className="group border-t border-rule/60 transition-colors hover:bg-paper-2/60"
                  >
                    <td className="px-4 py-2.5">
                      <Link
                        to={`/transactions?accountId=${encodeURIComponent(a.id)}`}
                        className="flex items-center gap-1.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink">{a.name}</span>
                          <span className="block truncate text-xs text-ink-2">
                            {prettyKind(a.kind)}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-transparent transition-colors group-hover:text-ink-2" />
                      </Link>
                    </td>
                    <td
                      className={cn(
                        "px-4 py-2.5 text-right font-semibold tabular-nums",
                        a.balanceCents < 0 ? "text-neg" : "text-ink",
                      )}
                    >
                      {fmtCentsSigned(a.balanceCents)}
                    </td>
                    <td className="pr-2">
                      <button
                        type="button"
                        onClick={() => onReconcile(a)}
                        aria-label={`Reconcile ${a.name}`}
                        title="Reconcile against your bank balance"
                        className="flex size-7 items-center justify-center rounded-md text-ink-2 opacity-0 transition hover:bg-paper-3 hover:text-brand focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                      >
                        <Scale className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

// --- This month: compact cash-flow rail ------------------------------------
function MonthPanel({
  incomeCents,
  expenseCents,
  netCents,
  loading,
}: {
  incomeCents: number;
  expenseCents: number;
  netCents: number;
  loading: boolean;
}) {
  const out = Math.abs(expenseCents);
  const inflow = Math.max(incomeCents, 0);
  const spentPct = inflow > 0 ? Math.min(100, Math.round((out / inflow) * 100)) : out > 0 ? 100 : 0;

  return (
    <Panel title="This month" right={<span className="text-xs text-ink-2">{monthTitle()}</span>}>
      {loading ? (
        <Skeleton className="m-4 h-28" />
      ) : (
        <div className="px-4 py-4">
          <dl className="flex flex-col divide-y divide-rule">
            <FlowRow label="Money in" valueCents={incomeCents} tone="pos" />
            <FlowRow label="Money out" valueCents={-out} tone="neg" />
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-sm text-ink-2">Net</dt>
              <dd>
                <Pill tone={netCents < 0 ? "neg" : "pos"} className="px-2.5 py-1 text-sm">
                  {fmtCentsSigned(netCents)}
                </Pill>
              </dd>
            </div>
          </dl>
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-ink-2">Spent of income</span>
              <span className="font-semibold tabular-nums text-ink">{spentPct}%</span>
            </div>
            <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-paper-3">
              <div
                className={cn("h-full rounded-full", spentPct > 100 ? "bg-neg" : "bg-brand")}
                style={{ width: `${Math.min(spentPct, 100)}%` }}
                aria-hidden="true"
              />
            </div>
          </div>
        </div>
      )}
    </Panel>
  );
}

function FlowRow({
  label,
  valueCents,
  tone,
}: {
  label: string;
  valueCents: number;
  tone: "pos" | "neg";
}) {
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className="text-sm text-ink-2">{label}</dt>
      <dd className={cn("font-semibold tabular-nums", tone === "pos" ? "text-pos" : "text-neg")}>
        {fmtCentsSigned(valueCents)}
      </dd>
    </div>
  );
}

// --- Recent activity: a real register table --------------------------------
function RecentRegister({
  rows,
  accountName,
  categoryName,
  loading,
}: {
  rows: Transaction[];
  accountName: (id: string) => string;
  categoryName: (id: string | null) => string | null;
  loading: boolean;
}) {
  return (
    <Panel
      title="Recent activity"
      right={
        <Link
          to="/transactions"
          className="rounded text-xs font-medium text-brand transition-colors hover:text-brand-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          All transactions →
        </Link>
      }
    >
      {loading ? (
        <Skeleton className="m-4 h-40" />
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-ink-2">Nothing logged this month yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-rule text-[11px] uppercase tracking-wider text-ink-2">
                <th className="px-4 py-2 text-left font-medium">Date</th>
                <th className="px-4 py-2 text-left font-medium">Payee</th>
                <th className="hidden px-4 py-2 text-left font-medium sm:table-cell">Category</th>
                <th className="hidden px-4 py-2 text-left font-medium md:table-cell">Account</th>
                <th className="px-4 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.id}
                  className="border-t border-rule/60 transition-colors first:border-t-0 hover:bg-paper-2/60"
                >
                  <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-ink-2">
                    {fmtDayMonth(t.date)}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="block max-w-[22ch] truncate font-medium text-ink">
                      {t.payeeName || "Unknown"}
                    </span>
                    <span className="block truncate text-xs text-ink-2 sm:hidden">
                      {categoryName(t.categoryId)} · {accountName(t.accountId)}
                    </span>
                  </td>
                  <td className="hidden px-4 py-2.5 text-ink-2 sm:table-cell">
                    {categoryName(t.categoryId)}
                  </td>
                  <td className="hidden px-4 py-2.5 text-ink-2 md:table-cell">
                    {accountName(t.accountId)}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums",
                      t.amountCents < 0 ? "text-neg" : "text-pos",
                    )}
                  >
                    {fmtCentsSigned(t.amountCents)}
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

// --- Skeleton --------------------------------------------------------------
function AccountsSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-48 w-full rounded-2xl" />
      <Skeleton className="h-20 w-full rounded-xl" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
