import { useQuery } from "@tanstack/react-query";

import { api, ApiError } from "@/lib/api";
import type { NetWorth } from "@/lib/types";

import { qk } from "./keys";

/** Net worth is an M5 endpoint that may not be deployed (404/501). Callers
    treat `undefined` data with a `notDeployed` flag as "collapse to cash-only". */
export function useNetWorth(enabled = true) {
  const query = useQuery({
    queryKey: qk.netWorth,
    enabled,
    retry: false,
    queryFn: () => api.get<NetWorth>("/v1/net-worth"),
  });
  const notDeployed =
    query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 501);
  return { ...query, notDeployed };
}
