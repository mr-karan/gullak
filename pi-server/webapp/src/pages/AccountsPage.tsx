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
      <PageHeader title="Accounts" subtitle="A plain read of where your money sits today." />

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

          <div className="grid gap-6 lg:grid-cols-2">
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

// --- Net-worth hero: the figure owns the fold ------------------------------
function NetWorthHero({
  netWorth,
  notDeployed,
  cashSumCents,
}: {
  netWorth: import("@/lib/types").NetWorth | undefined;
  notDeployed: boolean;
  cashSumCents: number;
}) {
  const hasInvestments = Boolean(netWorth && netWorth.investedInvestedCents > 0);
  const headlineCents = netWorth && !notDeployed ? netWorth.totalCents : cashSumCents;
  const cashCents = netWorth && !notDeployed ? netWorth.cashCents : cashSumCents;
  const pnlPct = netWorth && netWorth.investedInvestedCents
    ? (netWorth.investedPnlCents / netWorth.investedInvestedCents) * 100
    : 0;

  return (
    <Card className="overflow-hidden">
      <div className="p-6 sm:p-8">
        <p className="text-sm text-ink-2">Net worth</p>
        <p className="mt-1.5 text-5xl font-[650] tracking-tight tnum text-ink sm:text-6xl">
          {fmtCentsSigned(headlineCents)}
        </p>
        {hasInvestments && netWorth?.lastImportAt ? (
          <p className="mt-2 text-xs text-ink-2">
            Holdings as of the {fmtEpochDate(netWorth.lastImportAt)} import — prices aren't live.
          </p>
        ) : (
          <p className="mt-2 text-xs text-ink-2">Liquid cash across your accounts.</p>
        )}
      </div>

      {hasInvestments && netWorth ? (
        <div className="grid grid-cols-3 border-t border-rule">
          <HeroCell label="Cash" valueCents={cashCents} />
          <HeroCell label="Invested" valueCents={netWorth.investedCurrentCents} border />
          <HeroCell
            label="P&L"
            valueCents={netWorth.investedPnlCents}
            note={fmtPct(pnlPct)}
            tone={netWorth.investedPnlCents < 0 ? "neg" : "pos"}
            border
          />
        </div>
      ) : null}
    </Card>
  );
}

function HeroCell({
  label,
  valueCents,
  note,
  tone,
  border,
}: {
  label: string;
  valueCents: number;
  note?: string;
  tone?: "pos" | "neg";
  border?: boolean;
}) {
  return (
    <div className={cn("px-6 py-4", border && "border-l border-rule")}>
      <p className="text-xs text-ink-2">{label}</p>
      <p
        className={cn(
          "mt-1 text-lg font-[620] tnum tracking-tight",
          tone === "pos" && "text-pos",
          tone === "neg" && "text-neg",
          !tone && "text-ink",
        )}
      >
        {fmtCentsSigned(valueCents)}
      </p>
      {note ? (
        <p className={cn("text-xs tnum", tone === "neg" ? "text-neg" : "text-pos")}>{note}</p>
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
        <h2 className="font-display text-lg tracking-tight text-ink">Cash this month</h2>
        <span className="text-xs text-ink-2">{monthTitle()}</span>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-16 w-full" />
      ) : (
        <div className="mt-4 grid grid-cols-3 gap-4">
          <FlowCell label="In" valueCents={incomeCents} tone="pos" />
          <FlowCell label="Out" valueCents={Math.abs(expenseCents)} tone="neg" />
          <FlowCell label="Net" valueCents={netCents} tone={netCents < 0 ? "neg" : "pos"} signed />
        </div>
      )}
    </Card>
  );
}

function FlowCell({
  label,
  valueCents,
  tone,
  signed,
}: {
  label: string;
  valueCents: number;
  tone: "pos" | "neg";
  signed?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-ink-2">{label}</p>
      {/* All three cells use the same full 2dp format — mixing compact (₹1.5L)
          and full (₹1,39,632.00) in one row reads as inconsistent. */}
      <p className={cn("mt-1 text-lg font-[620] tnum tracking-tight", tone === "pos" ? "text-pos" : "text-neg")}>
        {fmtCentsSigned(signed ? valueCents : Math.abs(valueCents))}
      </p>
    </div>
  );
}

// --- Balances list ---------------------------------------------------------
function BalancesCard({
  balances,
  onReconcile,
}: {
  balances: (import("@/lib/types").Account & { balanceCents: number })[];
  onReconcile: (account: import("@/lib/types").Account) => void;
}) {
  return (
    <Card className="p-5">
      <h2 className="font-display text-lg tracking-tight text-ink">Balances</h2>
      {balances.length === 0 ? (
        <CenterNote>No accounts yet.</CenterNote>
      ) : (
        <ul className="mt-3 flex flex-col">
          {balances.map((a) => (
            <li key={a.id} className="group -mx-2 flex items-center gap-1 rounded-md px-2 transition-colors hover:bg-paper-3">
              <Link
                to={`/transactions?accountId=${encodeURIComponent(a.id)}`}
                className="flex min-w-0 flex-1 items-center justify-between gap-3 py-2.5 focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{a.name}</span>
                  {/* "credit_card" → "Credit card" */}
                  <span className="block text-xs text-ink-2">
                    {a.kind.charAt(0).toUpperCase() + a.kind.slice(1).replaceAll("_", " ")}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span
                    className={cn(
                      "text-sm font-[620] tnum tracking-tight",
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
                className="flex size-7 shrink-0 items-center justify-center rounded text-ink-2 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <Scale className="size-4" />
              </button>
            </li>
          ))}
        </ul>
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
  rows: import("@/lib/types").Transaction[];
  accountName: (id: string) => string;
  categoryName: (id: string | null) => string | null;
  loading: boolean;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-lg tracking-tight text-ink">Recent activity</h2>
        <Link
          to="/transactions"
          className="text-sm text-ink-2 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring rounded"
        >
          All transactions
        </Link>
      </div>
      {loading ? (
        <Skeleton className="mt-4 h-40 w-full" />
      ) : rows.length === 0 ? (
        <CenterNote>Nothing logged this month yet.</CenterNote>
      ) : (
        <ul className="mt-3 flex flex-col">
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
                <span
                  className={cn(
                    "shrink-0 text-sm font-[620] tnum tracking-tight",
                    t.amountCents < 0 ? "text-neg" : "text-pos",
                  )}
                >
                  {fmtCentsSigned(t.amountCents)}
                </span>
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
        <Skeleton className="h-40 w-full rounded-lg" />
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
