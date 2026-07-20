import { useMemo, useState } from "react";
import { ChevronDown, Pencil, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtCents, fmtCentsSigned, fmtCompact, fmtDayMonth } from "@/lib/money";
import type { Goal, Holding } from "@/lib/types";
import { usePatchHolding } from "@/api/holdings";
import { toast } from "@/components/ui/sonner";
import { Pill, type PillTone } from "@/components/Pill";
import { monthlyNeedCents, targetMonthLabel } from "./pace";

// The funded/behind verdict for the status Pill. Uses only real data (funded %
// and the target date) — no invented savings rate. Funded is green, an overdue
// unfunded goal is red, a deadline within ~3 months is amber attention.
function goalStatus(
  pct: number,
  targetDate: string | null,
): { tone: PillTone; label: string } {
  if (pct >= 100) return { tone: "pos", label: "Funded" };
  if (!targetDate) return { tone: "neutral", label: `${Math.round(pct)}%` };
  const now = new Date();
  const [y, m] = targetDate.split("-").map(Number);
  const months = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
  if (months < 0) return { tone: "neg", label: "Overdue" };
  if (months <= 3) return { tone: "warn", label: "Due soon" };
  return { tone: "neutral", label: `${Math.round(pct)}%` };
}

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
  const status = goalStatus(pct, goal.targetDate);

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
    <section className="flex flex-col rounded-xl border border-rule bg-card p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xl">{goal.emoji || "🎯"}</span>
          <div className="min-w-0">
            <p className="truncate font-display text-lg leading-tight tracking-tight text-ink">
              {goal.name}
            </p>
            {goal.targetDate ? (
              <p className="text-xs text-ink-2">
                Target {fmtDayMonth(goal.targetDate)} {goal.targetDate.slice(0, 4)}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Pill tone={status.tone}>{status.label}</Pill>
          <button
            type="button"
            onClick={onEdit}
            className="-mr-1 rounded-md p-1 text-ink-2 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring outline-none"
            aria-label="Edit goal"
          >
            <Pencil className="size-3.5" />
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-paper-3">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium tabular-nums text-ink">{Math.round(pct)}%</span>
        <span className="text-xs tabular-nums text-ink-2">
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
          className="inline-flex items-center gap-1 rounded text-xs text-ink-2 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring outline-none"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} />
          {expanded ? "Hide holdings" : "Show holdings"}
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="ml-auto rounded text-xs text-ink-2 transition-colors hover:text-neg focus-visible:ring-2 focus-visible:ring-ring outline-none"
        >
          Delete
        </button>
      </div>

      {expanded ? (
        <ul className="mt-2 flex flex-col border-t border-rule/60 pt-2">
          {mapped.length === 0 ? (
            <li className="py-2 text-xs text-ink-2">No holdings mapped to this goal yet.</li>
          ) : (
            mapped.map((h) => {
              const weight = currentCents ? Math.round((h.currentCents / currentCents) * 100) : 0;
              return (
                <li key={h.id} className="flex items-center justify-between gap-3 py-1.5">
                  <span className="min-w-0 truncate text-sm text-ink">
                    {h.symbol || h.name || "—"}
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="text-sm tabular-nums text-ink">{fmtCents(h.currentCents)}</span>
                    <span className="text-xs tabular-nums text-ink-2">{weight}%</span>
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
    </section>
  );
}
