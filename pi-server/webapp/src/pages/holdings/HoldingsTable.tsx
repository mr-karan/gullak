import { cn } from "@/lib/utils";
import { fmtCents, fmtCentsSigned } from "@/lib/money";
import type { Goal, Holding } from "@/lib/types";
import { LedgerRule } from "@/components/LedgerRule";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GoalCombobox } from "./GoalCombobox";
import { kindLabel } from "./format";

const numCol = "text-right tnum";

function pnlOf(h: Holding): number {
  return h.currentCents - h.investedCents;
}

// The register. Desktop is a full shadcn Table with the blessed LedgerRule sat
// directly under the header row; mobile collapses to two-line rows. Stale rows
// read muted with a quiet "stale" tag and are already excluded from the header
// totals server-side.
export function HoldingsTable({
  holdings,
  goals,
}: {
  holdings: Holding[];
  goals: Goal[];
}) {
  return (
    <>
      {/* Desktop register */}
      <div className="hidden md:block">
        <Table>
          <TableHeader className="[&_tr]:border-b-0">
            <TableRow className="hover:bg-transparent">
              {/* Symbol takes the freed width so long MF names truncate less. */}
              <TableHead className="w-[45%]">Symbol</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead className={numCol}>Invested</TableHead>
              <TableHead className={numCol}>Current</TableHead>
              <TableHead className={numCol}>P&amp;L</TableHead>
              <TableHead className="text-right">Goal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* The one blessed in-table LedgerRule: directly under the header row. */}
            <tr>
              <td colSpan={6} className="p-0">
                <LedgerRule />
              </td>
            </tr>
            {holdings.map((h) => {
              const pnl = pnlOf(h);
              return (
                <TableRow key={h.id} className={cn(h.stale && "opacity-55")}>
                  {/* overflow-hidden + truncate on the symbol itself: long MF
                      names ("… FUND - DIRECT PLAN") must never collide with
                      the Kind column. */}
                  <TableCell className="max-w-0 overflow-hidden">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate font-medium text-ink">{h.symbol || h.name || "—"}</span>
                      {h.stale ? <span className="shrink-0 text-xs text-ink-2">stale</span> : null}
                    </div>
                    {(h.name && h.symbol) || h.sector ? (
                      <p className="truncate text-xs text-ink-2">
                        {[h.symbol ? h.name : null, h.sector].filter(Boolean).join(" · ")}
                      </p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-ink-2">{kindLabel(h.kind)}</TableCell>
                  <TableCell className={cn(numCol, "text-ink-2")}>{fmtCents(h.investedCents)}</TableCell>
                  <TableCell className={cn(numCol, "font-medium text-ink")}>
                    {fmtCents(h.currentCents)}
                  </TableCell>
                  <TableCell
                    className={cn(numCol, "font-medium", pnl < 0 ? "text-neg" : "text-pos")}
                  >
                    {fmtCentsSigned(pnl)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {!h.goalId ? (
                        <span
                          className="size-1.5 rounded-full bg-warn"
                          aria-label="Not mapped to a goal"
                        />
                      ) : null}
                      <GoalCombobox holding={h} goals={goals} />
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Mobile two-line rows */}
      <ul className="flex flex-col md:hidden">
        {holdings.map((h) => {
          const pnl = pnlOf(h);
          return (
            <li
              key={h.id}
              className={cn(
                "flex flex-col gap-1 border-t border-rule py-3 first:border-t-0",
                h.stale && "opacity-55",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate font-medium text-ink">
                  {h.symbol || h.name || "—"}
                  {h.stale ? <span className="ml-1.5 text-xs text-ink-2">stale</span> : null}
                </span>
                <span className="shrink-0 font-medium tnum text-ink">{fmtCents(h.currentCents)}</span>
              </div>
              <div className="flex items-center justify-between gap-3 text-xs text-ink-2">
                <span className="tnum">
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
    </>
  );
}
