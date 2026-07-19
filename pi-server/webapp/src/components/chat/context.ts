import type { ChatContext } from "@/lib/types";

const VIEW_BY_PATH: Record<string, string> = {
  "/": "accounts",
  "/transactions": "transactions",
  "/insights": "insights",
  "/goals": "goals",
  "/holdings": "holdings",
  "/desires": "desires",
  "/chat": "chat",
};

/** Compact "where is the user" hint sent with every chat message. Advisory
    prose for the model only — never trusted for writes. */
export function buildContext(pathname: string): ChatContext {
  const view = VIEW_BY_PATH[pathname] ?? "accounts";
  return { view };
}

const PROMPTS_BY_VIEW: Record<string, string[]> = {
  accounts: ["What's my net worth?", "How did this month go?"],
  transactions: ["What's driving spend this month?", "Where can I cut back?"],
  insights: ["Summarise my spending trends", "Biggest category this year?"],
  goals: ["When do I hit the target at current pace?", "Which goal is furthest behind?"],
  holdings: ["How concentrated is the portfolio?", "Equity vs MF split?"],
  desires: ["Can we afford this?", "What's our surplus lately?"],
  chat: ["What's my net worth?", "Where can I cut back?"],
};

export function suggestedPrompts(pathname: string): string[] {
  const view = VIEW_BY_PATH[pathname] ?? "accounts";
  return PROMPTS_BY_VIEW[view] ?? PROMPTS_BY_VIEW.accounts;
}
