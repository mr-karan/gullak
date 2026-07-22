import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  NotesMode,
  Rule,
  RuleAction,
  RuleCondition,
  RuleInput,
  RuleStage,
  MatchMode,
} from "@/lib/rulesTypes";
import { useRules, useCreateRule, useUpdateRule, useDeleteRule } from "@/api/rules";
import { useConnection } from "@/hooks/useConnection";
import { PageHeader } from "@/components/PageHeader";
import { Panel } from "@/components/Panel";
import { Pill, type PillTone } from "@/components/Pill";
import { EmptyState, ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── option tables ────────────────────────────────────────────────────────────

const FIELD_OPTIONS = [
  { value: "payee", label: "Payee" },
  { value: "amount", label: "Amount" },
  { value: "date", label: "Date" },
  { value: "account", label: "Account" },
  { value: "category", label: "Category" },
  { value: "payeeId", label: "Payee ID" },
  { value: "smsBody", label: "SMS body" },
] as const;

const OPS_BY_FIELD: Record<string, { value: string; label: string }[]> = {
  payee: [
    { value: "is", label: "is" },
    { value: "isNot", label: "is not" },
    { value: "contains", label: "contains" },
    { value: "oneOf", label: "is one of" },
    { value: "matches", label: "matches (regex)" },
  ],
  amount: [
    { value: "is", label: "is" },
    { value: "isapprox", label: "is approx (±7.5%)" },
    { value: "gt", label: "greater than" },
    { value: "lt", label: "less than" },
    { value: "between", label: "between" },
    { value: "inflow", label: "is inflow" },
    { value: "outflow", label: "is outflow" },
  ],
  date: [
    { value: "is", label: "is" },
    { value: "month", label: "in month (1-12)" },
    { value: "year", label: "in year" },
  ],
  account: [
    { value: "is", label: "is" },
    { value: "oneOf", label: "is one of" },
  ],
  category: [
    { value: "is", label: "is" },
    { value: "oneOf", label: "is one of" },
  ],
  payeeId: [
    { value: "is", label: "is" },
    { value: "oneOf", label: "is one of" },
  ],
  smsBody: [
    { value: "is", label: "is" },
    { value: "isNot", label: "is not" },
    { value: "contains", label: "contains" },
    { value: "oneOf", label: "is one of" },
    { value: "matches", label: "matches (regex)" },
  ],
};

const ACTION_OPTIONS = [
  { value: "set_payee", label: "Set payee" },
  { value: "set_account", label: "Set account (id)" },
  { value: "set_category", label: "Set category (id)" },
  { value: "set_notes", label: "Set notes" },
] as const;

// Ops that take no value input.
const VALUELESS_OPS = new Set(["inflow", "outflow"]);
const NUMERIC_FIELDS = new Set(["amount"]);

function valuePlaceholder(field: string, op: string): string {
  if (op === "oneOf") return "comma,separated,values";
  if (op === "between") return "lo,hi";
  if (op === "matches") return "regex, e.g. ^amazon";
  if (field === "amount") return "minor units, e.g. -50000";
  if (field === "date" && op === "month") return "1-12";
  if (field === "date" && op === "year") return "2026";
  return "value";
}

// ── form <-> API value conversion ────────────────────────────────────────────

interface CondRow {
  field: string;
  op: string;
  value: string; // raw text; typed at submit
}

interface ActionRow {
  type: "set_payee" | "set_account" | "set_category" | "set_notes";
  value: string;
  mode: NotesMode;
}

function condValueToRaw(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(",");
  return String(value);
}

function rawToCondValue(field: string, op: string, raw: string): unknown {
  if (VALUELESS_OPS.has(op)) return undefined;
  if (op === "oneOf") {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (op === "between") {
    return raw.split(",").map((s) => Number(s.trim()));
  }
  if (NUMERIC_FIELDS.has(field) || (field === "date" && (op === "month" || op === "year"))) {
    return Number(raw);
  }
  return raw;
}

function ruleToRows(rule: Rule | null): {
  name: string;
  stage: RuleStage;
  priority: string;
  match: MatchMode;
  conditions: CondRow[];
  actions: ActionRow[];
} {
  if (!rule) {
    return {
      name: "",
      stage: "main",
      priority: "100",
      match: "all",
      conditions: [{ field: "payee", op: "contains", value: "" }],
      actions: [{ type: "set_category", value: "", mode: "replace" }],
    };
  }
  return {
    name: rule.name,
    stage: rule.stage,
    priority: String(rule.priority),
    match: rule.triggerPayload.match,
    conditions: rule.triggerPayload.conditions.map((c) => ({
      field: c.field,
      op: c.op,
      value: condValueToRaw(c.value),
    })),
    actions: rule.actionPayload.actions.map((a) =>
      a.type === "set_notes"
        ? { type: "set_notes", value: a.value.text, mode: a.value.mode }
        : { type: a.type, value: a.value, mode: "replace" },
    ),
  };
}

// ── page ─────────────────────────────────────────────────────────────────────

export function RulesPage() {
  const { connected, openDialog } = useConnection();
  const rulesQ = useRules(connected);
  const deleteM = useDeleteRule();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Rule | null>(null);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(rule: Rule) {
    setEditing(rule);
    setDialogOpen(true);
  }

  const newButton = (
    <Button onClick={openCreate}>
      <Plus className="size-4" />
      New rule
    </Button>
  );

  if (!connected) {
    return (
      <>
        <PageHeader title="Rules" />
        <EmptyState
          title="Not connected."
          hint="Add your pi-server API key to manage your rules."
          action={{ label: "Connect", onClick: openDialog }}
        />
      </>
    );
  }

  if (rulesQ.notDeployed) {
    return (
      <>
        <PageHeader title="Rules" subtitle="Normalize and categorize transactions automatically." />
        <EmptyState
          title="Rules aren't available on this server."
          hint="The rules module isn't deployed to your pi-server yet."
        />
      </>
    );
  }

  const rules = rulesQ.data?.rules ?? [];

  return (
    <>
      <PageHeader
        title="Rules"
        subtitle="Normalize and categorize transactions before they reach your inbox."
        actions={newButton}
      />

      {rulesQ.isError ? (
        <ErrorState message={rulesQ.error?.message} onRetry={() => void rulesQ.refetch()} />
      ) : rulesQ.isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-16 w-full rounded-lg" />
        </div>
      ) : rules.length === 0 ? (
        <EmptyState
          title="No rules yet — teach Gullak how to tidy your transactions."
          action={{ label: "New rule", onClick: openCreate }}
        />
      ) : (
        <Panel
          title="Rules"
          right={
            <span className="text-xs tabular-nums text-ink-2">
              {rules.length} {rules.length === 1 ? "rule" : "rules"}
            </span>
          }
        >
          <ul className="divide-y divide-rule">
            {rules.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                onEdit={() => openEdit(rule)}
                onDelete={() =>
                  deleteM.mutate(rule.id, {
                    onSuccess: () => toast.success("Rule deleted"),
                    onError: (err) =>
                      toast.error(err instanceof Error ? err.message : "Couldn't delete rule"),
                  })
                }
              />
            ))}
          </ul>
        </Panel>
      )}

      <RuleDialog open={dialogOpen} onOpenChange={setDialogOpen} rule={editing} />
    </>
  );
}

