import { useMutation } from "@tanstack/react-query";

import { api } from "@/lib/api";
import type { ChatContext, ChatResponse } from "@/lib/types";

export function useSendMessage() {
  return useMutation({
    mutationFn: (vars: { text: string; threadId?: string; context: ChatContext }) =>
      api.post<ChatResponse>("/v1/messages", {
        text: vars.text,
        source: "web",
        context: vars.context,
        ...(vars.threadId ? { threadId: vars.threadId } : {}),
      }),
  });
}
