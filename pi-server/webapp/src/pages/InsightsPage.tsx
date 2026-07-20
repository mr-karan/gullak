import { useState } from "react";

import { useConnection } from "@/hooks/useConnection";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/states";

import { CompareSection } from "./insights/CompareSection";
import { CategorySection, PayeeSection } from "./insights/BreakdownSections";
import { CashFlowChart } from "./insights/CashFlowChart";
import { CashTrendSection } from "./insights/CashTrendSection";
import { NetWorthHistorySection } from "./insights/NetWorthHistorySection";
import { NewPayeesSection } from "./insights/NewPayeesSection";
import { TopSpendsSection } from "./insights/TopSpendsSection";
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

      <div className="flex flex-col gap-4">
        <CompareSection enabled={connected} />

        <NetWorthHistorySection enabled={connected} />

        <CashTrendSection enabled={connected} />

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <CategorySection enabled={connected} />
          <PayeeSection enabled={connected} />
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          <TopSpendsSection enabled={connected} />
          <NewPayeesSection enabled={connected} />
        </div>

        <CashFlowChart enabled={connected} />

        <AllocationSection enabled={connected} />

        <CategoryMonthGrid
          year={year}
          thisYear={thisYear}
          onYearChange={setYear}
          enabled={connected}
        />
      </div>
    </>
  );
}
