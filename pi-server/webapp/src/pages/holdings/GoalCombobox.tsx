import { useState } from "react";
import { ChevronsUpDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

import { cn } from "@/lib/utils";
import type { Goal, Holding, HoldingsResponse } from "@/lib/types";
import { qk } from "@/api/keys";
import { usePatchHolding } from "@/api/holdings";
import { toast } from "@/components/ui/sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// Inline goal mapping for one holding: a Popover trigger showing the mapped
// goal (emoji + name) or a quiet "Set goal", opening a Command list of goals
// plus a "None" option. The PATCH is optimistic — the holdings cache flips
// immediately and rolls back on error.
export function GoalCombobox({
  holding,
  goals,
}: {
  holding: Holding;
  goals: Goal[];
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const patch = usePatchHolding();

  const current = goals.find((g) => g.id === holding.goalId);
  const label = current ? `${current.emoji ? `${current.emoji} ` : ""}${current.name}` : "Set goal";

  function assign(goalId: string | null) {
    setOpen(false);
    if (goalId === holding.goalId) return;

    const holdingId = holding.id;
    const prevGoalId = holding.goalId;

    qc.setQueryData<HoldingsResponse>(qk.holdings, (cur) =>
      cur
        ? { ...cur, holdings: cur.holdings.map((h) => (h.id === holdingId ? { ...h, goalId } : h)) }
        : cur,
    );

    patch.mutate(
      { id: holdingId, patch: { goalId } },
      {
        onError: (err) => {
          // Roll back ONLY this holding so a concurrent successful edit to
          // another row isn't clobbered by a stale whole-cache snapshot.
          qc.setQueryData<HoldingsResponse>(qk.holdings, (cur) =>
            cur
              ? {
                  ...cur,
                  holdings: cur.holdings.map((h) =>
                    h.id === holdingId ? { ...h, goalId: prevGoalId } : h,
                  ),
                }
              : cur,
          );
          toast.error(err instanceof Error ? err.message : "Failed to update goal");
        },
        onSuccess: () => toast.success(goalId ? "Goal updated" : "Unmapped"),
        // Always reconcile with the server, on success AND failure, so a failed
        // reconciliation can't leave stale optimistic data behind.
        onSettled: () => void qc.invalidateQueries({ queryKey: qk.holdings }),
      },
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex max-w-[9rem] items-center gap-1 rounded-md px-1.5 py-1 text-sm transition-colors hover:bg-paper-3 focus-visible:ring-2 focus-visible:ring-ring outline-none",
            current ? "text-ink" : "text-ink-2",
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="size-3 shrink-0 text-ink-2" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-56 p-0">
        <Command>
          <CommandInput placeholder="Find a goal…" />
          <CommandList>
            <CommandEmpty>No goals yet.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="__none__" onSelect={() => assign(null)}>
                <span className="text-ink-2">None</span>
              </CommandItem>
              {goals.map((g) => (
                <CommandItem key={g.id} value={g.name} onSelect={() => assign(g.id)}>
                  <span className="truncate">
                    {g.emoji ? `${g.emoji} ` : ""}
                    {g.name}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
