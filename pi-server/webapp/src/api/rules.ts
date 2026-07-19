import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import type { RuleInput, RulesResponse } from "@/lib/rulesTypes";

// Local query key — rules aren't in the shared src/api/keys.ts registry.
const rulesKey = ["rules"] as const;

export function useRules(enabled = true) {
  const query = useQuery({
    queryKey: rulesKey,
    enabled,
    retry: false,
    queryFn: () => api.get<RulesResponse>("/v1/rules"),
  });
  const notDeployed =
    query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 501);
  return { ...query, notDeployed };
}

export function useCreateRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RuleInput) => api.post("/v1/rules", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: rulesKey }),
  });
}

export function useUpdateRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; input: Partial<RuleInput> }) =>
      api.patch(`/v1/rules/${vars.id}`, vars.input),
    onSuccess: () => void client.invalidateQueries({ queryKey: rulesKey }),
  });
}

export function useDeleteRule() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/v1/rules/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: rulesKey }),
  });
}
