import { Fragment, useState } from "react";
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
import { Panel } from "@/components/Panel";
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
        checked ? "border-brand bg-brand text-brand-ink" : "border-rule bg-paper hover:border-ink-2",
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

// The register as a real, dense table — same language as the Accounts screen:
// column headers, right-aligned tabular figures, hairline row separators, and
// bg-paper-2 date-group rows carrying the day's net. Wide content scrolls inside
// the Panel; on narrow widths date/category/account fold into a payee subline.
export function RegisterList({
  groups,
  categoryGroups,
  categoryName,
  accountName,
  showAccount,
  entryCount,
  selection,
  onUngroup,
}: {
  groups: DateGroup[];
  categoryGroups: CatGroup[];
  categoryName: (id: string | null) => string | null;
  accountName: (id: string) => string;
  showAccount: boolean;
  entryCount: number;
  selection?: SelectionApi;
  onUngroup?: (parentId: string) => void;
}) {
  const selecting = !!selection?.active;
  // Columns left of the amount (colSpan target for the group-net row): optional
  // checkbox + date + payee + category + optional account. Hidden-at-narrow
  // columns still occupy DOM columns, so colSpan stays correct.
  const leftCols = 1 /* date */ + 1 /* payee */ + 1 /* category */ + (selecting ? 1 : 0) + (showAccount ? 1 : 0);

  return (
    <Panel
      title="Register"
      right={
        <span className="text-xs tabular-nums text-ink-2">
          {entryCount} {entryCount === 1 ? "entry" : "entries"}
        </span>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-rule text-[11px] uppercase tracking-wider text-ink-2">
              {selecting ? <th className="w-8 px-2 py-2" /> : null}
              <th className="px-4 py-2 text-left font-medium">Date</th>
              <th className="px-4 py-2 text-left font-medium">Payee</th>
              <th className="hidden px-4 py-2 text-left font-medium sm:table-cell">Category</th>
              {showAccount ? (
                <th className="hidden px-4 py-2 text-left font-medium md:table-cell">Account</th>
              ) : null}
              <th className="px-4 py-2 text-right font-medium">Amount</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Fragment key={g.date}>
                <tr className="bg-paper-2">
                  <td className="px-4 py-1.5" colSpan={leftCols}>
                    <span className="flex items-center gap-2">
                      <span className="h-3 w-1 rounded-full bg-brand" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                        {dateHeaderLabel(g.date)}
                      </span>
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-1.5 text-right text-xs font-semibold tabular-nums",
                      g.netCents < 0 ? "text-neg" : "text-ink-2",
                    )}
                  >
                    {fmtCentsSigned(g.netCents)}
                  </td>
                  <td className="bg-paper-2" />
                </tr>
                {g.rows.map((r) => (
                  <Row
                    key={r.txn.id}
                    row={r}
                    categoryGroups={categoryGroups}
                    categoryName={categoryName}
                    accountName={accountName}
                    showAccount={showAccount}
                    selecting={selecting}
                    selection={selection}
                    onUngroup={onUngroup}
                  />
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function Row({
  row,
  categoryGroups,
  categoryName,
  accountName,
  showAccount,
  selecting,
  selection,
  onUngroup,
}: {
  row: DisplayRow;
  categoryGroups: CatGroup[];
  categoryName: (id: string | null) => string | null;
  accountName: (id: string) => string;
  showAccount: boolean;
  selecting: boolean;
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
  const selectable = selecting && !isGroup;

  const transferCell = (
    <span
      className="flex min-w-0 items-center gap-1 text-ink-2"
      title={
        txn.transferAccountId ? `Transfer · ${accountName(txn.transferAccountId)}` : "Transfer"
      }
    >
      <ArrowLeftRight className="size-3.5 shrink-0" aria-hidden />
      <span className="truncate">
        {txn.transferAccountId ? accountName(txn.transferAccountId) : "Transfer"}
      </span>
    </span>
  );

  // The category slot, shared by the desktop cell and the mobile subline.
  const categorySlot = (opts?: { className?: string }) =>
    isGroup ? (
      <span className={cn("truncate text-ink-2", opts?.className)}>
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
        className={opts?.className}
      />
    );

  const payeeLine = (
    <span className="flex min-w-0 items-center gap-1.5">
      {isGroup ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          aria-label={expanded ? "Collapse group" : "Expand group"}
          className="-ml-1 flex items-center rounded p-0.5 text-ink-2 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      ) : null}
      <span className="truncate font-medium text-ink">{txn.payeeName || "Unknown"}</span>
      {/* Reconciliation lock (#42): a reconciled row is frozen server-side. */}
      {txn.reconciled ? (
        <Lock className="size-3 shrink-0 text-ink-2" aria-label="Reconciled (locked)" />
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
    <>
      <tr className="group border-t border-rule/60 align-top transition-colors hover:bg-paper-2/60">
        {selecting ? (
          <td className="px-2 py-2.5">
            {selectable ? (
              <span className="flex justify-center">
                <SelectBox
                  checked={selection!.isSelected(txn.id)}
                  onChange={() => selection!.toggle(txn.id)}
                  label={`Select ${txn.payeeName || "transaction"}`}
                />
              </span>
            ) : null}
          </td>
        ) : null}
        <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-ink-2">
          {fmtDayMonth(txn.date)}
        </td>
        <td className="px-4 py-2.5">
          <span className="flex min-w-0 flex-col gap-0.5">
            {payeeLine}
            {txn.notes ? (
              <span className="truncate text-xs text-ink-2">{txn.notes}</span>
            ) : null}
            {/* Mobile: category + account fold under the payee. */}
            <span className="flex items-center gap-1.5 text-xs text-ink-2 sm:hidden">
              {categorySlot({ className: "text-xs" })}
              {showAccount ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">{accountName(txn.accountId)}</span>
                </>
              ) : null}
            </span>
          </span>
        </td>
        <td className="hidden px-4 py-2.5 sm:table-cell">{categorySlot()}</td>
        {showAccount ? (
          <td className="hidden px-4 py-2.5 text-ink-2 md:table-cell">
            <span className="block truncate">{accountName(txn.accountId)}</span>
          </td>
        ) : null}
        <td
          className={cn(
            "whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums",
            row.displayCents < 0 ? "text-neg" : "text-pos",
          )}
        >
          {fmtCentsSigned(row.displayCents)}
        </td>
        <td className="pr-2">
          <span className="flex justify-end">{groupMenu}</span>
        </td>
      </tr>

      {/* Expanded group children (read-only, indented). */}
      {isGroup && expanded
        ? row.children!.map((c) => (
            <tr key={c.id} className="border-t border-rule/40 bg-paper-2/40 align-top">
              {selecting ? <td /> : null}
              <td className="whitespace-nowrap px-4 py-2 text-xs tabular-nums text-ink-2">
                {fmtDayMonth(c.date)}
              </td>
              <td className="px-4 py-2 pl-8">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-ink">{c.payeeName || "Unknown"}</span>
                  <span className="flex items-center gap-1.5 text-xs text-ink-2 sm:hidden">
                    <span className="truncate">{categoryName(c.categoryId) ?? "Uncategorized"}</span>
                    {showAccount ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="truncate">{accountName(c.accountId)}</span>
                      </>
                    ) : null}
                  </span>
                </span>
              </td>
              <td className="hidden px-4 py-2 text-ink-2 sm:table-cell">
                {categoryName(c.categoryId) ?? "Uncategorized"}
              </td>
              {showAccount ? (
                <td className="hidden px-4 py-2 text-ink-2 md:table-cell">
                  <span className="block truncate">{accountName(c.accountId)}</span>
                </td>
              ) : null}
              <td
                className={cn(
                  "whitespace-nowrap px-4 py-2 text-right tabular-nums",
                  c.amountCents < 0 ? "text-neg" : "text-pos",
                )}
              >
                {fmtCentsSigned(c.amountCents)}
              </td>
              <td className="pr-2" />
            </tr>
          ))
        : null}
    </>
  );
}
