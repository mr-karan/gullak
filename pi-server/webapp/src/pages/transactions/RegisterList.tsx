import { cn } from "@/lib/utils";
import { fmtCentsSigned, fmtDayMonth } from "@/lib/money";
import type { Transaction } from "@/lib/types";

import { CategoryCell } from "./CategoryCell";
import { dateHeaderLabel, type CatGroup, type DateGroup } from "./filters";

export function RegisterList({
  groups,
  categoryGroups,
  categoryName,
  accountName,
  showAccount,
  stickyTop,
}: {
  groups: DateGroup[];
  categoryGroups: CatGroup[];
  categoryName: (id: string | null) => string | null;
  accountName: (id: string) => string;
  showAccount: boolean;
  stickyTop: number;
}) {
  return (
    <div>
      {groups.map((g) => (
        <section key={g.date}>
          <header
            className="sticky z-10 flex items-baseline justify-between gap-3 border-b border-rule bg-paper/95 py-1.5 backdrop-blur"
            style={{ top: stickyTop }}
          >
            <span className="text-xs font-medium text-ink-2">{dateHeaderLabel(g.date)}</span>
            <span
              className={cn(
                "text-xs tnum tracking-tight",
                g.netCents < 0 ? "text-neg" : "text-pos",
              )}
            >
              {fmtCentsSigned(g.netCents)}
            </span>
          </header>
          <ul>
            {g.rows.map((t) => (
              <Row
                key={t.id}
                txn={t}
                categoryGroups={categoryGroups}
                categoryName={categoryName}
                accountName={accountName}
                showAccount={showAccount}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Row({
  txn,
  categoryGroups,
  categoryName,
  accountName,
  showAccount,
}: {
  txn: Transaction;
  categoryGroups: CatGroup[];
  categoryName: (id: string | null) => string | null;
  accountName: (id: string) => string;
  showAccount: boolean;
}) {
  const uncategorized = !txn.categoryId;
  const amount = (
    <span
      className={cn(
        "shrink-0 text-sm tnum tracking-tight tabular-nums",
        txn.amountCents < 0 ? "text-neg" : "text-pos",
      )}
    >
      {fmtCentsSigned(txn.amountCents)}
    </span>
  );
  const payee = (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="truncate font-[550] text-ink">{txn.payeeName || "Unknown"}</span>
      {uncategorized ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-warn"
          title="Uncategorized"
          aria-label="Uncategorized"
        />
      ) : null}
    </span>
  );

  return (
    <li className="border-b border-rule/70 transition-colors last:border-b-0 hover:bg-paper-3">
      {/* Desktop: dense columnar register */}
      <div
        className={cn(
          "hidden min-h-10 items-center gap-3 py-1.5 sm:grid",
          showAccount
            ? "grid-cols-[4.25rem_minmax(0,1fr)_9rem_8rem_auto]"
            : "grid-cols-[4.25rem_minmax(0,1fr)_9rem_auto]",
        )}
      >
        <span className="text-xs tnum text-ink-2">{fmtDayMonth(txn.date)}</span>
        <span className="flex min-w-0 flex-col">
          {payee}
          {txn.notes ? <span className="truncate text-xs text-ink-2">{txn.notes}</span> : null}
        </span>
        <CategoryCell
          transactionId={txn.id}
          categoryId={txn.categoryId}
          categoryName={categoryName(txn.categoryId)}
          groups={categoryGroups}
        />
        {showAccount ? (
          <span className="truncate text-sm text-ink-2">{accountName(txn.accountId)}</span>
        ) : null}
        <span className="justify-self-end">{amount}</span>
      </div>

      {/* Mobile: two lines */}
      <div className="flex flex-col gap-0.5 py-2 sm:hidden">
        <div className="flex items-baseline justify-between gap-3">
          {payee}
          {amount}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-ink-2">
          <span className="tnum">{fmtDayMonth(txn.date)}</span>
          {showAccount ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{accountName(txn.accountId)}</span>
            </>
          ) : null}
          <span aria-hidden>·</span>
          <CategoryCell
            transactionId={txn.id}
            categoryId={txn.categoryId}
            categoryName={categoryName(txn.categoryId)}
            groups={categoryGroups}
            align="end"
            className="text-xs"
          />
        </div>
      </div>
    </li>
  );
}
