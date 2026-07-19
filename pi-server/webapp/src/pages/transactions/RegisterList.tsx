import { useState } from "react";
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  ChevronRight,
  Lock,
  MoreHorizontal,
  Ungroup,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { fmtCentsSigned, fmtDayMonth } from "@/lib/money";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { CategoryCell } from "./CategoryCell";
import { dateHeaderLabel, type CatGroup, type DateGroup, type DisplayRow } from "./filters";

/** Minimal accessible checkbox (no shadcn checkbox in this app; avoids a dep). */
function SelectBox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded border transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        checked ? "border-ink bg-ink text-paper" : "border-rule bg-paper hover:border-ink-2",
      )}
    >
      {checked ? <Check className="size-3" /> : null}
    </button>
  );
}

export interface SelectionApi {
  active: boolean;
  isSelected: (id: string) => boolean;
  toggle: (id: string) => void;
}

export function RegisterList({
  groups,
  categoryGroups,
  categoryName,
  accountName,
  showAccount,
  stickyTop,
  selection,
  onUngroup,
}: {
  groups: DateGroup[];
  categoryGroups: CatGroup[];
  categoryName: (id: string | null) => string | null;
  accountName: (id: string) => string;
  showAccount: boolean;
  stickyTop: number;
  selection?: SelectionApi;
  onUngroup?: (parentId: string) => void;
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
            {g.rows.map((r) => (
              <Row
                key={r.txn.id}
                row={r}
                categoryGroups={categoryGroups}
                categoryName={categoryName}
                accountName={accountName}
                showAccount={showAccount}
                selection={selection}
                onUngroup={onUngroup}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Row({
  row,
  categoryGroups,
  categoryName,
  accountName,
  showAccount,
  selection,
  onUngroup,
}: {
  row: DisplayRow;
  categoryGroups: CatGroup[];
  categoryName: (id: string | null) => string | null;
  accountName: (id: string) => string;
  showAccount: boolean;
  selection?: SelectionApi;
  onUngroup?: (parentId: string) => void;
}) {
  const txn = row.txn;
  const [expanded, setExpanded] = useState(false);
  const isGroup = !!row.children;
  // Transfer (#41): both legs are ordinary rows sharing a transferGroupId; the
  // counterpart account is named by transferAccountId. Categories are null on a
  // transfer, so the category slot shows the ⇄ affordance + counterpart instead.
  const isTransfer = !isGroup && !!txn.transferGroupId;
  // A group parent can't itself be grouped; only plain rows are selectable.
  const selectable = selection?.active && !isGroup;

  const transferCell = (
    <span
      className="flex min-w-0 items-center gap-1 text-sm text-ink-2"
      title={
        txn.transferAccountId
          ? `Transfer · ${accountName(txn.transferAccountId)}`
          : "Transfer"
      }
    >
      <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {txn.transferAccountId ? accountName(txn.transferAccountId) : "Transfer"}
      </span>
    </span>
  );

  const amount = (
    <span
      className={cn(
        "shrink-0 text-sm tnum tracking-tight tabular-nums",
        row.displayCents < 0 ? "text-neg" : "text-pos",
      )}
    >
      {fmtCentsSigned(row.displayCents)}
    </span>
  );
  const payee = (
    <span className="flex min-w-0 items-center gap-1.5">
      {isGroup ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse group" : "Expand group"}
          className="-ml-1 flex items-center rounded p-0.5 text-ink-2 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {expanded ? (
            <ChevronDown className="size-4" />
          ) : (
            <ChevronRight className="size-4" />
          )}
        </button>
      ) : null}
      <span className="truncate font-[550] text-ink">{txn.payeeName || "Unknown"}</span>
      {/* Reconciliation lock (#42): a reconciled row is frozen server-side. */}
      {txn.reconciled ? (
        <Lock
          className="size-3 shrink-0 text-ink-2"
          aria-label="Reconciled (locked)"
        />
      ) : null}
      {isGroup ? (
        <span className="shrink-0 rounded border border-rule px-1 text-[10px] uppercase tracking-wide text-ink-2">
          {row.children!.length} grouped
        </span>
      ) : null}
      {!isGroup && !txn.categoryId ? (
        <span
          className="size-1.5 shrink-0 rounded-full bg-warn"
          title="Uncategorized"
          aria-label="Uncategorized"
        />
      ) : null}
    </span>
  );

  const groupMenu =
    isGroup && onUngroup ? (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 text-ink-2"
            aria-label="Group actions"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onUngroup(txn.id)}>
            <Ungroup className="size-4" />
            Ungroup
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ) : null;

  return (
    <li className="border-b border-rule/70 last:border-b-0">
      <div className="transition-colors hover:bg-paper-3">
        {/* Desktop: dense columnar register */}
        <div
          className={cn(
            "hidden min-h-10 items-center gap-3 py-1.5 sm:grid",
            showAccount
              ? "grid-cols-[auto_4.25rem_minmax(0,1fr)_9rem_8rem_auto]"
              : "grid-cols-[auto_4.25rem_minmax(0,1fr)_9rem_auto]",
          )}
        >
          <span className="flex w-4 items-center justify-center">
            {selectable ? (
              <SelectBox
                checked={selection!.isSelected(txn.id)}
                onChange={() => selection!.toggle(txn.id)}
                label={`Select ${txn.payeeName || "transaction"}`}
              />
            ) : null}
          </span>
          <span className="text-xs tnum text-ink-2">{fmtDayMonth(txn.date)}</span>
          <span className="flex min-w-0 flex-col">
            {payee}
            {txn.notes ? (
              <span className="truncate text-xs text-ink-2">{txn.notes}</span>
            ) : null}
          </span>
          {isGroup ? (
            <span className="truncate text-sm text-ink-2">
              {categoryName(txn.categoryId) ?? "Group"}
            </span>
          ) : isTransfer ? (
            transferCell
          ) : (
            <CategoryCell
              transactionId={txn.id}
              categoryId={txn.categoryId}
              categoryName={categoryName(txn.categoryId)}
              groups={categoryGroups}
            />
          )}
          {showAccount ? (
            <span className="truncate text-sm text-ink-2">{accountName(txn.accountId)}</span>
          ) : null}
          <span className="flex items-center justify-end gap-1 justify-self-end">
            {amount}
            {groupMenu}
          </span>
        </div>

        {/* Mobile: two lines */}
        <div className="flex items-start gap-2 py-2 sm:hidden">
          {selectable ? (
            <span className="pt-1">
              <SelectBox
                checked={selection!.isSelected(txn.id)}
                onChange={() => selection!.toggle(txn.id)}
                label={`Select ${txn.payeeName || "transaction"}`}
              />
            </span>
          ) : null}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex items-baseline justify-between gap-3">
              {payee}
              <span className="flex items-center gap-1">
                {amount}
                {groupMenu}
              </span>
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
              {isGroup ? (
                <span className="truncate">{categoryName(txn.categoryId) ?? "Group"}</span>
              ) : isTransfer ? (
                transferCell
              ) : (
                <CategoryCell
                  transactionId={txn.id}
                  categoryId={txn.categoryId}
                  categoryName={categoryName(txn.categoryId)}
                  groups={categoryGroups}
                  align="end"
                  className="text-xs"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded group children (read-only, indented) */}
      {isGroup && expanded ? (
        <ul className="border-t border-rule/50 bg-paper-2/40">
          {row.children!.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 border-b border-rule/40 py-1.5 pl-7 pr-1 last:border-b-0"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-sm text-ink">{c.payeeName || "Unknown"}</span>
                <span className="flex items-center gap-1.5 text-xs text-ink-2">
                  <span className="tnum">{fmtDayMonth(c.date)}</span>
                  <span aria-hidden>·</span>
                  <span className="truncate">{categoryName(c.categoryId) ?? "Uncategorized"}</span>
                  {showAccount ? (
                    <>
                      <span aria-hidden>·</span>
                      <span className="truncate">{accountName(c.accountId)}</span>
                    </>
                  ) : null}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 text-sm tnum tracking-tight tabular-nums",
                  c.amountCents < 0 ? "text-neg" : "text-pos",
                )}
              >
                {fmtCentsSigned(c.amountCents)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
