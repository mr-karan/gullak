import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus } from "lucide-react";

import { fmtCents, fmtCompact } from "@/lib/money";
import type { Goal } from "@/lib/types";
import { useGoals, useDeleteGoal } from "@/api/goals";
import { useHoldings } from "@/api/holdings";
import { useConnection } from "@/hooks/useConnection";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { EmptyState, ErrorState } from "@/components/states";
import { GoalCard } from "./goals/GoalCard";
import { GoalDialog } from "./goals/GoalDialog";
import { ConfirmDialog } from "./holdings/ConfirmDialog";

export function GoalsPage() {
  const { connected, openDialog } = useConnection();
  const goalsQ = useGoals(connected);
  const holdingsQ = useHoldings(connected);
  const deleteM = useDeleteGoal();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);
  const [confirming, setConfirming] = useState<Goal | null>(null);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(goal: Goal) {
    setEditing(goal);
    setDialogOpen(true);
  }

  function confirmDelete() {
    const goal = confirming;
    if (!goal) return;
    deleteM.mutate(goal.id, {
      onSuccess: () => {
        toast.success("Goal deleted");
        setConfirming(null);
      },
      // 409 when holdings are still mapped — surface the server's message verbatim.
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Couldn't delete this goal"),
    });
  }

  const newButton = (
    <Button onClick={openCreate}>
      <Plus className="size-4" />
      New goal
    </Button>
  );

  if (!connected) {
    return (
      <>
        <PageHeader title="Goals" />
        <EmptyState
          title="Not connected."
          hint="Add your pi-server API key to load your goals."
          action={{ label: "Connect", onClick: openDialog }}
        />
      </>
    );
  }

  if (goalsQ.notDeployed) {
    return (
      <>
        <PageHeader title="Goals" subtitle="Named targets, funded by mapped holdings." />
        <EmptyState
          title="Goals aren't available on this server."
          hint="The goals module isn't deployed to your pi-server yet."
        />
      </>
    );
  }

  const goals = goalsQ.data?.goals ?? [];
  const unmappedCents = goalsQ.data?.unmappedCents ?? 0;
  const holdings = holdingsQ.data?.holdings ?? [];
  const isEmpty = goals.length === 0 && unmappedCents === 0;

  return (
    <>
      <PageHeader
        title="Goals"
        subtitle="Named targets, funded by the holdings you map to them."
        actions={newButton}
      />

      {goalsQ.isError ? (
        <ErrorState message={goalsQ.error?.message} onRetry={() => void goalsQ.refetch()} />
      ) : goalsQ.isLoading ? (
        <GoalsSkeleton />
      ) : isEmpty ? (
        <EmptyState
          title="No goals yet — give your money somewhere to go."
          action={{ label: "New goal", onClick: openCreate }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              holdings={holdings}
              onEdit={() => openEdit(goal)}
              onDelete={() => setConfirming(goal)}
            />
          ))}
          {unmappedCents > 0 ? <UnallocatedCard cents={unmappedCents} /> : null}
        </div>
      )}

      <GoalDialog open={dialogOpen} onOpenChange={setDialogOpen} goal={editing} />

      <ConfirmDialog
        open={confirming !== null}
        onOpenChange={(o) => !o && setConfirming(null)}
        title="Delete goal?"
        description={
          <>Delete "{confirming?.name}"? Its holdings must be unmapped first.</>
        }
        onConfirm={confirmDelete}
        pending={deleteM.isPending}
      />
    </>
  );
}

// A dashed panel for the value that isn't working toward anything yet.
function UnallocatedCard({ cents }: { cents: number }) {
  return (
    <section className="flex flex-col rounded-xl border border-dashed border-rule bg-card p-5">
      <p className="text-[11px] font-medium uppercase tracking-wider text-ink-2">Not yet allocated</p>
      <p className="mt-1.5 text-lg font-semibold tabular-nums tracking-tight text-ink">
        {fmtCents(cents)}
      </p>
      <p className="mt-1 text-xs text-ink-2">
        {fmtCompact(cents)} not working toward anything yet.
      </p>
      <Link
        to="/holdings"
        className="mt-auto rounded pt-3 text-sm text-brand underline-offset-4 transition-colors hover:text-brand-2 hover:underline focus-visible:ring-2 focus-visible:ring-ring"
      >
        Map holdings to a goal →
      </Link>
    </section>
  );
}

function GoalsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}
