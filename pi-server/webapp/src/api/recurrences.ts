import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

// Mirrors the pi-server `recurrences` table. Money is integer minor units;
// dates are YYYY-MM-DD text; cadence drives how nextDate rolls forward.
export interface Recurrence {
  id: string;
  accountId: string;
  categoryId: string | null;
  payeeId: string | null;
  payeeName: string | null;
  amountCents: number;
  notes: string | null;
  cadence: "daily" | "weekly" | "monthly" | "yearly";
  nextDate: string; // YYYY-MM-DD
  anchorDay: number | null;
  createdAt: number;
  updatedAt: number;
}

interface RecurrencesResponse {
  recurrences: Recurrence[];
}

export function useRecurrences(enabled = true) {
  return useQuery({
    queryKey: ["recurrences"],
    enabled,
    queryFn: () => api.get<RecurrencesResponse>("/v1/recurrences"),
    select: (d) => d.recurrences,
  });
}
