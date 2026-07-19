import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import type { GoalInput, GoalsResponse } from "@/lib/types";

import { qk } from "./keys";

export function useGoals(enabled = true) {
  const query = useQuery({
    queryKey: qk.goals,
    enabled,
    retry: false,
    queryFn: () => api.get<GoalsResponse>("/v1/goals"),
  });
  const notDeployed =
    query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 501);
  return { ...query, notDeployed };
}

export function useCreateGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: GoalInput) => api.post("/v1/goals", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.goals }),
  });
}

export function useUpdateGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: Partial<GoalInput> }) =>
      api.patch(`/v1/goals/${vars.id}`, vars.input),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.goals }),
  });
}

export function useDeleteGoal() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/v1/goals/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: qk.goals }),
  });
}
