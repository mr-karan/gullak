import { useState } from "react";
import { toast } from "sonner";

import { useCreateDesire } from "@/api/desires";
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

export function AddDesireDialog({
  open,
  onOpenChange,
  person,
  personName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: string | null;
  personName: string;
}) {
  const [title, setTitle] = useState("");
  const [estRupees, setEstRupees] = useState("");
  const [why, setWhy] = useState("");
  const create = useCreateDesire();

  const reset = () => {
    setTitle("");
    setEstRupees("");
    setWhy("");
  };

  const trimmedTitle = title.trim();
  const trimmedWhy = why.trim();
  const cents = Math.round(Number(estRupees) * 100);
  const valid =
    Boolean(trimmedTitle) && Boolean(trimmedWhy) && Number.isFinite(cents) && cents > 0 && Boolean(person);

  const submit = () => {
    if (!valid || !person) return;
    create.mutate(
      { person, title: trimmedTitle, estCostCents: cents, why: trimmedWhy },
      {
        onSuccess: () => {
          reset();
          onOpenChange(false);
          toast.success("Desire added.");
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add desire."),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New desire</DialogTitle>
          <DialogDescription>
            The why is the point — write down what makes this worth wanting.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desire-title">What is it</Label>
            <Input
              id="desire-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Standing desk"
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desire-cost">Est. cost (₹)</Label>
            <Input
              id="desire-cost"
              inputMode="decimal"
              value={estRupees}
              onChange={(e) => setEstRupees(e.target.value)}
              placeholder="18000"
              className="tnum"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="desire-why">Why do you want it</Label>
            <textarea
              id="desire-why"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="My back hurts by the afternoon and I'd sit less."
              rows={3}
              className="flex w-full rounded-md border border-input bg-paper px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            />
          </div>

          <p className="text-xs text-ink-2">Logged as {personName}.</p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!valid || create.isPending}>
            {create.isPending ? "Adding…" : "Add desire"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