const STAGE_TONE: Record<RuleStage, PillTone> = {
  pre: "warn",
  main: "neutral",
  post: "pos",
};

function RuleRow({
  rule,
  onEdit,
  onDelete,
}: {
  rule: Rule;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateRule();
  const nCond = rule.triggerPayload.conditions.length;
  const nAct = rule.actionPayload.actions.length;

  if (!rule.valid) {
    return (
      <li className="flex items-center gap-3 bg-pill-neg-bg px-4 py-3 text-pill-neg-ink">
        <span className="rounded-md border border-current px-2 py-0.5 text-xs font-semibold">Invalid</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{rule.name}</p>
          <p className="mt-0.5 truncate text-xs">{rule.validationErrors.join(" · ")}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onDelete} aria-label={`Delete ${rule.name}`}>
          <Trash2 className="size-4" />
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-paper-2/60">
      <button
        type="button"
        aria-pressed={rule.enabled}
        title={rule.enabled ? "Enabled — click to disable" : "Disabled — click to enable"}
        onClick={() =>
          update.mutate(
            { id: rule.id, input: { enabled: !rule.enabled } },
            {
              onError: (err) =>
                toast.error(err instanceof Error ? err.message : "Couldn't toggle rule"),
            },
          )
        }
        className={cn(
          "shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          rule.enabled
            ? "bg-pill-pos-bg text-pill-pos-ink"
            : "border border-rule text-ink-2 hover:text-ink",
        )}
      >
        {rule.enabled ? "On" : "Off"}
      </button>

      <button
        type="button"
        onClick={onEdit}
        className="min-w-0 flex-1 rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-ink">{rule.name}</span>
          <Pill tone={STAGE_TONE[rule.stage]}>{rule.stage}</Pill>
        </div>
        <p className="mt-0.5 text-xs text-ink-2">
          priority {rule.priority} · {rule.triggerPayload.match} of {nCond}{" "}
          condition{nCond === 1 ? "" : "s"} · {nAct} action{nAct === 1 ? "" : "s"}
        </p>
      </button>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDelete}
        aria-label={`Delete ${rule.name}`}
        className="shrink-0 text-ink-2 hover:text-neg"
      >
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

// ── create / edit dialog ─────────────────────────────────────────────────────

function RuleDialog({
  open,
  onOpenChange,
  rule,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rule: Rule | null;
}) {
  const [form, setForm] = useState(() => ruleToRows(rule));
  const create = useCreateRule();
  const update = useUpdateRule();
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (open) setForm(ruleToRows(rule));
  }, [open, rule]);

  function setCond(i: number, patch: Partial<CondRow>) {
    setForm((f) => ({
      ...f,
      conditions: f.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)),
    }));
  }
  function setAction(i: number, patch: Partial<ActionRow>) {
    setForm((f) => ({
      ...f,
      actions: f.actions.map((a, j) => (j === i ? { ...a, ...patch } : a)),
    }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;

    const conditions: RuleCondition[] = form.conditions
      .filter((c) => c.field && c.op)
      .map((c) => {
        const value = rawToCondValue(c.field, c.op, c.value);
        return value === undefined ? { field: c.field, op: c.op } : { field: c.field, op: c.op, value };
      });

    const actions: RuleAction[] = form.actions
      .filter((a) => (a.type === "set_notes" ? a.value.trim() : a.value.trim()))
      .map((a) =>
        a.type === "set_notes"
          ? { type: "set_notes", value: { mode: a.mode, text: a.value } }
          : { type: a.type, value: a.value.trim() },
      );

    const priority = Number(form.priority);
    const input: RuleInput = {
      name,
      stage: form.stage,
      priority: Number.isFinite(priority) ? priority : 100,
      triggerPayload: { match: form.match, conditions },
      actionPayload: { actions },
    };

    const onDone = {
      onSuccess: () => {
        toast.success("Rule saved");
        onOpenChange(false);
      },
      onError: (err: unknown) =>
        toast.error(err instanceof Error ? err.message : "Failed to save rule"),
    };

    if (rule) update.mutate({ id: rule.id, input }, onDone);
    else create.mutate(input, onDone);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit rule" : "New rule"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="rule-name">Name</Label>
              <Input
                id="rule-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Blinkit → Groceries"
                className="mt-1.5"
                autoFocus
                required
              />
            </div>
            <div>
              <Label>Stage</Label>
              <Select value={form.stage} onValueChange={(v) => setForm((f) => ({ ...f, stage: v as RuleStage }))}>
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pre">pre</SelectItem>
                  <SelectItem value="main">main</SelectItem>
                  <SelectItem value="post">post</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="rule-priority">Priority</Label>
              <Input
                id="rule-priority"
                type="number"
                value={form.priority}
                onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}
                className="mt-1.5 tnum"
              />
            </div>
          </div>

          {/* Conditions */}
          <div className="flex flex-col gap-2 border-t border-rule pt-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">
                When
              </span>
              <Select value={form.match} onValueChange={(v) => setForm((f) => ({ ...f, match: v as MatchMode }))}>
                <SelectTrigger className="h-7 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">match all</SelectItem>
                  <SelectItem value="any">match any</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {form.conditions.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Select
                  value={c.field}
                  onValueChange={(v) =>
                    setCond(i, { field: v, op: OPS_BY_FIELD[v]?.[0]?.value ?? "is", value: "" })
                  }
                >
                  <SelectTrigger className="w-28 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={c.op} onValueChange={(v) => setCond(i, { op: v })}>
                  <SelectTrigger className="w-32 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(OPS_BY_FIELD[c.field] ?? []).map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {VALUELESS_OPS.has(c.op) ? (
                  <div className="min-w-0 flex-1" />
                ) : (
                  <Input
                    value={c.value}
                    onChange={(e) => setCond(i, { value: e.target.value })}
                    placeholder={valuePlaceholder(c.field, c.op)}
                    className="min-w-0 flex-1"
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove condition"
                  onClick={() =>
                    setForm((f) => ({ ...f, conditions: f.conditions.filter((_, j) => j !== i) }))
                  }
                  className="shrink-0 text-ink-2 hover:text-neg"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  conditions: [...f.conditions, { field: "payee", op: "contains", value: "" }],
                }))
              }
              className="self-start text-ink-2"
            >
              <Plus className="size-4" /> Add condition
            </Button>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2 border-t border-rule pt-3">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-2">Then</span>
            {form.actions.map((a, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Select
                  value={a.type}
                  onValueChange={(v) => setAction(i, { type: v as ActionRow["type"] })}
                >
                  <SelectTrigger className="w-40 shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACTION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {a.type === "set_notes" ? (
                  <Select value={a.mode} onValueChange={(v) => setAction(i, { mode: v as NotesMode })}>
                    <SelectTrigger className="w-28 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="replace">replace</SelectItem>
                      <SelectItem value="append">append</SelectItem>
                      <SelectItem value="prepend">prepend</SelectItem>
                    </SelectContent>
                  </Select>
                ) : null}
                <Input
                  value={a.value}
                  onChange={(e) => setAction(i, { value: e.target.value })}
                  placeholder={a.type === "set_category" ? "category id" : a.type === "set_account" ? "account id" : a.type === "set_payee" ? "payee name" : "notes text"}
                  className="min-w-0 flex-1"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label="Remove action"
                  onClick={() =>
                    setForm((f) => ({ ...f, actions: f.actions.filter((_, j) => j !== i) }))
                  }
                  className="shrink-0 text-ink-2 hover:text-neg"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() =>
                setForm((f) => ({
                  ...f,
                  actions: [...f.actions, { type: "set_category", value: "", mode: "replace" }],
                }))
              }
              className="self-start text-ink-2"
            >
              <Plus className="size-4" /> Add action
            </Button>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !form.name.trim() || form.actions.length === 0}>
              {pending ? "Saving…" : "Save rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
