import { useState } from "react";

import { cn } from "@/lib/utils";
import { useConnection } from "@/hooks/useConnection";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/states";

import { CompareSection } from "./insights/CompareSection";
import { CategorySection, PayeeSection } from "./insights/BreakdownSections";
import { CashFlowChart } from "./insights/CashFlowChart";
import { AllocationSection } from "./insights/AllocationSection";
import { CategoryMonthGrid } from "./insights/CategoryMonthGrid";

export function InsightsPage() {
  const { connected, openDialog } = useConnection();
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);

  if (!connected) {
    return (
      <>
        <PageHeader title="Insights" subtitle="Where the money went, month by month." />
        <EmptyState
          title="Not connected."
          hint="Add your pi-server API key to see your spending trends."
          action={{ label: "Connect", onClick: openDialog }}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Insights" subtitle="Where the money went, month by month." />

      <div className="flex flex-col gap-8">
        <CompareSection enabled={connected} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <CategorySection enabled={connected} />
          <PayeeSection enabled={connected} />
        </div>

        <CashFlowChart enabled={connected} />

        <AllocationSection enabled={connected} />

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-4">
            <YearToggle active={year === thisYear} onClick={() => setYear(thisYear)}>
              This year
            </YearToggle>
            <YearToggle active={year === thisYear - 1} onClick={() => setYear(thisYear - 1)}>
              Last year
            </YearToggle>
          </div>
          <CategoryMonthGrid year={year} enabled={connected} />
        </div>
      </div>
    </>
  );
}

function YearToggle({
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
