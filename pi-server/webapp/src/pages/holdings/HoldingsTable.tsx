import { cn } from "@/lib/utils";
import { fmtCents, fmtCentsSigned } from "@/lib/money";
import type { Goal, Holding } from "@/lib/types";
import { Panel } from "@/components/Panel";
import { GoalCombobox } from "./GoalCombobox";
import { kindLabel } from "./format";

function pnlOf(h: Holding): number {
  return h.currentCents - h.investedCents;
}

// The portfolio register — the same language as the Accounts/Transactions
// screens: a real table in a <Panel>, uppercase column headers, hairline
// row separators, right-aligned tabular money with P&L in traffic-light tone,
// and the per-row Goal combobox. Wide content scrolls inside the Panel; on
// narrow widths the row folds to a two-line layout that keeps the combobox.
// Stale rows read muted with a quiet "stale" tag and are already excluded from
// the header totals server-side.
export function HoldingsTable({
  holdings,
  goals,
}: {
  holdings: Holding[];
  goals: Goal[];
}) {
  return (
    <Panel
      title="Portfolio"
      right={
        <span className="text-xs tabular-nums text-ink-2">
          {holdings.length} {holdings.length === 1 ? "holding" : "holdings"}
        </span>
      }
    >
      {/* Desktop register */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-[11px] uppercase tracking-wider text-ink-2">
              {/* Symbol takes the freed width so long MF names truncate less. */}
              <th className="w-[45%] px-4 py-2 text-left font-medium">Symbol</th>
              <th className="px-4 py-2 text-left font-medium">Kind</th>
              <th className="px-4 py-2 text-right font-medium">Invested</th>
              <th className="px-4 py-2 text-right font-medium">Current</th>
              <th className="px-4 py-2 text-right font-medium">P&amp;L</th>
              <th className="px-4 py-2 text-right font-medium">Goal</th>
            </tr>
          </thead>
          <tbody>
            {holdings.map((h) => {
              const pnl = pnlOf(h);
              return (
                <tr
                  key={h.id}
                  className={cn(
                    "border-t border-rule/60 transition-colors first:border-t-0 hover:bg-paper-2/60",
                    h.stale && "opacity-55",
                  )}
                >
                  {/* max-w-0 + truncate on the symbol itself: long MF names
                      ("… FUND - DIRECT PLAN") must never collide with Kind. */}
                  <td className="max-w-0 overflow-hidden px-4 py-2.5">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate font-medium text-ink">
                        {h.symbol || h.name || "—"}
                      </span>
                      {h.stale ? (
                        <span className="shrink-0 text-[11px] uppercase tracking-wide text-ink-2">
                          stale
                        </span>
                      ) : null}
                    </div>
                    {(h.name && h.symbol) || h.sector ? (
                      <p className="truncate text-xs text-ink-2">
                        {[h.symbol ? h.name : null, h.sector].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-2">{kindLabel(h.kind)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right tabular-nums text-ink-2">
                    {fmtCents(h.investedCents)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium tabular-nums text-ink">
                    {fmtCents(h.currentCents)}
                  </td>
                  <td
                    className={cn(
                      "whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums",
                      pnl < 0 ? "text-neg" : "text-pos",
                    )}
                  >
                    {fmtCentsSigned(pnl)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {!h.goalId ? (
                        <span
                          className="size-1.5 shrink-0 rounded-full bg-warn"
                          aria-label="Not mapped to a goal"
                        />
                      ) : null}
                      <GoalCombobox holding={h} goals={goals} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile two-line rows */}
      <ul className="flex flex-col md:hidden">
        {holdings.map((h) => {
          const pnl = pnlOf(h);
          return (
            <li
              key={h.id}
              className={cn(
                "flex flex-col gap-1 border-t border-rule/60 px-4 py-3 first:border-t-0",
                h.stale && "opacity-55",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-ink">
                  {h.symbol || h.name || "—"}
                  {h.stale ? (
                    <span className="ml-1.5 text-[11px] uppercase tracking-wide text-ink-2">
                      stale
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 font-medium tabular-nums text-ink">
                  {fmtCents(h.currentCents)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-ink-2">
                <span className="tabular-nums">
                  {kindLabel(h.kind)} ·{" "}
                  <span className={pnl < 0 ? "text-neg" : "text-pos"}>{fmtCentsSigned(pnl)}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  {!h.goalId ? <span className="size-1.5 rounded-full bg-warn" /> : null}
                  <GoalCombobox holding={h} goals={goals} />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
