import { useMemo, useState } from "react";
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
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CenterNote, EmptyState, ErrorState } from "@/components/states";
import { ReconcileDialog } from "./accounts/ReconcileDialog";
import type { Account, NetWorth, Transaction } from "@/lib/types";

// ---------------------------------------------------------------------------
// Shared bits: the money PILL (YNAB "Available" treatment) + kind grouping.
// ---------------------------------------------------------------------------

type Tone = "pos" | "neg" | "warn" | "brand" | "neutral";

/** A tinted status pill — the signature "reads-at-a-glance" money chip. */
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
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tnum tabular-nums",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

type GroupKey = "cash" | "credit" | "investment";
const GROUP_ORDER: GroupKey[] = ["cash", "credit", "investment"];
const GROUP_LABEL: Record<GroupKey, string> = {
  cash: "Cash",
  credit: "Credit",
  investment: "Investment",
};

/** Fold the free-text account.kind into the three YNAB-style buckets. */
function groupOf(kind: string): GroupKey {
  const k = kind.toLowerCase();
  if (["credit_card", "credit", "loan", "liability"].includes(k)) return "credit";
  if (["investment", "tracking", "brokerage", "demat", "mutual_fund", "equity"].includes(k))
    return "investment";
  return "cash"; // checking, savings, cash, wallet, upi, bank, default
}

