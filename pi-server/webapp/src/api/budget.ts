import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";

// YNAB-style envelope plan. The server computes assigned/activity/available per
// category plus Ready-to-Assign for a month; GET /plan and POST /assign both
// return the SAME BudgetPlan, so an assign refreshes the whole month atomically.

export interface BudgetCategoryPlan {
  categoryId: string;
  categoryName: string;
  assignedCents: number;
  activityCents: number;
  availableCents: number;
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
