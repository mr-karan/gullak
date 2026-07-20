import { Fragment, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, RotateCcw, Target } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtCents, fmtCentsSigned } from "@/lib/money";
import { monthTitle } from "@/lib/dates";
import {
  useAgeOfMoney,
  useAssignBudget,
  useBudgetPlan,
  type BudgetCategoryPlan,
  type BudgetGroupPlan,
  type BudgetTarget,
} from "@/api/budget";
import { useConnection } from "@/hooks/useConnection";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { Pill } from "@/components/Pill";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { TargetDialog } from "./budget/TargetDialog";

// ===========================================================================
// Budget — Gullak's YNAB-style envelope plan ("give every rupee a job"). Adopts
// the AccountsPage language exactly: shared <Panel> + <Pill>, one real grouped
// table with column headers + right-aligned tabular money, an instrument header
// carrying the page's thesis (Ready to Assign) and traffic-light Available chips.
// ===========================================================================

/** "2026-07" for a first-of-month Date. */
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function BudgetPage() {
  const { connected, openDialog } = useConnection();

  // Visible month, anchored to the 1st; prev/next shift by one month.
  const [anchor, setAnchor] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const month = useMemo(() => monthKey(anchor), [anchor]);
  const shiftMonth = (delta: number) =>
    setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + delta, 1));

  const planQ = useBudgetPlan(month, connected);
  const ageQ = useAgeOfMoney(connected);

  // Target editor — one dialog, retargeted per row.
  const [targetFor, setTargetFor] = useState<BudgetCategoryPlan | null>(null);

  if (!connected) {
    return (
      <>
        <PageHeader title="Budget" subtitle="Give every rupee a job." />
        <EmptyState
          title="Not connected."
          hint="Add your pi-server API key to plan your envelopes."
          action={{ label: "Connect", onClick: openDialog }}
        />
      </>
    );
  }

  const monthNav = (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Previous month"
        onClick={() => shiftMonth(-1)}
      >
        <ChevronLeft className="size-4" />
      </Button>
      <span className="min-w-[8.5rem] text-center text-xs font-semibold uppercase tracking-wider text-ink">
        {monthTitle(anchor)}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Next month"
        onClick={() => shiftMonth(1)}
      >
        <ChevronRight className="size-4" />
      </Button>
    </div>
  );

  return (
    <>
      <PageHeader title="Budget" subtitle="Give every rupee a job." />

      {planQ.isError ? (
        <ErrorState message={planQ.error?.message} onRetry={() => void planQ.refetch()} />
      ) : planQ.isLoading ? (
        <BudgetSkeleton />
      ) : (
        <div className="flex flex-col gap-4">
          <ReadyToAssignBar
            readyToAssign={planQ.data?.readyToAssign ?? 0}
            ageDays={ageQ.data?.days ?? null}
            ageHidden={ageQ.notDeployed}
            monthNav={monthNav}
          />
          <EnvelopeTable
            groups={planQ.data?.groups ?? []}
            month={month}
            onEditTarget={setTargetFor}
          />
        </div>
      )}

      <TargetDialog
        open={targetFor !== null}
        onOpenChange={(o) => {
          if (!o) setTargetFor(null);
        }}
        category={
          targetFor
            ? { id: targetFor.categoryId, name: targetFor.categoryName, target: targetFor.target }
            : null
        }
      />
    </>
  );
}

