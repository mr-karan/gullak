import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CheckSquare, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { iso } from "@/lib/dates";
import { fmtCentsSigned } from "@/lib/money";
import { useAccounts } from "@/api/accounts";
import { useCategories, useCategoryGroups } from "@/api/categories";
import { useSummary } from "@/api/summary";
import { useGroupTransactions, useTransactions, useUngroup } from "@/api/transactions";
import { useConnection } from "@/hooks/useConnection";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { useSelection } from "@/components/shell/SelectionProvider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { RegisterList, type SelectionApi } from "./transactions/RegisterList";
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

  // --- Grouping selection (#46) ---------------------------------------------
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const groupMut = useGroupTransactions();
  const ungroupMut = useUngroup();

  const exitSelect = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  // Publish the current selection so the assistant chat can act on "these" rows.
  // Only while actively selecting; clear it when leaving the page so a stale
  // selection can't follow the user to another view.
  const { setSelectedTransactionIds } = useSelection();
  useEffect(() => {
    setSelectedTransactionIds(selectMode ? [...selectedIds] : []);
  }, [selectMode, selectedIds, setSelectedTransactionIds]);
  useEffect(
    () => () => setSelectedTransactionIds([]),
    [setSelectedTransactionIds],
  );
  const selection: SelectionApi = {
    active: selectMode,
    isSelected: (id) => selectedIds.has(id),
    toggle: (id) =>
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
  };
  const handleGroup = (date: string, payeeName: string) => {
    groupMut.mutate(
      {
        ids: [...selectedIds],
        date,
        payeeName: payeeName.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Transactions grouped.");
          setGroupDialogOpen(false);
          exitSelect();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't group."),
      },
    );
  };
  const handleUngroup = (parentId: string) =>
    ungroupMut.mutate(parentId, {
      onSuccess: () => toast.success("Group removed."),
      onError: (e) => toast.error(e instanceof Error ? e.message : "Couldn't ungroup."),
    });

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
        // Account-scoped register: the instrument idiom — a thin indigo cap, the
        // account name, and its live balance, matching the Accounts screen.
        <section className="mb-4 overflow-hidden rounded-xl border border-rule bg-card">
          <div className="h-1 bg-brand" aria-hidden="true" />
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-5 py-3.5">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                Account register
              </p>
              <p className="mt-0.5 truncate font-display text-xl tracking-tight text-ink">
                {scopedAccount?.name ?? "Account"}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[11px] font-medium uppercase tracking-wider text-ink-2">Balance</p>
              <p
                className={cn(
                  "mt-0.5 text-2xl font-semibold tracking-tight tabular-nums",
                  scopedBalanceCents < 0 ? "text-neg" : "text-ink",
                )}
              >
                {fmtCentsSigned(scopedBalanceCents)}
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/* Sticky filter toolbar — a clean strip in the new language. */}
      <div
        className="sticky top-0 z-20 -mx-5 border-b border-rule bg-paper/95 px-5 py-3 backdrop-blur sm:-mx-8 sm:px-8"
      >
        {selectMode ? (
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2">
              <span className="h-4 w-1 rounded-full bg-brand" aria-hidden="true" />
              <span className="text-sm font-semibold text-ink">
                {selectedIds.size} selected
              </span>
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={exitSelect}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={selectedIds.size < 2 || groupMut.isPending}
                onClick={() => setGroupDialogOpen(true)}
              >
                Group
              </Button>
            </div>
          </div>
        ) : isMobile ? (
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setSelectMode(true)}
            >
              <CheckSquare className="size-4" />
              Select
            </Button>
          </div>
        ) : (
          // items-start so Select aligns to the dropdown row, not the centre of
          // the wrapped filter block (dropdowns + the Uncategorized toggle).
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <FilterControls {...controlProps} layout="bar" />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 shrink-0 gap-1.5 px-2 text-ink-2 hover:text-ink"
              onClick={() => setSelectMode(true)}
            >
              <CheckSquare className="size-4" />
              Select
            </Button>
          </div>
        )}
      </div>

      {txnQ.data?.capped ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-warn/40 bg-pill-warn-bg px-3 py-2 text-xs text-pill-warn-ink">
          <span className="size-1.5 shrink-0 rounded-full bg-warn" aria-hidden="true" />
          Showing the first 1000 entries — narrow the range to see the rest.
        </div>
      ) : null}

      <div className="mt-3">
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
            entryCount={filtered.length}
            selection={selection}
            onUngroup={handleUngroup}
          />
        )}
      </div>

      <GroupDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        count={selectedIds.size}
        pending={groupMut.isPending}
        onConfirm={handleGroup}
      />
    </>
  );
}

function GroupDialog({
  open,
  onOpenChange,
  count,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  count: number;
  pending: boolean;
  onConfirm: (date: string, payeeName: string) => void;
}) {
  const [date, setDate] = useState(() => iso(new Date()));
  const [payee, setPayee] = useState("");

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (open) {
      setDate(iso(new Date()));
      setPayee("");
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Group {count} transactions</DialogTitle>
          <DialogDescription>
            They stay as separate entries and keep their amounts — this collapses
            them under one row. The group total is the sum of its members; the
            group row itself never adds to any total.
          </DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onConfirm(date, payee);
          }}
        >
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-payee">Name</Label>
            <Input
              id="group-payee"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="Group (e.g. Card payment)"
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="group-date">Date</Label>
            <Input
              id="group-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending || count < 2 || !date}>
              {pending ? "Grouping…" : "Group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RegisterSkeleton() {
  return (
    <Panel title="Register">
      <div className="flex flex-col gap-px p-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </Panel>
  );
}
