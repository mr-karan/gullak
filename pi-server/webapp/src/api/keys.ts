import type { DateRange } from "@/lib/dates";

/** Central query-key registry so mutations can invalidate precisely. */
export const qk = {
  accounts: ["accounts"] as const,
  categories: ["categories"] as const,
  categoryGroups: ["category-groups"] as const,
  payees: ["payees"] as const,
  netWorth: ["net-worth"] as const,
  holdings: ["holdings"] as const,
  goals: ["goals"] as const,
  profiles: ["profiles"] as const,
  desires: (person?: string, status?: string) => ["desires", person ?? "", status ?? ""] as const,
  desire: (id: string) => ["desire", id] as const,
  summary: (range?: DateRange, accountId?: string) =>
    ["summary", range?.startDate ?? "", range?.endDate ?? "", accountId ?? ""] as const,
  transactions: (range: DateRange, accountId?: string) =>
    ["transactions", range.startDate, range.endDate, accountId ?? ""] as const,
};
