import type { ReactNode } from "react";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { RANGE_OPTIONS, type CatGroup, type RangeKey } from "./filters";

const ALL = "all";

export interface FilterState {
  rangeKey: RangeKey;
  customStart: string;
  customEnd: string;
  accountId: string | null;
  categoryId: string | null;
  uncategorizedOnly: boolean;
  search: string;
}

export interface FilterControlsProps extends FilterState {
  accounts: { id: string; name: string }[];
  categoryGroups: CatGroup[];
  showAccount: boolean;
  layout: "bar" | "sheet";
  onRange: (key: RangeKey) => void;
  onCustom: (which: "start" | "end", value: string) => void;
  onAccount: (id: string | null) => void;
  onCategory: (id: string | null) => void;
  onToggleUncategorized: () => void;
  onSearch: (value: string) => void;
}

function Field({
  label,
  layout,
  className,
  children,
}: {
  label: string;
  layout: "bar" | "sheet";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <span className={cn("text-xs text-ink-2", layout === "bar" && "sr-only")}>{label}</span>
      {children}
    </div>
  );
}

export function FilterControls(props: FilterControlsProps) {
  const {
    rangeKey,
    customStart,
    customEnd,
    accountId,
    categoryId,
    uncategorizedOnly,
    search,
    accounts,
    categoryGroups,
    showAccount,
    layout,
    onRange,
    onCustom,
    onAccount,
    onCategory,
    onToggleUncategorized,
    onSearch,
  } = props;

  const bar = layout === "bar";
  const selectWidth = bar ? "w-40" : "w-full";

  return (
    <div className={cn(bar ? "flex flex-wrap items-end gap-2" : "flex flex-col gap-4")}>
      <Field label="Period" layout={layout}>
        <Select value={rangeKey} onValueChange={(v) => onRange(v as RangeKey)}>
          <SelectTrigger className={bar ? "w-36" : "w-full"}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RANGE_OPTIONS.map((o) => (
              <SelectItem key={o.key} value={o.key}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {rangeKey === "custom" ? (
        <div className={cn("flex items-end gap-2", !bar && "w-full")}>
          <Field label="Start" layout={layout} className={bar ? undefined : "flex-1"}>
            <Input
              type="date"
              value={customStart}
              max={customEnd || undefined}
              onChange={(e) => onCustom("start", e.target.value)}
              className={bar ? "w-40" : "w-full"}
            />
          </Field>
          <Field label="End" layout={layout} className={bar ? undefined : "flex-1"}>
            <Input
              type="date"
              value={customEnd}
              min={customStart || undefined}
              onChange={(e) => onCustom("end", e.target.value)}
              className={bar ? "w-40" : "w-full"}
            />
          </Field>
        </div>
      ) : null}

      {showAccount ? (
        <Field label="Account" layout={layout}>
          <Select
            value={accountId ?? ALL}
            onValueChange={(v) => onAccount(v === ALL ? null : v)}
          >
            <SelectTrigger className={selectWidth}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      <Field label="Category" layout={layout}>
        <Select
          value={categoryId ?? ALL}
          onValueChange={(v) => onCategory(v === ALL ? null : v)}
        >
          <SelectTrigger className={selectWidth}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All categories</SelectItem>
            {categoryGroups.map((g) => (
              <SelectGroup key={g.group}>
                <SelectLabel>{g.group}</SelectLabel>
                {g.categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field label="Search" layout={layout} className={bar ? "min-w-[11rem] flex-1" : undefined}>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-2" />
          <Input
            type="search"
            value={search}
            placeholder="Payee, notes, location"
            onChange={(e) => onSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </Field>

      <Field label="Only" layout={layout}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={uncategorizedOnly}
          onClick={onToggleUncategorized}
          className={cn(
            "gap-1.5 border border-transparent",
            uncategorizedOnly
              ? "border-warn/40 bg-pill-warn-bg text-pill-warn-ink hover:bg-pill-warn-bg"
              : "text-ink-2 hover:text-ink",
            !bar && "w-full justify-start",
          )}
        >
          <span className="size-1.5 rounded-full bg-warn" />
          Uncategorized
        </Button>
      </Field>
    </div>
  );
}
