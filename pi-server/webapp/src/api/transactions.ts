import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { DateRange } from "@/lib/dates";
import type { TransactionsResponse } from "@/lib/types";

import { qk } from "./keys";

const LIMIT = 1000;

function txnPath(range: DateRange, accountId?: string): string {
  const p = new URLSearchParams({
    startDate: range.startDate,
    endDate: range.endDate,
    limit: String(LIMIT),
  });
  if (accountId) p.set("accountId", accountId);
  return `/v1/transactions?${p.toString()}`;
}

export function useTransactions(range: DateRange, accountId?: string, enabled = true) {
  return useQuery({
    queryKey: qk.transactions(range, accountId),
    enabled,
    queryFn: () => api.get<TransactionsResponse>(txnPath(range, accountId)),
    select: (d) => ({ transactions: d.transactions, capped: d.transactions.length >= LIMIT }),
    // Keep showing the previous rows while a new range/account loads —
    // otherwise every filter change flashes the skeleton.
    placeholderData: (prev) => prev,
  });
}

export function usePatchTransactionCategory() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { id: string; categoryId: string | null }) =>
      api.patch(`/v1/transactions/${vars.id}`, { categoryId: vars.categoryId }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

/** Group N independent txns (#46) under one zero-amount parent. */
export function useGroupTransactions() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      ids: string[];
      date: string;
      payeeName?: string;
      categoryId?: string | null;
    }) => api.post(`/v1/transactions/group`, vars),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}

/** Ungroup a group parent: unlink its children and delete the parent. */
export function useUngroup() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (parentId: string) =>
      api.post(`/v1/transactions/ungroup/${parentId}`, {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["transactions"] });
    },
  });
}
