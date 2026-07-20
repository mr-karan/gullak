import { useEffect, useState } from "react";

import { useDeleteTarget, useUpsertTarget, type BudgetTarget } from "@/api/budget";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Target {
  id: string;
  name: string;
  target: BudgetTarget | null;
}

/** Rupees string -> integer minor units, or null when not a positive number. */
function rupeesToCents(raw: string): number | null {
  const v = Number(raw.trim());
  if (!Number.isFinite(v) || v <= 0) return null;
  return Math.round(v * 100);
}

function centsToRupees(cents: number): string {
  const r = cents / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}

/**
 * Set, change, or remove a category's funding target. Monthly targets refill the
 * envelope every month; by-date targets aim for a total by a deadline. Save →
 * useUpsertTarget; "Remove target" → useDeleteTarget. Keyboard-accessible and
 * tokens-only, matching ReconcileDialog's language.
 */
export function TargetDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: Target | null;
}) {
  const [type, setType] = useState<"monthly" | "by_date">("monthly");
  const [amount, setAmount] = useState("");
  const [byDate, setByDate] = useState("");
  const upsert = useUpsertTarget();
  const remove = useDeleteTarget();

  // Reseed from the existing target whenever the dialog opens for a category.
  useEffect(() => {
    if (!open) return;
    const t = category?.target;
    setType(t?.type ?? "monthly");
    setAmount(t ? centsToRupees(t.amountCents) : "");
    setByDate(t?.byDate ?? "");
  }, [open, category?.id, category?.target]);

  if (!category) return null;

  const cents = rupeesToCents(amount);
  const needsDate = type === "by_date";
  const canSave = cents !== null && (!needsDate || byDate.trim() !== "");
  const pending = upsert.isPending || remove.isPending;

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!category || cents === null || !canSave) return;
    upsert.mutate(
      {
        categoryId: category.id,
        type,
        amountCents: cents,
        ...(needsDate ? { byDate: byDate.trim() } : {}),
      },
      {
        onSuccess: () => {
          toast.success(`Target set for ${category.name}`);
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Could not save target"),
      },
    );
  }

  function clear() {
    if (!category) return;
    remove.mutate(category.id, {
      onSuccess: () => {
        toast.success(`Target removed from ${category.name}`);
        onOpenChange(false);
      },
      onError: (err) =>
        toast.error(err instanceof Error ? err.message : "Could not remove target"),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Target — {category.name}</DialogTitle>
          <DialogDescription>
            Give this envelope a funding goal. We'll show what's still needed each month.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="target-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as "monthly" | "by_date")}>
              <SelectTrigger id="target-type" className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly — refill every month</SelectItem>
                <SelectItem value="by_date">By date — reach a total by a deadline</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="target-amount">Amount (₹)</Label>
            <Input
              id="target-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={type === "monthly" ? "Per-month goal" : "Total to reach"}
              className="mt-1.5 tnum"
              autoFocus
            />
          </div>

          {needsDate ? (
            <div>
              <Label htmlFor="target-date">By</Label>
              <Input
                id="target-date"
                type="date"
                value={byDate}
                onChange={(e) => setByDate(e.target.value)}
                className="mt-1.5 tnum"
              />
            </div>
          ) : null}

          <DialogFooter className="sm:justify-between">
            {category.target ? (
              <Button
                type="button"
                variant="ghost"
                className="text-neg hover:text-neg"
                onClick={clear}
                disabled={pending}
              >
                Remove target
              </Button>
            ) : (
              <span className="hidden sm:block" />
            )}
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !canSave}>
                {upsert.isPending ? "Saving…" : "Save target"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
