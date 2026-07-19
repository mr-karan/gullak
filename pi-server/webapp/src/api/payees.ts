import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { PayeesResponse } from "@/lib/types";

import { qk } from "./keys";

export function usePayees(enabled = true) {
  return useQuery({
    queryKey: qk.payees,
    enabled,
    queryFn: () => api.get<PayeesResponse>("/v1/payees"),
    select: (d) => d.payees,
  });
}
