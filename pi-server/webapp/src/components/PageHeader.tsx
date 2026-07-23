import type { ReactNode } from "react";

import { LedgerRule } from "./LedgerRule";

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
    <header className="mb-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl leading-[1.05] tracking-[-0.035em] text-ink sm:text-4xl">
            {title}
          </h1>
          {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-2">{subtitle}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </div>
      <LedgerRule className="mt-5" />
    </header>
  );
}
