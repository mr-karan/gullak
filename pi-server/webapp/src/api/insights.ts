import { useQuery } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import type { DateRange } from "@/lib/dates";
import type { Transaction } from "@/lib/types";

// Local query keys + types. Insights endpoints are M5 read-only surfaces that
// may not be deployed on an older pi-server, so every hook exposes a
// `notDeployed` flag (mirrors src/api/networth.ts) and the sections collapse to
// nothing when it's set.

export interface NetWorthHistoryPoint {
  month: string; // YYYY-MM
  cashCents: number;
  investedCents: number;
  totalCents: number;
}

export interface CashFlowPoint {
  month: string; // YYYY-MM
  incomeCents: number; // positive
  expenseCents: number; // negative (sum of outflows)
  netCents: number;
}

export interface NewPayeeRow {
  payeeId: string;
  payeeName: string | null;
  firstDate: string; // YYYY-MM-DD
  firstAmountCents: number;
  periodTotalCents: number;
  txnCount: number;
}

const ik = {
  netWorthHistory: (months: number) => ["insights", "net-worth-history", months] as const,
  cashFlow: (months: number) => ["insights", "cash-flow", months] as const,
  topSpends: (range: DateRange, accountId?: string, limit?: number) =>
    ["insights", "top-spends", range, accountId ?? null, limit ?? null] as const,
  newPayees: (range: DateRange) => ["insights", "new-payees", range] as const,
};

function isNotDeployed(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 404 || error.status === 501);
}

export function useNetWorthHistory(months = 12, enabled = true) {
  const query = useQuery({
    queryKey: ik.netWorthHistory(months),
    enabled,
    retry: false,
    queryFn: () =>
      api.get<{ history: NetWorthHistoryPoint[] }>(
        `/v1/insights/net-worth-history?months=${months}`,
      ),
  });
  return { ...query, notDeployed: isNotDeployed(query.error) };
}

export function useCashFlow(months = 12, enabled = true) {
  const query = useQuery({
    queryKey: ik.cashFlow(months),
    enabled,
    retry: false,
    queryFn: () =>
      api.get<{ series: CashFlowPoint[] }>(`/v1/insights/cash-flow?months=${months}`),
  });
  return { ...query, notDeployed: isNotDeployed(query.error) };
}

function rangePath(base: string, range: DateRange, extra?: Record<string, string>): string {
  const p = new URLSearchParams({ startDate: range.startDate, endDate: range.endDate });
  for (const [k, v] of Object.entries(extra ?? {})) p.set(k, v);
  return `${base}?${p.toString()}`;
}

export function useTopSpends(
  range: DateRange,
  accountId?: string,
  limit = 10,
  enabled = true,
) {
  const query = useQuery({
    queryKey: ik.topSpends(range, accountId, limit),
    enabled,
    retry: false,
    queryFn: () => {
      const extra: Record<string, string> = { limit: String(limit) };
      if (accountId) extra.accountId = accountId;
      return api.get<{ transactions: Transaction[] }>(
        rangePath("/v1/insights/top-spends", range, extra),
      );
    },
  });
  return { ...query, notDeployed: isNotDeployed(query.error) };
}

export function useNewPayees(range: DateRange, enabled = true) {
  const query = useQuery({
    queryKey: ik.newPayees(range),
    enabled,
    retry: false,
    queryFn: () =>
      api.get<{ payees: NewPayeeRow[] }>(rangePath("/v1/insights/new-payees", range)),
  });
  return { ...query, notDeployed: isNotDeployed(query.error) };
}
