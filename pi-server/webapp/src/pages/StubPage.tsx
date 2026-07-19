import { PageHeader } from "@/components/PageHeader";
import { CenterNote } from "@/components/states";

// Placeholder for pages parallel agents fill in next. Title + LedgerRule + one
// quiet ink-2 sentence — the scaffold, nothing more.
export function StubPage({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <>
      <PageHeader title={title} subtitle={subtitle} />
      <CenterNote>This view is being rebuilt on the new foundation.</CenterNote>
    </>
  );
}

export const TransactionsPage = () => (
  <StubPage title="Transactions" subtitle="Your register — every logged movement." />
);
