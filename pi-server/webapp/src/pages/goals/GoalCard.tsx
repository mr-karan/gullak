import { useMemo, useState } from "react";
import { ChevronDown, Pencil, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtCents, fmtCentsSigned, fmtCompact, fmtDayMonth } from "@/lib/money";
import type { Goal, Holding } from "@/lib/types";
import { usePatchHolding } from "@/api/holdings";
import { toast } from "@/components/ui/sonner";
import { Card } from "@/components/ui/card";
import { monthlyNeedCents, targetMonthLabel } from "./pace";

// One goal, its progress, and (on expand) the holdings funding it. Per-goal
// invested / current / P&L are summed from the mapped, non-stale holdings —
// mirroring the server's own progress math — so the card never depends on
// untyped response fields.
export function GoalCard({
  goal,
  holdings,
  onEdit,
  onDelete,
}: {
  goal: Goal;
  holdings: Holding[];
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const patch = usePatchHolding();

  const mapped = useMemo(
    () =>
      holdings
        .filter((h) => h.goalId === goal.id && !h.stale)
        .sort((a, b) => b.currentCents - a.currentCents),
    [holdings, goal.id],
  );

  const currentCents = goal.currentCents;
  const investedCents = mapped.reduce((s, h) => s + h.investedCents, 0);
  const pnlCents = currentCents - investedCents;
  const pct = goal.targetCents > 0 ? Math.min(100, (currentCents / goal.targetCents) * 100) : 0;
  const need = monthlyNeedCents(goal);

  function unmap(h: Holding) {
    patch.mutate(
      { id: h.id, patch: { goalId: null } },
      {
        onSuccess: () => toast.success("Unmapped"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to unmap"),
      },
    );
  }

  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xl">{goal.emoji || "🎯"}</span>
          <div className="min-w-0">
            <p className="truncate font-display text-lg leading-tight tracking-tight text-ink">
              {goal.name}
            </p>
            {goal.targetDate ? (
              <p className="text-xs text-ink-2">Target {fmtDayMonth(goal.targetDate)} {goal.targetDate.slice(0, 4)}</p>
            ) : null}
          </div>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="-mr-1 rounded-md p-1 text-ink-2 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring outline-none"
          aria-label="Edit goal"
        >
          <Pencil className="size-3.5" />
        </button>
      </div>

      {/* Progress */}
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-paper-3">
        <div
          className="h-full rounded-full bg-pos transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium tnum text-ink">{Math.round(pct)}%</span>
        <span className="text-xs tnum text-ink-2">
          {fmtCents(currentCents)} of {fmtCents(goal.targetCents)}
        </span>
      </div>

      {/* Roll-up line */}
      <p className="mt-2 text-xs text-ink-2">
        {mapped.length} {mapped.length === 1 ? "holding" : "holdings"} · invested{" "}
        {fmtCents(investedCents)} ·{" "}
        <span className={pnlCents < 0 ? "text-neg" : "text-pos"}>{fmtCentsSigned(pnlCents)}</span>
      </p>

      {need > 0 && goal.targetDate ? (
        <p className="mt-1.5 text-xs text-ink-2">
          needs ~{fmtCompact(need)}/mo to hit {targetMonthLabel(goal.targetDate)}
        </p>
      ) : null}

      {/* Expand */}
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 text-xs text-ink-2 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring rounded outline-none"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Hide holdings" : "Show holdings"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto text-xs text-ink-2 transition-colors hover:text-neg focus-visible:ring-2 focus-visible:ring-ring rounded outline-none"
        >
          Delete
        </button>
      </div>

      {expanded ? (
        <ul className="mt-2 flex flex-col border-t border-rule pt-2">
          {mapped.length === 0 ? (
            <li className="py-2 text-xs text-ink-2">No holdings mapped to this goal yet.</li>
          ) : (
            mapped.map((h) => {
              const weight = currentCents ? Math.round((h.currentCents / currentCents) * 100) : 0;
              return (
                <li key={h.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate text-sm text-ink">{h.symbol || h.name || "—"}</span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tnum text-sm text-ink">{fmtCents(h.currentCents)}</span>
                    <span className="tnum text-xs text-ink-2">{weight}%</span>
                    <button
                      type="button"
                      onClick={() => unmap(h)}
                      className="rounded p-0.5 text-ink-2 transition-colors hover:text-neg focus-visible:ring-2 focus-visible:ring-ring outline-none"
                      aria-label={`Unmap ${h.symbol || h.name || "holding"}`}
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </Card>
  );
}
