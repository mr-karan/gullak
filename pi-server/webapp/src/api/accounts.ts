import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { AccountsResponse, ReconcileResult } from "@/lib/types";

import { qk } from "./keys";

export function useAccounts(enabled = true) {
  return useQuery({
    queryKey: qk.accounts,
    enabled,
    queryFn: () => api.get<AccountsResponse>("/v1/accounts"),
    select: (d) => d.accounts,
  });
}

/**
 * Reconcile (#42): submit the bank's actual balance for an account. With
 * createAdjustment the server may create a single adjustment txn and lock the
 * cleared rows; without it, a non-zero diff is just reported. Invalidates the
 * account, transaction, and summary caches so locks/adjustments show up.
 */
export function useReconcileAccount() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      accountId: string;
      targetBalanceCents: number;
      createAdjustment?: boolean;
      asOf?: string;
    }) =>
      api.post<ReconcileResult>(`/v1/accounts/${vars.accountId}/reconcile`, {
        targetBalanceCents: vars.targetBalanceCents,
        createAdjustment: vars.createAdjustment,
        asOf: vars.asOf,
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["accounts"] });
      void client.invalidateQueries({ queryKey: ["transactions"] });
      void client.invalidateQueries({ queryKey: ["summary"] });
    },
  });
}
