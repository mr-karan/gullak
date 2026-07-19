import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { DateRange } from "@/lib/dates";

// One row per day that has activity within the requested range; empty days are
// filled in by the client. Money is integer minor units. Mirrors the pi-server
// CalendarDay shape from src/repos/calendar.ts.
export interface CalendarDay {
  date: string; // YYYY-MM-DD
  netCents: number;
  expenseCents: number; // outflows as a positive number
  incomeCents: number;
  txnCount: number;
}

interface CalendarResponse {
  days: CalendarDay[];
}

function calendarPath(range: DateRange, accountId?: string): string {
  const p = new URLSearchParams();
  p.set("startDate", range.startDate);
  p.set("endDate", range.endDate);
  if (accountId) p.set("accountId", accountId);
  return `/v1/calendar?${p.toString()}`;
}

export function useCalendar(range: DateRange, accountId?: string, enabled = true) {
  return useQuery({
    queryKey: ["calendar", range.startDate, range.endDate, accountId ?? ""],
    enabled,
    queryFn: () => api.get<CalendarResponse>(calendarPath(range, accountId)),
    select: (d) => d.days,
  });
}
