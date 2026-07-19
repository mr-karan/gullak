import type { ReactNode } from "react";

import { LedgerRule } from "./LedgerRule";

// Every page opens the same way: a Gambarino title, an optional quiet subline
// and right-aligned actions, then the ledger double-rule. Consistent enough to
// read as one ledger, varied by the content each page hangs beneath it.
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-2xl leading-none tracking-tight text-ink sm:text-3xl">
            {title}
          </h1>
          {subtitle ? <p className="mt-1.5 text-sm text-ink-2">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <LedgerRule className="mt-4" />
    </header>
  );
}
