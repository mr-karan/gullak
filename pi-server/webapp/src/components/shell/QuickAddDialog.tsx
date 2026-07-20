import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useAccounts } from "@/api/accounts";
import { useCategories } from "@/api/categories";
import { useCreateTransaction } from "@/api/transactions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// shadcn SelectItem cannot use an empty-string value, so the "no category"
// option needs a sentinel that we map back to null on submit.
const NO_CATEGORY = "__none__";

type Sign = "expense" | "income";

/** Local "YYYY-MM-DD" — never toISOString (UTC can be off by a day). */
function todayLocal(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function QuickAddDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const accounts = useAccounts();
  const categories = useCategories();
  const create = useCreateTransaction();

  const activeAccounts = (accounts.data ?? []).filter((a) => !a.archived);

  const [amount, setAmount] = useState("");
  const [sign, setSign] = useState<Sign>("expense");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState<string>(NO_CATEGORY);
  const [payee, setPayee] = useState("");
  const [date, setDate] = useState(todayLocal());
  const [notes, setNotes] = useState("");

  // Reset to defaults whenever the dialog transitions to open.
  useEffect(() => {
    if (!open) return;
    setAmount("");
    setSign("expense");
    setCategoryId(NO_CATEGORY);
    setPayee("");
    setDate(todayLocal());
    setNotes("");
    setAccountId(activeAccounts[0]?.id ?? "");
  }, [open]);

  // Default the account once it loads (e.g. dialog opened before fetch settled).
  useEffect(() => {
    if (open && !accountId && activeAccounts[0]) setAccountId(activeAccounts[0].id);
  }, [open, accountId, accounts.data]);

  const parsed = parseFloat(amount);
  const amountValid = amount.trim() !== "" && Number.isFinite(parsed);
  const canSubmit = amountValid && Boolean(accountId) && !create.isPending;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const magnitude = Math.round(parsed * 100);
    const amountCents = sign === "expense" ? -magnitude : magnitude;
    create.mutate(
      {
        accountId,
        amountCents,
        date,
        categoryId: categoryId === NO_CATEGORY ? null : categoryId,
        payeeName: payee.trim() || null,
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setAmount("");
          setSign("expense");
          setCategoryId(NO_CATEGORY);
          setPayee("");
          setDate(todayLocal());
          setNotes("");
          setAccountId(activeAccounts[0]?.id ?? "");
          toast.success("Transaction added");
        },
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Could not add transaction"),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Log an expense</DialogTitle>
          <DialogDescription>
            Record a transaction against one of your accounts.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qa-amount">Amount (₹)</Label>
            <Tabs value={sign} onValueChange={(v) => setSign(v as Sign)}>
              <TabsList className="w-full">
                <TabsTrigger value="expense" className="flex-1">
                  Expense
                </TabsTrigger>
                <TabsTrigger value="income" className="flex-1">
                  Income
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Input
              id="qa-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="tnum"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qa-account">Account</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger id="qa-account">
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {activeAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qa-category">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger id="qa-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>— None —</SelectItem>
                {(categories.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qa-payee">Payee</Label>
            <Input
              id="qa-payee"
              placeholder="Who did you pay?"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qa-date">Date</Label>
            <Input
              id="qa-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="tnum"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="qa-notes">Notes</Label>
            <Input
              id="qa-notes"
              placeholder="Optional note"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button type="submit" disabled={!canSubmit}>
              {create.isPending ? "Adding…" : "Add transaction"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
