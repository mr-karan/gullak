import { useEffect, useState } from "react";

import type { Goal, GoalInput } from "@/lib/types";
import { useCreateGoal, useUpdateGoal } from "@/api/goals";
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

interface FormState {
  name: string;
  emoji: string;
  targetRupees: string;
  targetDate: string;
  notes: string;
}

function initial(goal: Goal | null): FormState {
  return {
    name: goal?.name ?? "",
    emoji: goal?.emoji ?? "🎯",
    targetRupees: goal?.targetCents ? String(Math.round(goal.targetCents / 100)) : "",
    targetDate: goal?.targetDate ?? "",
    notes: goal?.notes ?? "",
  };
}

// Create/edit a goal. Target amount is entered in RUPEES and converted to
// integer minor units at the submit boundary — the one place decimals turn into
// the app's canonical cents. Emoji is a free-text input, not a picker.
export function GoalDialog({
  open,
  onOpenChange,
  goal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: Goal | null;
}) {
  const [form, setForm] = useState<FormState>(() => initial(goal));
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const pending = create.isPending || update.isPending;

  // Reseed the form whenever the dialog opens for a different goal.
  useEffect(() => {
    if (open) setForm(initial(goal));
  }, [open, goal]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;

    const input: GoalInput = {
      name,
      emoji: form.emoji.trim() || null,
      targetCents: Math.round(Number(form.targetRupees || 0) * 100),
      targetDate: form.targetDate || null,
      notes: form.notes.trim() || null,
    };

    const onDone = {
      onSuccess: () => {
        toast.success("Goal saved");
        onOpenChange(false);
      },
      onError: (err: unknown) =>
        toast.error(err instanceof Error ? err.message : "Failed to save goal"),
    };

    if (goal) update.mutate({ id: goal.id, input }, onDone);
    else create.mutate(input, onDone);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex gap-3">
            <div className="w-16 shrink-0">
              <Label htmlFor="goal-emoji">Emoji</Label>
              <Input
                id="goal-emoji"
                value={form.emoji}
                onChange={(e) => set("emoji", e.target.value)}
                className="mt-1.5 text-center"
                maxLength={4}
              />
            </div>
            <div className="min-w-0 flex-1">
              <Label htmlFor="goal-name">Name</Label>
              <Input
                id="goal-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Emergency fund"
                className="mt-1.5"
                autoFocus
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="goal-target">Target (₹)</Label>
              <Input
                id="goal-target"
                type="number"
                inputMode="numeric"
                min="0"
                value={form.targetRupees}
                onChange={(e) => set("targetRupees", e.target.value)}
                placeholder="500000"
                className="mt-1.5 tnum"
              />
            </div>
            <div>
              <Label htmlFor="goal-date">Target date</Label>
              <Input
                id="goal-date"
                type="date"
                value={form.targetDate}
                onChange={(e) => set("targetDate", e.target.value)}
                className="mt-1.5"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="goal-notes">Notes</Label>
            <Input
              id="goal-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="Optional"
              className="mt-1.5"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !form.name.trim()}>
              {pending ? "Saving…" : "Save goal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
