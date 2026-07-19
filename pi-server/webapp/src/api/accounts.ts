import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { AccountsResponse } from "@/lib/types";

import { qk } from "./keys";

export function useAccounts(enabled = true) {
  return useQuery({
    queryKey: qk.accounts,
    enabled,
    queryFn: () => api.get<AccountsResponse>("/v1/accounts"),
    select: (d) => d.accounts,
  });
}
