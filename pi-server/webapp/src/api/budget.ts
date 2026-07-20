import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";

// YNAB-style envelope plan. The server computes assigned/activity/available per
// category plus Ready-to-Assign for a month; GET /plan and POST /assign both
// return the SAME BudgetPlan, so an assign refreshes the whole month atomically.

/** A category's funding goal. Monthly targets refill each month; by_date targets
    reach a total by a deadline. Money is integer minor units. */
export interface BudgetTarget {
  type: "monthly" | "by_date";
  amountCents: number;
  byDate: string | null; // "YYYY-MM-DD", present only for by_date targets
}

export interface BudgetTargetRow extends BudgetTarget {
  categoryId: string;
  createdAt: number;
  updatedAt: number;
}

export interface BudgetCategoryPlan {
  categoryId: string;
  categoryName: string;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
  // --- Phase-2 (targets + upcoming), all present on GET /plan -------------
  target: BudgetTarget | null;
  targetNeededCents: number; // >=0 still-needed this month to hit the target
  targetStatus: "funded" | "underfunded" | "none";
  upcomingCents: number; // >=0 scheduled outflows still upcoming this month
}

export interface BudgetGroupPlan {
  groupId: string;
  groupName: string;
  categories: BudgetCategoryPlan[];
}

export interface BudgetPlan {
  month: string; // YYYY-MM
  readyToAssign: number;
  groups: BudgetGroupPlan[];
}

/** Local key so the assign mutation can write/invalidate a single month. */
const budgetKey = (month: string) => ["budget", month] as const;

export function useBudgetPlan(month: string, enabled = true) {
  return useQuery({
    queryKey: budgetKey(month),
    enabled,
    queryFn: () =>
      api.get<BudgetPlan>(`/v1/budget/plan?month=${encodeURIComponent(month)}`),
  });
}

/**
 * Assign (or reassign) an envelope. The POST returns the refreshed plan for the
 * month; we write it straight into the cache (setQueryData) for an optimistic
 * feel, then invalidate so it settles against the server.
 */
export function useAssignBudget() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { categoryId: string; month: string; assignedCents: number }) =>
      api.post<BudgetPlan>("/v1/budget/assign", vars),
    onSuccess: (plan, vars) => {
      client.setQueryData(budgetKey(vars.month), plan);
      void client.invalidateQueries({ queryKey: budgetKey(vars.month) });
    },
  });
}

// --- Targets ---------------------------------------------------------------
// Targets aren't month-scoped, but changing one shifts every month's plan
// (needed/status), so both mutations invalidate the whole ["budget"] tree.

export interface UpsertTargetVars {
  categoryId: string;
  type: "monthly" | "by_date";
  amountCents: number; // integer minor units, > 0
  byDate?: string; // "YYYY-MM-DD", required when type === "by_date"
}

/** PUT /v1/budget/targets/:categoryId — create or replace a category's target. */
export function useUpsertTarget() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, ...body }: UpsertTargetVars) =>
      api.put<{ target: BudgetTargetRow }>(
        `/v1/budget/targets/${encodeURIComponent(categoryId)}`,
        body,
      ),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["budget"] }),
  });
}

/** DELETE /v1/budget/targets/:categoryId — clear a category's target (204). */
export function useDeleteTarget() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) =>
      api.del<null>(`/v1/budget/targets/${encodeURIComponent(categoryId)}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["budget"] }),
  });
}

// --- Age of money ----------------------------------------------------------
// An M-phase readout that may not be deployed on older servers (404/501);
// callers treat the `notDeployed` flag as "just hide the stat".

export interface AgeOfMoney {
  days: number | null;
}

export function useAgeOfMoney(enabled = true) {
  const query = useQuery({
    queryKey: ["age-of-money"],
    enabled,
    retry: false,
    queryFn: () => api.get<AgeOfMoney>("/v1/budget/age-of-money"),
  });
  const notDeployed =
    query.error instanceof ApiError &&
    (query.error.status === 404 || query.error.status === 501);
  return { ...query, notDeployed };
}
