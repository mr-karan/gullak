import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { toast } from "sonner";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TransactionsResponse } from "@/lib/types";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import type { CatGroup } from "./filters";

/** Optimistic category PATCH across every cached transactions window. Rolls
 *  back the snapshot on failure and surfaces a toast either way. */
function useSetCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; categoryId: string | null }) =>
      api.patch(`/v1/transactions/${vars.id}`, { categoryId: vars.categoryId }),
    onMutate: async (vars) => {
      await client.cancelQueries({ queryKey: ["transactions"] });
      const prev = client.getQueriesData<TransactionsResponse>({ queryKey: ["transactions"] });
      client.setQueriesData<TransactionsResponse>({ queryKey: ["transactions"] }, (old) =>
        old
          ? {
              transactions: old.transactions.map((t) =>
                t.id === vars.id ? { ...t, categoryId: vars.categoryId } : t,
              ),
            }
          : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => client.setQueryData(key, data));
      toast.error("Couldn't update category.");
    },
    onSuccess: () => {
      toast.success("Category updated.");
    },
    onSettled: () => {
      void client.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

export function CategoryCell({
  transactionId,
  categoryId,
  categoryName,
  groups,
  align = "start",
  className,
}: {
  transactionId: string;
  categoryId: string | null;
  categoryName: string | null;
  groups: CatGroup[];
  align?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const setCategory = useSetCategory();

  function choose(nextId: string | null) {
    setOpen(false);
    if (nextId === categoryId) return;
    setCategory.mutate({ id: transactionId, categoryId: nextId });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "-mx-1 max-w-full truncate rounded px-1 py-0.5 text-left text-sm transition-colors",
            "hover:bg-paper-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            categoryName ? "text-ink" : "text-ink-2",
            className,
          )}
        >
          {categoryName ?? "Uncategorized"}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-64 p-0">
        <Command
          filter={(value, search) =>
            value.toLowerCase().includes(search.trim().toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Set category…" autoFocus />
          <CommandList>
            <CommandEmpty>No category found.</CommandEmpty>
            {categoryId ? (
              <CommandGroup className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-2">
                <CommandItem value="Uncategorized" onSelect={() => choose(null)}>
                  <span className="text-ink-2">Clear category</span>
                </CommandItem>
              </CommandGroup>
            ) : null}
            {groups.map((g) => (
              <CommandGroup
                key={g.group}
                heading={g.group}
                className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-ink-2"
              >
                {g.categories.map((c) => (
                  <CommandItem key={c.id} value={c.name} onSelect={() => choose(c.id)}>
                    <span className="truncate">{c.name}</span>
                    {c.id === categoryId ? (
                      <Check className="ml-auto size-4 text-ink" />
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