// --- Instrument header: the Ready-to-Assign readout (the page's thesis) ------
function ReadyToAssignBar({
  readyToAssign,
  ageDays,
  ageHidden,
  monthNav,
}: {
  readyToAssign: number;
  ageDays: number | null;
  ageHidden: boolean;
  monthNav: React.ReactNode;
}) {
  const tone: "pos" | "neg" | "neutral" =
    readyToAssign > 0 ? "pos" : readyToAssign < 0 ? "neg" : "neutral";
  const label =
    readyToAssign > 0 ? "To assign" : readyToAssign < 0 ? "Overassigned" : "All assigned";

  return (
    <section className="overflow-hidden rounded-xl border border-rule bg-card">
      {/* A thin indigo cap — the one confident brand touch, structural not loud. */}
      <div className="h-1 bg-brand" aria-hidden="true" />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-5 py-4">
        {/* RTA is the headline; Age of Money is a quiet companion stat beside it. */}
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-2">
              Ready to assign
            </p>
            <p
              className={cn(
                "mt-0.5 font-display text-[2.5rem] font-bold leading-none tracking-tight tabular-nums sm:text-5xl",
                tone === "pos" && "text-pos",
                tone === "neg" && "text-neg",
                tone === "neutral" && "text-ink",
              )}
            >
              {fmtCents(Math.abs(readyToAssign))}
            </p>
          </div>
          {!ageHidden ? (
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                Age of money
              </p>
              <p className="mt-0.5 text-2xl font-semibold leading-none tracking-tight tabular-nums text-ink">
                {ageDays !== null ? (
                  <>
                    {ageDays}
                    <span className="ml-1 text-sm font-normal text-ink-2">
                      {ageDays === 1 ? "day" : "days"}
                    </span>
                  </>
                ) : (
                  <span className="text-ink-2">—</span>
                )}
              </p>
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Pill tone={tone} className="px-2.5 py-1 text-sm">
            {label}
          </Pill>
          {monthNav}
        </div>
      </div>
      <p className="border-t border-rule px-5 py-2 text-xs text-ink-2">
        {readyToAssign > 0
          ? "Money still waiting for a job — assign it into an envelope below."
          : readyToAssign < 0
            ? "You've assigned more than you have — pull some back from an envelope."
            : "Every rupee has a job. Nice."}
      </p>
    </section>
  );
}

// --- The envelope table: one real grouped table ----------------------------
function EnvelopeTable({
  groups,
  month,
  onEditTarget,
}: {
  groups: BudgetGroupPlan[];
  month: string;
  onEditTarget: (category: BudgetCategoryPlan) => void;
}) {
  const totalCategories = groups.reduce((s, g) => s + g.categories.length, 0);

  return (
    <Panel
      title="Envelopes"
      right={
        <span className="text-xs tabular-nums text-ink-2">
          {totalCategories} {totalCategories === 1 ? "category" : "categories"}
        </span>
      }
    >
      {totalCategories === 0 ? (
        <EmptyState
          title="No categories to budget yet."
          hint="Add category groups and categories, then come back to assign each a job."
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-ink-2">
                <th className="px-4 py-2 text-left font-medium">Category</th>
                <th className="px-4 py-2 text-right font-medium tabular-nums">Assigned</th>
                <th className="hidden px-4 py-2 text-right font-medium tabular-nums sm:table-cell">
                  Activity
                </th>
                <th className="px-4 py-2 text-right font-medium tabular-nums">Available</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const subtotal = g.categories.reduce((s, c) => s + c.availableCents, 0);
                return (
                  <Fragment key={g.groupId}>
                    <tr className="bg-paper-2">
                      <td className="px-4 py-1.5" colSpan={3}>
                        <span className="flex items-center gap-2">
                          <span className="h-3 w-1 rounded-full bg-brand" />
                          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                            {g.groupName}
                          </span>
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-4 py-1.5 text-right text-xs font-semibold tabular-nums",
                          subtotal < 0 ? "text-neg" : "text-ink-2",
                        )}
                      >
                        {fmtCentsSigned(subtotal)}
                      </td>
                    </tr>
                    {g.categories.map((c) => (
                      <CategoryRow
                        key={c.categoryId}
                        category={c}
                        month={month}
                        onEditTarget={onEditTarget}
                      />
                    ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

// --- A category row: name + target/upcoming cues, assign, activity, available -
function CategoryRow({
  category,
  month,
  onEditTarget,
}: {
  category: BudgetCategoryPlan;
  month: string;
  onEditTarget: (category: BudgetCategoryPlan) => void;
}) {
  const c = category;
  const assign = useAssignBudget();

  // "Assign needed": top the envelope up to exactly hit its target this month.
  const assignNeeded = () => {
    if (c.targetNeededCents <= 0) return;
    assign.mutate({
      categoryId: c.categoryId,
      month,
      assignedCents: c.assignedCents + c.targetNeededCents,
    });
  };

  const hasTarget = c.target !== null;

  return (
    <tr className="group border-t border-rule/60 transition-colors hover:bg-paper-2/60">
      <td className="px-4 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="block truncate font-medium text-ink">{c.categoryName}</span>
            <CategoryCues
              category={c}
              onAssignNeeded={assignNeeded}
              assigning={assign.isPending}
            />
          </div>
          <button
            type="button"
            onClick={() => onEditTarget(c)}
            aria-label={hasTarget ? `Edit target for ${c.categoryName}` : `Set a target for ${c.categoryName}`}
            title={hasTarget ? "Edit funding target" : "Set a funding target"}
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-paper-3 hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              hasTarget ? "text-brand" : "text-ink-2/70",
            )}
          >
            <Target className="size-4" />
          </button>
        </div>
      </td>
      <td className="px-4 py-1.5 text-right">
        <AssignedCell category={c} month={month} />
      </td>
      <td
        className={cn(
          "hidden px-4 py-2.5 text-right font-medium tabular-nums sm:table-cell",
          c.activityCents < 0 ? "text-neg" : c.activityCents > 0 ? "text-pos" : "text-ink-2",
        )}
      >
        {c.activityCents === 0 ? "—" : fmtCentsSigned(c.activityCents)}
      </td>
      <td className="px-4 py-2.5 text-right">
        <Pill tone={c.availableCents < 0 ? "neg" : "pos"}>{fmtCentsSigned(c.availableCents)}</Pill>
      </td>
    </tr>
  );
}

/** "Jul 2026" from a "YYYY-MM-DD" target deadline. */
function byDateLabel(d: string): string {
  const [y, m] = d.split("-").map(Number);
  if (!y || !m) return d;
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

function targetSummary(t: BudgetTarget): string {
  if (t.type === "monthly") return `Target ${fmtCents(t.amountCents)}/mo`;
  const when = t.byDate ? ` by ${byDateLabel(t.byDate)}` : "";
  return `${fmtCents(t.amountCents)}${when}`;
}

/** The subtle sub-line under a category name: its target summary, funded/needs
    status, an inline "assign needed" quick action, and any upcoming outflows.
    Everything folds together here so it reads the same on mobile and desktop. */
function CategoryCues({
  category: c,
  onAssignNeeded,
  assigning,
}: {
  category: BudgetCategoryPlan;
  onAssignNeeded: () => void;
  assigning: boolean;
}) {
  const hasTarget = c.target !== null;
  const hasUpcoming = c.upcomingCents > 0;
  if (!hasTarget && !hasUpcoming) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {hasTarget && c.target ? (
        <span className="text-ink-2">{targetSummary(c.target)}</span>
      ) : null}

      {hasTarget && c.targetStatus === "underfunded" && c.targetNeededCents > 0 ? (
        <>
          <Pill tone="warn">needs {fmtCents(c.targetNeededCents)}</Pill>
          <button
            type="button"
            onClick={onAssignNeeded}
            disabled={assigning}
            className="rounded font-medium text-brand transition-colors hover:text-brand-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {assigning ? "assigning…" : "assign needed"}
          </button>
        </>
      ) : null}

      {hasTarget && c.targetStatus === "funded" ? (
        <span className="inline-flex items-center gap-1 font-medium text-pos">
          <Check className="size-3" aria-hidden="true" />
          funded
        </span>
      ) : null}

      {hasUpcoming ? (
        <span className="inline-flex items-center gap-1 text-ink-2">
          <RotateCcw className="size-3" aria-hidden="true" />
          {fmtCents(c.upcomingCents)} upcoming
        </span>
      ) : null}
    </div>
  );
}

// --- Inline-editable Assigned cell: YNAB's "move money between categories" ---
function centsToRupeeInput(cents: number): string {
  // Plain rupees for editing: whole number when exact, else 2dp.
  const r = cents / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

/** Parse a rupees string to integer minor units; null if not a finite number. */
function rupeesToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  const v = Number(trimmed);
  if (!Number.isFinite(v)) return null;
  return Math.round(v * 100);
}

function AssignedCell({
  category,
  month,
}: {
  category: BudgetCategoryPlan;
  month: string;
}) {
  const assign = useAssignBudget();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const committedRef = useRef(false);

  const start = () => {
    setDraft(centsToRupeeInput(category.assignedCents));
    committedRef.current = false;
    setEditing(true);
  };

  const commit = () => {
    if (committedRef.current) return;
    committedRef.current = true;
    setEditing(false);
    const cents = rupeesToCents(draft);
    if (cents === null || cents === category.assignedCents) return;
    assign.mutate({ categoryId: category.categoryId, month, assignedCents: cents });
  };

  const cancel = () => {
    committedRef.current = true;
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus
        type="text"
        inputMode="decimal"
        aria-label={`Assign to ${category.categoryName} (rupees)`}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
          } else if (e.key === "Escape") {
            e.preventDefault();
            cancel();
          }
        }}
        className="w-28 rounded-md border border-brand/50 bg-card px-2 py-1 text-right font-medium tabular-nums text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={start}
      title="Click to assign"
      className={cn(
        "inline-flex min-w-[5rem] justify-end rounded-md px-2 py-1 font-medium tabular-nums transition-colors hover:bg-paper-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        category.assignedCents === 0 ? "text-ink-2" : "text-ink",
      )}
    >
      {fmtCents(category.assignedCents)}
    </button>
  );
}

// --- Skeleton --------------------------------------------------------------
function BudgetSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-96 w-full rounded-xl" />
    </div>
  );
}
