import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import { useSendMessage } from "@/api/messages";
import { toast } from "@/components/ui/sonner";
import { buildContext } from "./context";

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

interface ChatState {
  messages: ChatMessage[];
  isPending: boolean;
  send: (text: string, pathname: string) => void;
  reset: () => void;
}

const ChatContext = createContext<ChatState | null>(null);

// Chat conversation state lives here, ABOVE the panel/route that renders it, so
// an in-flight /v1/messages request (which may create a transaction server-side)
// is never orphaned when the assistant panel collapses or the route changes.
// The mutation and its result callbacks belong to this always-mounted provider,
// so the reply is always applied to the thread rather than discarded on unmount.
export function ChatProvider({ children }: { children: ReactNode }) {
  const sendMut = useSendMessage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>();

  const send = useCallback(
    (text: string, pathname: string) => {
      const trimmed = text.trim();
      if (!trimmed || sendMut.isPending) return;
      setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: trimmed }]);
      sendMut.mutate(
        { text: trimmed, threadId, context: buildContext(pathname) },
        {
          onSuccess: (res) => {
            if (res.threadId) setThreadId(res.threadId);
            setMessages((prev) => [
              ...prev,
              { id: Date.now() + 1, role: "assistant", content: res.reply || "No response." },
            ]);
          },
          onError: (err) => {
            const msg = err instanceof Error ? err.message : "request failed";
            setMessages((prev) => [
              ...prev,
              {
                id: Date.now() + 1,
                role: "assistant",
                content: `The assistant is unavailable right now (${msg}). Try again once the server has a model configured.`,
              },
            ]);
            toast.error(msg);
          },
        },
      );
    },
    [sendMut, threadId],
  );

  const reset = useCallback(() => {
    setMessages([]);
    setThreadId(undefined);
  }, []);

  const value = useMemo<ChatState>(
    () => ({ messages, isPending: sendMut.isPending, send, reset }),
    [messages, sendMut.isPending, send, reset],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatState {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
