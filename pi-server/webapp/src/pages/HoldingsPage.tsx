import { useRef, useState } from "react";
import { Upload } from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtCents, fmtCentsSigned, fmtEpochDate, fmtPct } from "@/lib/money";
import { useHoldings, useImportHoldings } from "@/api/holdings";
import { useGoals } from "@/api/goals";
import { useConnection } from "@/hooks/useConnection";
import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { EmptyState, ErrorState } from "@/components/states";
import { HoldingsTable } from "./holdings/HoldingsTable";
import { MissingPanel, type MissingRow } from "./holdings/MissingPanel";

export function HoldingsPage() {
  const { connected, openDialog } = useConnection();
  const holdingsQ = useHoldings(connected);
  const goalsQ = useGoals(connected);
  const importM = useImportHoldings();
  const fileRef = useRef<HTMLInputElement>(null);
  const [missing, setMissing] = useState<MissingRow[]>([]);
  const [showMissing, setShowMissing] = useState(false);

  function pickFile() {
    fileRef.current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    importM.mutate(file, {
      onSuccess: (res) => {
        setMissing(res.missing);
        setShowMissing(res.missing.length > 0);
        toast.success(
          `Updated ${res.updated} · Added ${res.added} · Missing ${res.missing.length}`,
        );
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : "Import failed"),
    });
  }

  const importButton = (
    <Button onClick={pickFile} disabled={importM.isPending}>
      <Upload className="size-4" />
      {importM.isPending ? "Importing…" : "Import"}
    </Button>
  );

  const fileInput = (
    <input
      ref={fileRef}
      type="file"
      accept=".xlsx"
      className="hidden"
      onChange={onFile}
      aria-hidden="true"
    />
  );

  if (!connected) {
    return (
      <>
        <PageHeader title="Holdings" />
        <EmptyState
          title="Not connected."
          hint="Add your pi-server API key to load your portfolio."
          action={{ label: "Connect", onClick: openDialog }}
        />
      </>
    );
  }

  if (holdingsQ.notDeployed) {
    return (
      <>
        <PageHeader title="Holdings" subtitle="Your portfolio, as of the last import." />
        <EmptyState
          title="Holdings aren't available on this server."
          hint="The holdings module isn't deployed to your pi-server yet."
        />
      </>
    );
  }

  const summary = holdingsQ.data?.summary;
  const holdings = holdingsQ.data?.holdings ?? [];
  const goals = (goalsQ.data?.goals ?? []).filter((g) => !g.archived);
  const asOf = summary?.lastImportAt ? fmtEpochDate(summary.lastImportAt) : null;

  return (
    <>
      <PageHeader
        title="Holdings"
        subtitle={asOf ? `As of the ${asOf} import — prices aren't live.` : "Your portfolio."}
        actions={importButton}
      />
      {fileInput}

      {holdingsQ.isError ? (
        <ErrorState
          message={holdingsQ.error?.message}
          onRetry={() => void holdingsQ.refetch()}
        />
      ) : holdingsQ.isLoading ? (
        <HoldingsSkeleton />
      ) : (
        <div className="flex flex-col gap-6">
          <SummaryHero
            investedCents={summary?.investedCents ?? 0}
            currentCents={summary?.currentCents ?? 0}
            pnlCents={summary?.pnlCents ?? 0}
          />

          {showMissing ? (
            <MissingPanel
              missing={missing}
              holdings={holdings}
              onDismiss={() => setShowMissing(false)}
            />
          ) : null}

          {holdings.length === 0 ? (
            <EmptyImport onImport={pickFile} />
          ) : (
            <Card className="p-5">
              <HoldingsTable holdings={holdings} goals={goals} />
            </Card>
          )}
        </div>
      )}
    </>
  );
}

// --- Invested / Current / P&L hero -----------------------------------------
function SummaryHero({
  investedCents,
  currentCents,
  pnlCents,
}: {
  investedCents: number;
  currentCents: number;
  pnlCents: number;
}) {
  const pct = investedCents ? (pnlCents / investedCents) * 100 : 0;
  return (
    <Card className="grid grid-cols-3 divide-x divide-rule">
      <HeroCell label="Invested" value={fmtCents(investedCents)} />
      <HeroCell label="Current" value={fmtCents(currentCents)} strong />
      <HeroCell
        label="P&L"
        value={fmtCentsSigned(pnlCents)}
        note={fmtPct(pct)}
        tone={pnlCents < 0 ? "neg" : "pos"}
      />
    </Card>
  );
}

function HeroCell({
  label,
  value,
  note,
  tone,
  strong,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "pos" | "neg";
  strong?: boolean;
}) {
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-ink-2">{label}</p>
      <p
        className={cn(
          "mt-1 tnum tracking-tight",
          strong ? "text-xl font-[650]" : "text-lg font-[620]",
          tone === "pos" && "text-pos",
          tone === "neg" && "text-neg",
          !tone && "text-ink",
        )}
      >
        {value}
      </p>
      {note ? (
        <p className={cn("text-xs tnum", tone === "neg" ? "text-neg" : "text-pos")}>{note}</p>
      ) : null}
    </div>
  );
}

// --- Empty state: how to get holdings in ------------------------------------
function EmptyImport({ onImport }: { onImport: () => void }) {
  return (
    <Card className="p-5">
      <EmptyState
        title="No holdings yet."
        hint="In Kite: Console → Portfolio → Holdings → Download, then import that .xlsx here."
        action={{ label: "Import a file", onClick: onImport }}
      />
    </Card>
  );
}

function HoldingsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-24 w-full rounded-lg" />
      <Skeleton className="h-72 w-full rounded-lg" />
    </div>
  );
}
