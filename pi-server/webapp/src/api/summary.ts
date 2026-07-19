import { useQueries, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { DateRange } from "@/lib/dates";
import type { Summary } from "@/lib/types";

import { qk } from "./keys";

function summaryPath(range?: DateRange, accountId?: string): string {
  const p = new URLSearchParams();
  if (range) {
    p.set("startDate", range.startDate);
    p.set("endDate", range.endDate);
  }
  if (accountId) p.set("accountId", accountId);
  const qs = p.toString();
  return `/v1/summary${qs ? `?${qs}` : ""}`;
}

export function useSummary(range?: DateRange, accountId?: string, enabled = true) {
  return useQuery({
    queryKey: qk.summary(range, accountId),
    enabled,
    queryFn: () => api.get<Summary>(summaryPath(range, accountId)),
  });
}

/** Per-account net activity, one summary call each (mirrors the legacy home). */
export function useAccountSummaries(accountIds: string[], enabled = true) {
  return useQueries({
    queries: accountIds.map((accountId) => ({
      queryKey: qk.summary(undefined, accountId),
      enabled,
      queryFn: () => api.get<Summary>(summaryPath(undefined, accountId)),
    })),
  });
}

/** One /v1/summary call per date range. Used for month-over-month compare, the
    6-month cash-flow trend, and the desire affordability math. */
export function useSummaries(ranges: DateRange[], enabled = true) {
  return useQueries({
    queries: ranges.map((range) => ({
      queryKey: qk.summary(range),
      enabled,
      queryFn: () => api.get<Summary>(summaryPath(range)),
    })),
  });
}
