import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { ChatContext, ChatResponse } from "@/lib/types";

// A chat write (the agent categorizing/editing/deleting/logging) OR an Undo
// changes financial rows on the server. Invalidate every query that reflects
// that data so the register, insights, and balances update in real time.
function invalidateFinancial(client: QueryClient): void {
  for (const key of [
    ["transactions"],
    ["summary"],
    ["accounts"],
    ["calendar"],
    ["insights"],
  ]) {
    void client.invalidateQueries({ queryKey: key });
  }
}

export function useSendMessage() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: {
      text: string;
      threadId?: string;
      context: ChatContext;
      selection?: { transactionIds: string[] };
    }) =>
      api.post<ChatResponse>("/v1/messages", {
        text: vars.text,
        source: "web",
        context: vars.context,
        ...(vars.threadId ? { threadId: vars.threadId } : {}),
        ...(vars.selection ? { selection: vars.selection } : {}),
      }),
    onSuccess: (res) => {
      // The agent performed a write → refresh the financial views.
      if (res.actions?.length) invalidateFinancial(client);
    },
  });
}

/** Replay a server-authored undo action (POST /v1/messages/action). The server
    hard-whitelists this to the undo tools; the args come straight off a
    WriteAction's `undo`. Refreshes financial views on success. */
export function useAgentAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (vars: { tool: string; args: unknown }) =>
      api.post<{ result: unknown }>("/v1/messages/action", {
        tool: vars.tool,
        args: vars.args,
      }),
    onSuccess: () => invalidateFinancial(client),
  });
}
