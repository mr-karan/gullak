import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import type { HoldingsImportResult, HoldingsResponse } from "@/lib/types";

import { qk } from "./keys";

export function useHoldings(enabled = true) {
  const query = useQuery({
    queryKey: qk.holdings,
    enabled,
    retry: false,
    queryFn: () => api.get<HoldingsResponse>("/v1/holdings"),
  });
  const notDeployed =
    query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 501);
  return { ...query, notDeployed };
}

export function useImportHoldings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => api.upload<HoldingsImportResult>("/v1/holdings/import", file),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.holdings });
      void client.invalidateQueries({ queryKey: qk.netWorth });
    },
  });
}

export function usePatchHolding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; patch: { stale?: boolean; goalId?: string | null } }) =>
      api.patch(`/v1/holdings/${vars.id}`, vars.patch),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.holdings });
      void client.invalidateQueries({ queryKey: qk.goals });
    },
  });
}

export function useDeleteHolding() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/v1/holdings/${id}`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: qk.holdings });
    },
  });
}