/** "credit_card" → "Credit card". */
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
    return (id: string | null) => (id ? (map.get(id) ?? "Uncategorized") : null);
  }, [categoriesQ.data]);

  const recent = (txnQ.data?.transactions ?? []).slice(0, 8);

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
  const error = accountsQ.isError;

  return (
    <>
      <PageHeader title="Accounts" subtitle="Where your money sits today, at a glance." />

      {error ? (
        <ErrorState message={accountsQ.error?.message} onRetry={() => void accountsQ.refetch()} />
      ) : loading ? (
        <AccountsSkeleton />
      ) : (
        <div className="flex flex-col gap-6">
          <NetWorthHero
            netWorth={netWorthQ.data}
            notDeployed={netWorthQ.notDeployed}
            cashSumCents={cashSumCents}
          />

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <CashCard
              incomeCents={monthQ.data?.incomeCents ?? 0}
              expenseCents={monthQ.data?.expenseCents ?? 0}
              netCents={monthQ.data?.netCents ?? 0}
              loading={monthQ.isLoading}
            />
            <BalancesCard
              balances={balances}
              onReconcile={(a) => setReconcileTarget({ id: a.id, name: a.name })}
            />
          </div>

          <RecentCard
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

// --- Net-worth hero: a confident indigo band owns the fold -----------------
function NetWorthHero({
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
    <Card className="overflow-hidden p-0">
      {/* The indigo band — the app's boldest surface. White text, AA. */}
      <div className="bg-brand px-6 py-6 text-brand-ink sm:px-8 sm:py-7">
        <p className="text-sm font-medium text-brand-ink/75">Net worth</p>
        <p className="mt-1 text-4xl font-bold tracking-tight tnum sm:text-5xl">
          {fmtCentsSigned(headlineCents)}
        </p>
        {hasInvestments && netWorth?.lastImportAt ? (
          <p className="mt-2 text-xs text-brand-ink/70">
            Holdings as of the {fmtEpochDate(netWorth.lastImportAt)} import — prices aren't live.
          </p>
        ) : (
          <p className="mt-2 text-xs text-brand-ink/70">Liquid cash across your accounts.</p>
        )}
      </div>

      {hasInvestments && netWorth ? (
        <div className="grid grid-cols-3 divide-x divide-rule bg-card">
          <HeroCell label="Cash" valueCents={cashCents} />
          <HeroCell label="Invested" valueCents={netWorth.investedCurrentCents} />
          <HeroCell
            label="P&L"
            valueCents={pnlCents}
            tone={pnlCents < 0 ? "neg" : "pos"}
            pct={fmtPct(pnlPct)}
          />
        </div>
      ) : null}
    </Card>
  );
}

function HeroCell({
  label,
  valueCents,
  tone,
  pct,
}: {
  label: string;
  valueCents: number;
  tone?: "pos" | "neg";
  pct?: string;
}) {
  return (
    <div className="min-w-0 px-4 py-3.5 sm:px-6">
      <p className="text-xs text-ink-2">{label}</p>
      <p
        className={cn(
          "mt-1 truncate text-base font-semibold tracking-tight tnum sm:text-lg",
          tone === "pos" && "text-pos",
          tone === "neg" && "text-neg",
          !tone && "text-ink",
        )}
      >
        {fmtCentsSigned(valueCents)}
      </p>
      {pct ? (
        <Pill tone={tone === "neg" ? "neg" : "pos"} className="mt-1.5">
          {pct}
        </Pill>
      ) : null}
    </div>
  );
}

// --- This-month cash flow --------------------------------------------------
function CashCard({
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
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg text-ink">Cash this month</h2>
        <span className="text-xs text-ink-2">{monthTitle()}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-16 w-full" />
      ) : (
        <>
          <div className="mt-4 grid grid-cols-3 gap-4">
            <FlowCell label="In" valueCents={incomeCents} tone="pos" />
            <FlowCell label="Out" valueCents={Math.abs(expenseCents)} tone="neg" />
            {/* Net reads as a coloured pill — the at-a-glance verdict on the month. */}
            <div>
              <p className="text-xs text-ink-2">Net</p>
              <Pill tone={netCents < 0 ? "neg" : "pos"} className="mt-1.5 px-2.5 py-1 text-sm">
                {fmtCentsSigned(netCents)}
              </Pill>
            </div>
          </div>
          <CashFlowBar incomeCents={incomeCents} expenseCents={expenseCents} />
        </>
      )}
    </Card>
  );
}

// A single proportion bar — how much of the month's income has gone back out —
// so the card carries a visual, not dead space. Green in, red out, on a rail.
function CashFlowBar({
  incomeCents,
  expenseCents,
}: {
  incomeCents: number;
  expenseCents: number;
}) {
  const out = Math.abs(expenseCents);
  const inflow = Math.max(incomeCents, 0);
  const spentPct = inflow > 0 ? Math.min(100, Math.round((out / inflow) * 100)) : out > 0 ? 100 : 0;
  return (
    <div className="mt-6">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink-2">Spent this month</span>
        <span className="font-medium tnum text-ink">
          {spentPct}% <span className="text-ink-2">of what came in</span>
        </span>
      </div>
      <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-paper-3">
        <div
          className="h-full rounded-full bg-neg"
          style={{ width: `${spentPct}%` }}
          aria-hidden="true"
        />
      </div>
      <p className="mt-2 text-xs text-ink-2">
        {spentPct <= 100
          ? `You kept ${100 - spentPct}% of this month's income.`
          : "You spent more than came in this month."}
      </p>
    </div>
  );
}

function FlowCell({
  label,
  valueCents,
  tone,
}: {
  label: string;
  valueCents: number;
  tone: "pos" | "neg";
}) {
  return (
    <div>
      <p className="text-xs text-ink-2">{label}</p>
      {/* Full 2dp everywhere — mixing compact (₹1.5L) and full reads inconsistent. */}
      <p
        className={cn(
          "mt-1 text-lg font-semibold tracking-tight tnum",
          tone === "pos" ? "text-pos" : "text-neg",
        )}
      >
        {fmtCentsSigned(Math.abs(valueCents))}
      </p>
    </div>
  );
}

// --- Balances: a GROUPED, dense list (the YNAB-flavoured centrepiece) ------
function BalancesCard({
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
    <Card className="overflow-hidden p-0">
      <div className="flex items-baseline justify-between px-5 pb-3 pt-5">
        <h2 className="font-display text-lg text-ink">Balances</h2>
        <span className="text-xs text-ink-2">
          {balances.length} {balances.length === 1 ? "account" : "accounts"}
        </span>
      </div>

      {groups.length === 0 ? (
        <div className="px-5 pb-5">
          <CenterNote>No accounts yet.</CenterNote>
        </div>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            {/* Group header band — uppercase label with the indigo accent tick,
                and the group's subtotal (red when it nets negative). */}
            <div className="flex items-center justify-between border-y border-rule bg-paper-2 px-5 py-2">
              <span className="flex items-center gap-2">
                <span className="h-3.5 w-1 rounded-full bg-brand" />
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-2">
                  {GROUP_LABEL[g.key]}
                </span>
              </span>
              <span
                className={cn(
                  "text-xs font-semibold tracking-tight tnum",
                  g.subtotalCents < 0 ? "text-neg" : "text-ink-2",
                )}
              >
                {fmtCentsSigned(g.subtotalCents)}
              </span>
            </div>

            <ul className="flex flex-col">
              {g.rows.map((a) => (
                <li
                  key={a.id}
                  className="group flex items-center gap-1 border-b border-rule px-2 transition-colors last:border-b-0 hover:bg-paper-2"
                >
                  <Link
                    to={`/transactions?accountId=${encodeURIComponent(a.id)}`}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded px-3 py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{a.name}</span>
                      <span className="block truncate text-xs text-ink-2">{prettyKind(a.kind)}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "text-sm font-semibold tracking-tight tnum",
                          a.balanceCents < 0 ? "text-neg" : "text-ink",
                        )}
                      >
                        {fmtCentsSigned(a.balanceCents)}
                      </span>
                      <ChevronRight className="size-4 text-ink-2 transition-colors group-hover:text-ink" />
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => onReconcile(a)}
                    aria-label={`Reconcile ${a.name}`}
                    title="Reconcile against your bank balance"
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-paper-3 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Scale className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </Card>
  );
}

// --- Recent activity -------------------------------------------------------
function RecentCard({
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
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg text-ink">Recent activity</h2>
        <Link
          to="/transactions"
          className="rounded text-sm text-brand transition-colors hover:text-brand-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          All transactions
        </Link>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-40 w-full" />
      ) : rows.length === 0 ? (
        <CenterNote>Nothing logged this month yet.</CenterNote>
      ) : (
        <ul className="mt-2 flex flex-col">
          {rows.map((t) => {
            const cat = categoryName(t.categoryId);
            return (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 border-t border-rule py-2.5 first:border-t-0"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink">{t.payeeName || "Unknown"}</p>
                  <p className="truncate text-xs text-ink-2">
                    {fmtDayMonth(t.date)} · {accountName(t.accountId)}
                    {cat ? ` · ${cat}` : ""}
                  </p>
                </div>
                <Pill tone={t.amountCents < 0 ? "neg" : "pos"} className="shrink-0">
                  {fmtCentsSigned(t.amountCents)}
                </Pill>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

// --- Skeleton --------------------------------------------------------------
function AccountsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-44 w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-40 w-full rounded-lg" />
        <Skeleton className="h-56 w-full rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
