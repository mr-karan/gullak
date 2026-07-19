import { useEffect, useState } from "react";

import { fmtCentsSigned } from "@/lib/money";
import { useReconcileAccount } from "@/api/accounts";
import { toast } from "@/components/ui/sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Target {
  id: string;
  name: string;
}

/**
 * Reconcile flow (#42). Enter the bank's actual balance → the server computes
 * the cleared balance and the difference. A zero diff locks the cleared rows
 * outright. A non-zero diff is shown so the user can add a single adjustment
 * (which makes cleared == bank) and lock, or back out.
 */
export function ReconcileDialog({
  open,
  onOpenChange,
  account,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: Target | null;
}) {
  const [balance, setBalance] = useState("");
  const [diff, setDiff] = useState<number | null>(null);
  const [addAdjustment, setAddAdjustment] = useState(true);
  const reconcile = useReconcileAccount();

  // Reseed whenever the dialog opens for a different account.
  useEffect(() => {
    if (open) {
      setBalance("");
      setDiff(null);
      setAddAdjustment(true);
    }
  }, [open, account?.id]);

  if (!account) return null;

  const targetCents = Math.round(Number(balance || 0) * 100);
  const canCheck = balance.trim() !== "" && Number.isFinite(Number(balance));

  function check(e: React.FormEvent) {
    e.preventDefault();
    if (!account || !canCheck) return;
    // First pass without an adjustment: a zero diff locks immediately; a
    // non-zero diff is reported so we can offer the adjustment.
    reconcile.mutate(
      { accountId: account.id, targetBalanceCents: targetCents },
      {
        onSuccess: (r) => {
          if (r.locked) {
            toast.success(`Reconciled — ${r.reconciledCount} transaction(s) locked`);
            onOpenChange(false);
          } else {
            setDiff(r.diffCents);
          }
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Reconcile failed"),
      },
    );
  }

  function confirm() {
    if (!account) return;
    reconcile.mutate(
      { accountId: account.id, targetBalanceCents: targetCents, createAdjustment: true },
      {
        onSuccess: (r) => {
          toast.success(`Reconciled — adjustment added, ${r.reconciledCount + 1} locked`);
          onOpenChange(false);
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Reconcile failed"),
      },
    );
  }

  const pending = reconcile.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reconcile {account.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={check} className="flex flex-col gap-4">
          <div>
            <Label htmlFor="recon-balance">Bank balance (₹)</Label>
            <Input
              id="recon-balance"
              type="number"
              inputMode="decimal"
              step="0.01"
              value={balance}
              onChange={(e) => {
                setBalance(e.target.value);
                setDiff(null); // any edit invalidates the previous check
              }}
              placeholder="What the bank says today"
              className="mt-1.5 tnum"
              autoFocus
            />
            <p className="mt-1.5 text-xs text-ink-2">
              We compare this to the account's cleared balance and lock the matched rows.
            </p>
          </div>

          {diff !== null && diff !== 0 ? (
            <div className="rounded-md border border-rule bg-paper-2/50 p-3">
              <p className="text-sm text-ink">
                Off by{" "}
                <span className={diff < 0 ? "text-neg tnum" : "text-pos tnum"}>
                  {fmtCentsSigned(diff)}
                </span>
                .
              </p>
              <label className="mt-2 flex items-center gap-2 text-sm text-ink-2">
                <input
                  type="checkbox"
                  checked={addAdjustment}
                  onChange={(e) => setAddAdjustment(e.target.checked)}
                  className="size-4 accent-ink"
                />
                Add a {fmtCentsSigned(diff)} adjustment and lock
              </label>
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            {diff !== null && diff !== 0 ? (
              <Button type="button" onClick={confirm} disabled={pending || !addAdjustment}>
                {pending ? "Reconciling…" : "Reconcile"}
              </Button>
            ) : (
              <Button type="submit" disabled={pending || !canCheck}>
                {pending ? "Checking…" : "Check balance"}
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
