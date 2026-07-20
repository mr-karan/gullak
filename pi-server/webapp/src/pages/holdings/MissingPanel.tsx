import { useState } from "react";
import { X } from "lucide-react";

import type { Holding } from "@/lib/types";
import { usePatchHolding, useDeleteHolding } from "@/api/holdings";
import { toast } from "@/components/ui/sonner";
import { Panel } from "@/components/Panel";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "./ConfirmDialog";

export interface MissingRow {
  isin: string;
  name?: string;
}

// After an import, rows that exist in the DB but were absent from the file are
// "missing" (likely sold). This panel lists them so the user decides per row:
// mark stale (keeps history, drops from totals) or delete outright. The isin is
// resolved to a holding id against the freshly-loaded list.
export function MissingPanel({
  missing,
  holdings,
  onDismiss,
}: {
  missing: MissingRow[];
  holdings: Holding[];
  onDismiss: () => void;
}) {
  const patch = usePatchHolding();
  const del = useDeleteHolding();
  const [remaining, setRemaining] = useState<MissingRow[]>(missing);
  const [confirming, setConfirming] = useState<MissingRow | null>(null);

  function idFor(isin: string): string | null {
    return holdings.find((h) => h.isin === isin)?.id ?? null;
  }

  function drop(isin: string) {
    setRemaining((rows) => {
      const next = rows.filter((r) => r.isin !== isin);
      if (next.length === 0) onDismiss();
      return next;
    });
  }

  function markStale(row: MissingRow) {
    const id = idFor(row.isin);
    if (!id) return drop(row.isin);
    patch.mutate(
      { id, patch: { stale: true } },
      {
        onSuccess: () => {
          toast.success("Marked stale");
          drop(row.isin);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to mark stale"),
      },
    );
  }

  function confirmDelete() {
    const row = confirming;
    if (!row) return;
    const id = idFor(row.isin);
    setConfirming(null);
    if (!id) return drop(row.isin);
    del.mutate(id, {
      onSuccess: () => {
        toast.success("Deleted");
        drop(row.isin);
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to delete"),
    });
  }

  if (remaining.length === 0) return null;

  return (
    <Panel
      title="Missing from this import"
      right={
        <button
          type="button"
          onClick={onDismiss}
          className="-mr-1 rounded-md p-1 text-ink-2 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring outline-none"
          aria-label="Dismiss"
        >
          <X className="size-4" />
        </button>
      }
    >
      <p className="px-4 pt-3 text-sm text-ink-2">
        These were in your portfolio before but not in the file you just imported — likely sold.
        Decide what to do with each.
      </p>

      <ul className="mt-2 flex flex-col">
        {remaining.map((row) => (
          <li
            key={row.isin}
            className="flex items-center justify-between gap-3 border-t border-rule/60 px-4 py-2.5"
          >
            <div className="min-w-0">
              <p className="truncate text-sm text-ink">{row.name || row.isin}</p>
              {row.name ? <p className="truncate text-xs text-ink-2">{row.isin}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <Button variant="ghost" size="sm" onClick={() => markStale(row)}>
                Mark stale
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-neg hover:text-neg"
                onClick={() => setConfirming(row)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(o) => !o && setConfirming(null)}
        title="Delete holding?"
        description={
          <>
            {confirming?.name || confirming?.isin} will be removed permanently, including its history.
            This can't be undone.
          </>
        }
        onConfirm={confirmDelete}
        pending={del.isPending}
      />
    </Panel>
  );
}
