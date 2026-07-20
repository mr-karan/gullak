import { Fragment, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Scale } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtCentsSigned, fmtDayMonth, fmtEpochDate, fmtPct } from "@/lib/money";
import { currentMonthRange, monthTitle } from "@/lib/dates";
import { useAccounts } from "@/api/accounts";
import { useCategories } from "@/api/categories";
import { useNetWorth } from "@/api/networth";
import { useAccountSummaries, useSummary } from "@/api/summary";
import { useTransactions } from "@/api/transactions";
import { useConnection } from "@/hooks/useConnection";
import { PageHeader } from "@/components/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { ReconcileDialog } from "./accounts/ReconcileDialog";
import type { Account, NetWorth, Transaction } from "@/lib/types";

// ===========================================================================
// Accounts — a dense, operational "cockpit", not a stack of soft cards.
// Reference implementation for the redesign: flat hairline PANELS, real TABLES
// with column headers + grouped rows + right-aligned tabular money, an
// instrument summary bar, and traffic-light state doing real work. Everything
// below (Panel, Th/Td rhythm, group rows, the instrument bar, the pill) is the
// shared language the other views adopt.
// ===========================================================================

type Tone = "pos" | "neg" | "warn" | "brand" | "neutral";

/** A tinted status pill — money state that reads at a glance. */
function Pill({
  tone,
  className,
  children,
}: {
  tone: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  const tones: Record<Tone, string> = {
    pos: "bg-pill-pos-bg text-pill-pos-ink",
    neg: "bg-pill-neg-bg text-pill-neg-ink",
    warn: "bg-pill-warn-bg text-pill-warn-ink",
    brand: "bg-pill-brand-bg text-pill-brand-ink",
    neutral: "bg-paper-3 text-ink-2",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** A flat, hairline-bordered section. Squared, edge-defined — not a floating
    rounded card. Header is an uppercase tracked label + optional right slot. */
function Panel({
  title,
  right,
  children,
  className,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-rule bg-card", className)}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
          {title ? (
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-2">{title}</h2>
          ) : (
            <span />
          )}
          {right}
        </header>
      )}
      {children}
    </section>
  );
}

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

// ---------------------------------------------------------------------------

export function AccountsPage() {
  const { connected, openDialog } = useConnection();
  const range = useMemo(() => currentMonthRange(), []);
  const [reconcileTarget, setReconcileTarget] = useState<{ id: string; name: string } | null>(null);

  const accountsQ = useAccounts(connected);
  const categoriesQ = useCategories(connected);
  const netWorthQ = useNetWorth(connected);
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

  if (!connected) {
    return (
      <>
        <PageHeader title="Accounts" />
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
      <PageHeader title="Accounts" subtitle="Where your money sits today." />

      {accountsQ.isError ? (
        <ErrorState message={accountsQ.error?.message} onRetry={() => void accountsQ.refetch()} />
      ) : loading ? (
        <AccountsSkeleton />
      ) : (
        <div className="flex flex-col gap-4">
          <InstrumentBar
            netWorth={netWorthQ.data}
            notDeployed={netWorthQ.notDeployed}
            cashSumCents={cashSumCents}
          />

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

          <RecentRegister
            rows={recent}
            accountName={accountName}
            categoryName={categoryName}
            loading={txnQ.isLoading}
          />
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

// --- Instrument bar: the wealth readout as a divided stat panel ------------
function InstrumentBar({
  netWorth,
  notDeployed,
  cashSumCents,
}: {
  netWorth: NetWorth | undefined;
  notDeployed: boolean;
  cashSumCents: number;
}) {
  const hasInvestments = Boolean(netWorth && netWorth.investedInvestedCents > 0);
  const headlineCents = netWorth && !notDeployed ? netWorth.totalCents : cashSumCents;
  const cashCents = netWorth && !notDeployed ? netWorth.cashCents : cashSumCents;
  const pnlCents = netWorth?.investedPnlCents ?? 0;
  const pnlPct =
    netWorth && netWorth.investedInvestedCents
      ? (netWorth.investedPnlCents / netWorth.investedInvestedCents) * 100
      : 0;

  return (
    <section className="overflow-hidden rounded-xl border border-rule bg-card">
      {/* A thin indigo cap — the one confident brand touch, structural not loud. */}
      <div className="h-1 bg-brand" aria-hidden="true" />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-5 py-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-2">Net worth</p>
          <p className="mt-0.5 font-display text-[2.5rem] font-bold leading-none tracking-tight tabular-nums text-ink sm:text-5xl">
            {fmtCentsSigned(headlineCents)}
          </p>
        </div>
        {hasInvestments ? (
          <Pill tone={pnlCents < 0 ? "neg" : "pos"} className="px-2.5 py-1 text-sm">
            {fmtPct(pnlPct)} all-time
          </Pill>
        ) : null}
      </div>
      {hasInvestments && netWorth ? (
        <>
          <div className="grid grid-cols-3 divide-x divide-rule border-t border-rule">
            <StatCell label="Cash" valueCents={cashCents} />
            <StatCell label="Invested" valueCents={netWorth.investedCurrentCents} />
            <StatCell label="Unrealised P&L" valueCents={pnlCents} tone={pnlCents < 0 ? "neg" : "pos"} />
          </div>
          {netWorth.lastImportAt ? (
            <p className="border-t border-rule px-5 py-2 text-xs text-ink-2">
              Holdings as of the {fmtEpochDate(netWorth.lastImportAt)} import — prices aren't live.
            </p>
          ) : null}
        </>
      ) : (
        <p className="border-t border-rule px-5 py-2 text-xs text-ink-2">
          Liquid cash across your accounts.
        </p>
      )}
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
    <div className="min-w-0 px-5 py-3">
      <p className="truncate text-[11px] font-medium uppercase tracking-wider text-ink-2">{label}</p>
      <p
        className={cn(
          "mt-0.5 truncate text-lg font-semibold tracking-tight tabular-nums",
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
              <th className="hidden px-4 py-2 text-right font-medium tabular-nums sm:table-cell">
                Balance
              </th>
              <th className="px-4 py-2 text-right font-medium tabular-nums sm:hidden">Balance</th>
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
    <Panel
      title="This month"
      right={<span className="text-xs text-ink-2">{monthTitle()}</span>}
    >
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
      <Skeleton className="h-36 w-full rounded-xl" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-52 w-full rounded-xl" />
      </div>
      <Skeleton className="h-72 w-full rounded-xl" />
    </div>
  );
}
