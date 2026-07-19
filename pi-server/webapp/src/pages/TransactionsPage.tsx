import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { SlidersHorizontal } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtCentsSigned } from "@/lib/money";
import { useAccounts } from "@/api/accounts";
import { useCategories, useCategoryGroups } from "@/api/categories";
import { useSummary } from "@/api/summary";
import { useTransactions } from "@/api/transactions";
import { useConnection } from "@/hooks/useConnection";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { EmptyState, ErrorState } from "@/components/states";

import { FilterControls } from "./transactions/FilterControls";
import { RegisterList } from "./transactions/RegisterList";
import {
  buildCategoryGroups,
  groupByDate,
  isRangeKey,
  matchesFilters,
  rangeToDates,
  type RangeKey,
} from "./transactions/filters";

export function TransactionsPage() {
  const { connected, openDialog } = useConnection();
  const isMobile = useMediaQuery("(max-width: 639px)");

  // --- URL-reflected state (account + range survive deep links / reload) ----
  const [searchParams, setSearchParams] = useSearchParams();
  const rawRange = searchParams.get("range");
  const rangeKey: RangeKey = isRangeKey(rawRange) ? rawRange : "month";
  const customStart = searchParams.get("start") ?? "";
  const customEnd = searchParams.get("end") ?? "";
  const accountId = searchParams.get("accountId");
  const uncategorizedOnly = searchParams.get("uncat") === "1";
  const scoped = accountId != null;

  function patchParams(mut: (p: URLSearchParams) => void) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        mut(next);
        return next;
      },
      { replace: true },
    );
  }

  const setRange = (key: RangeKey) =>
    patchParams((p) => {
      if (key === "month") p.delete("range");
      else p.set("range", key);
      if (key !== "custom") {
        p.delete("start");
        p.delete("end");
      }
    });
  const setCustom = (which: "start" | "end", value: string) =>
    patchParams((p) => (value ? p.set(which, value) : p.delete(which)));
  const setAccount = (id: string | null) =>
    patchParams((p) => (id ? p.set("accountId", id) : p.delete("accountId")));
  const toggleUncategorized = () =>
    patchParams((p) => (uncategorizedOnly ? p.delete("uncat") : p.set("uncat", "1")));

  // --- Client-only filters ---------------------------------------------------
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // --- Data ------------------------------------------------------------------
  const range = useMemo(
    () => rangeToDates(rangeKey, customStart, customEnd),
    [rangeKey, customStart, customEnd],
  );
  const accountsQ = useAccounts(connected);
  const categoriesQ = useCategories(connected);
  const groupsQ = useCategoryGroups(connected);
  const txnQ = useTransactions(range, accountId ?? undefined, connected);
  const scopedSummaryQ = useSummary(undefined, accountId ?? undefined, connected && scoped);

  const accounts = accountsQ.data ?? [];
  const activeAccounts = useMemo(
    () => accounts.filter((a) => !a.archived).sort((a, b) => a.sortOrder - b.sortOrder),
    [accounts],
  );
  const categoryGroups = useMemo(
    () => buildCategoryGroups(categoriesQ.data ?? [], groupsQ.data ?? []),
    [categoriesQ.data, groupsQ.data],
  );
  const accountName = useMemo(() => {
    const map = new Map(accounts.map((a) => [a.id, a.name]));
    return (id: string) => map.get(id) ?? "";
  }, [accounts]);
  const categoryName = useMemo(() => {
    const map = new Map((categoriesQ.data ?? []).map((c) => [c.id, c.name]));
    return (id: string | null) => (id ? (map.get(id) ?? "Uncategorized") : null);
  }, [categoriesQ.data]);

  const rows = txnQ.data?.transactions ?? [];
  const filtered = useMemo(
    () => rows.filter((t) => matchesFilters(t, { categoryId, uncategorizedOnly, search })),
    [rows, categoryId, uncategorizedOnly, search],
  );
  const grouped = useMemo(() => groupByDate(filtered), [filtered]);

  const scopedAccount = scoped ? accounts.find((a) => a.id === accountId) : undefined;
  const scopedBalanceCents = scopedAccount
    ? scopedAccount.openingBalanceCents + (scopedSummaryQ.data?.netCents ?? 0)
    : 0;

  const activeCount =
    (rangeKey !== "month" ? 1 : 0) +
    (accountId ? 1 : 0) +
    (categoryId ? 1 : 0) +
    (uncategorizedOnly ? 1 : 0) +
    (search.trim() ? 1 : 0);

  // --- Sticky offset so date headers park below the filter bar --------------
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [toolbarH, setToolbarH] = useState(0);
  useLayoutEffect(() => {
    const el = toolbarRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => setToolbarH(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile, rangeKey]);

  const [filtersOpen, setFiltersOpen] = useState(false);

  if (!connected) {
    return (
      <>
        <PageHeader title="Transactions" />
        <EmptyState
          title="Not connected."
          hint="Add your pi-server API key to load your register."
          action={{ label: "Connect", onClick: openDialog }}
        />
      </>
    );
  }

  const controlProps = {
    rangeKey,
    customStart,
    customEnd,
    accountId,
    categoryId,
    uncategorizedOnly,
    search: searchInput,
    accounts: activeAccounts,
    categoryGroups,
    showAccount: true,
    onRange: setRange,
    onCustom: setCustom,
    onAccount: setAccount,
    onCategory: setCategoryId,
    onToggleUncategorized: toggleUncategorized,
    onSearch: setSearchInput,
  };

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle={scoped ? undefined : "Your register — every logged movement."}
      />

      {scoped ? (
        <div className="mb-5 flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-display text-lg tracking-tight text-ink">
              {scopedAccount?.name ?? "Account"}
            </p>
            <p className="text-xs text-ink-2">Account register</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-ink-2">Balance</p>
            <p
              className={cn(
                "text-lg font-[620] tnum tracking-tight",
                scopedBalanceCents < 0 ? "text-neg" : "text-ink",
              )}
            >
              {fmtCentsSigned(scopedBalanceCents)}
            </p>
          </div>
        </div>
      ) : null}

      {/* Sticky filter toolbar */}
      <div
        ref={toolbarRef}
        className="sticky top-0 z-20 -mx-5 border-b border-rule bg-paper/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8"
      >
        {isMobile ? (
          <div className="flex items-center justify-between gap-3">
            <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
              <SheetTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="gap-2">
                  <SlidersHorizontal className="size-4" />
                  Filters
                  {activeCount > 0 ? (
                    <span className="tnum text-ink-2">({activeCount})</span>
                  ) : null}
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[85%] max-w-sm overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                  <SheetDescription>Narrow the register.</SheetDescription>
                </SheetHeader>
                <FilterControls {...controlProps} layout="sheet" />
              </SheetContent>
            </Sheet>
            <span className="text-xs text-ink-2">
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
            </span>
          </div>
        ) : (
          <FilterControls {...controlProps} layout="bar" />
        )}
      </div>

      {txnQ.data?.capped ? (
        <p className="mt-3 text-xs text-ink-2">Showing first 1000 — narrow the range.</p>
      ) : null}

      <div className="mt-2">
        {txnQ.isError ? (
          <ErrorState message={txnQ.error?.message} onRetry={() => void txnQ.refetch()} />
        ) : txnQ.isLoading ? (
          <RegisterSkeleton />
        ) : grouped.length === 0 ? (
          <EmptyState
            title={rows.length === 0 ? "Nothing logged in this range." : "No matches."}
            hint={
              rows.length === 0
                ? "Try a wider period, or log an expense from your phone."
                : "Loosen a filter to see more."
            }
          />
        ) : (
          <RegisterList
            groups={grouped}
            categoryGroups={categoryGroups}
            categoryName={categoryName}
            accountName={accountName}
            showAccount={!scoped}
            stickyTop={toolbarH}
          />
        )}
      </div>
    </>
  );
}

function RegisterSkeleton() {
  return (
    <div className="flex flex-col gap-2 py-2">
      {Array.from({ length: 10 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}
