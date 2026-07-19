import { useMemo, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import type { Profile } from "@/lib/types";
import { useDesires, useUpdateDesire } from "@/api/desires";
import { useProfiles } from "@/api/profiles";
import { useConnection } from "@/hooks/useConnection";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";

import { AddDesireDialog } from "./desires/AddDesireDialog";
import { DesireCard } from "./desires/DesireCard";
import { DesireDetailSheet } from "./desires/DesireDetailSheet";
import { STATUS_FILTERS } from "./desires/status";

export function DesiresPage() {
  const { connected, openDialog } = useConnection();
  const profilesQ = useProfiles(connected);
  const profiles = useMemo(() => profilesQ.data ?? [], [profilesQ.data]);

  // Active person = the PersonPicker selection (same localStorage key), used to
  // stamp new desires and comments.
  const [personId] = useLocalStorage<string | null>("gullak_person", null);
  const activePerson = profiles.find((p) => p.id === personId) ?? profiles[0] ?? null;

  const personName = useMemo(() => {
    const map = new Map(profiles.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (map.get(id) ?? id) : "—");
  }, [profiles]);

  const [filterPerson, setFilterPerson] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const desiresQ = useDesires(filterPerson || undefined, filterStatus || undefined, connected);
  const update = useUpdateDesire();
  const desires = desiresQ.data ?? [];

  const verdict = (id: string, status: "yes" | "nah") =>
    update.mutate(
      { id, patch: { status } },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update.") },
    );

  if (!connected) {
    return (
      <>
        <PageHeader title="Desires" subtitle="A shared wishlist, with brakes." />
        <EmptyState
          title="Not connected."
          hint="Add your pi-server API key to load your wishlist."
          action={{ label: "Connect", onClick: openDialog }}
        />
      </>
    );
  }

  const addAction = (
    <Button size="sm" onClick={() => setAddOpen(true)}>
      Add a desire
    </Button>
  );

  return (
    <>
      <PageHeader
        title="Desires"
        subtitle="A shared wishlist, with brakes."
        actions={addAction}
      />

      <div className="mb-6 flex flex-col gap-3">
        <FilterRow label="Who">
          <ToggleText active={filterPerson === ""} onClick={() => setFilterPerson("")}>
            All
          </ToggleText>
          {profiles.map((p: Profile) => (
            <ToggleText
              key={p.id}
              active={filterPerson === p.id}
              onClick={() => setFilterPerson(p.id)}
            >
              {p.name}
            </ToggleText>
          ))}
        </FilterRow>
        <FilterRow label="Status">
          {STATUS_FILTERS.map((s) => (
            <ToggleText
              key={s.value}
              active={filterStatus === s.value}
              onClick={() => setFilterStatus(s.value)}
            >
              {s.label}
            </ToggleText>
          ))}
        </FilterRow>
      </div>

      {desiresQ.isError && !desiresQ.notDeployed ? (
        <ErrorState message={desiresQ.error?.message} onRetry={() => void desiresQ.refetch()} />
      ) : desiresQ.notDeployed ? (
        <EmptyState
          title="Desires aren't available on this server yet."
          hint="This is an M5 feature — update the pi-server to use it."
        />
      ) : desiresQ.isLoading ? (
        <DesiresSkeleton />
      ) : desires.length === 0 ? (
        <EmptyState
          title="Nothing on the wishlist."
          hint="Jot down something you want and, more importantly, why."
          action={{ label: "Add a desire", onClick: () => setAddOpen(true) }}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {desires.map((d) => (
            <DesireCard
              key={d.id}
              desire={d}
              personName={personName}
              onOpen={() => setDetailId(d.id)}
              onVerdict={(status) => verdict(d.id, status)}
            />
          ))}
        </div>
      )}

      <AddDesireDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        person={activePerson?.id ?? null}
        personName={activePerson?.name ?? "—"}
      />

      <DesireDetailSheet
        desireId={detailId}
        open={detailId !== null}
        onOpenChange={(o) => {
          if (!o) setDetailId(null);
        }}
        person={activePerson?.id ?? null}
        personName={personName}
      />
    </>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      <span className="text-xs text-ink-2">{label}</span>
      {children}
    </div>
  );
}

function ToggleText({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active ? "font-medium text-ink" : "text-ink-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function DesiresSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-64 w-full rounded-lg" />
      ))}
    </div>
  );
}
