import { useState } from "react";
import { Check, Undo2 } from "lucide-react";

import { useAgentAction } from "@/api/messages";
import { toast } from "@/components/ui/sonner";
import type { WriteAction } from "@/lib/types";

// Compact result card for a write the agent performed (gen-UI). Shows the
// server's summary, a muted affected-count, and — when the action carries an
// undo — an Undo button that replays it via POST /v1/messages/action. All text
// is rendered as plain nodes (no HTML sink), matching the conversation's
// safe-render approach.
export function ActionCard({ action }: { action: WriteAction }) {
  const [undone, setUndone] = useState(false);
  const undoMut = useAgentAction();
  const count = action.affectedIds.length;

  function handleUndo() {
    if (!action.undo || undone || undoMut.isPending) return;
    undoMut.mutate(action.undo, {
      onSuccess: () => {
        setUndone(true);
        toast.success("Undone");
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Couldn't undo"),
    });
  }

  return (
    <div className="mt-2 flex items-start gap-2 rounded-md border border-rule bg-paper-2 px-3 py-2">
      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" aria-hidden />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-sm text-ink">{action.summary}</p>
        <p className="tnum text-xs text-ink-2">{count} affected</p>
      </div>
      {action.undo ? (
        <button
          type="button"
          onClick={handleUndo}
          disabled={undone || undoMut.isPending}
          className="flex shrink-0 items-center gap-1 rounded-md border border-rule px-2 py-1 text-xs text-ink-2 transition-colors hover:border-ink-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-50 disabled:hover:border-rule disabled:hover:text-ink-2"
        >
          <Undo2 className="size-3" aria-hidden />
          {undone ? "Undone" : undoMut.isPending ? "Undoing…" : "Undo"}
        </button>
      ) : null}
    </div>
  );
}
