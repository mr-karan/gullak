import type { Goal } from "@/lib/types";

// Whole months from now until the goal's target month, floored at 1 so we never
// divide by zero and never promise the impossible ("this month").
export function monthsRemaining(targetDate: string | null): number {
  if (!targetDate) return 0;
  const now = new Date();
  const [y, m] = targetDate.split("-").map(Number);
  const months = (y - now.getFullYear()) * 12 + (m - 1 - now.getMonth());
  return Math.max(1, months);
}

// Plain arithmetic pace: what's still owed, spread over the months left. Zero
// once the goal is met or has no deadline.
export function monthlyNeedCents(g: Goal): number {
  if (!g.targetDate) return 0;
  const remaining = g.targetCents - g.currentCents;
  if (remaining <= 0) return 0;
  return Math.round(remaining / monthsRemaining(g.targetDate));
}

/** "Jul 2027" label for the target month. */
export function targetMonthLabel(targetDate: string | null): string {
  if (!targetDate) return "";
  const [y, m] = targetDate.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}
