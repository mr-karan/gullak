import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { invalidateFinancial, useSendMessage } from "@/api/messages";
import { toast } from "@/components/ui/sonner";
import { useSelection } from "@/components/shell/SelectionProvider";
import { ApiError } from "@/lib/api";
import { postSse } from "@/lib/sse";
import type { ChatResponse, ThreadTurn, WriteAction } from "@/lib/types";
import { buildContext } from "./context";

export interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
  // Structured write-results the agent returned; the conversation renders each
  // as a result card + Undo below the reply.
  actions?: WriteAction[];
  // Last tool the agent used this turn; drives a tiny "what I did" caption.
  tool?: string;
  // Set on an error reply so the conversation can offer a one-tap Retry that
  // re-sends the original text without the user retyping.
  retryText?: string;
  // True while an SSE stream is still filling this assistant message in place;
  // the conversation shows a trailing cursor and live tool status until done.
  streaming?: boolean;
  // The tool currently executing this turn (tool_start → tool_end / next delta);
  // drives the live present-tense status row under the partial reply.
  activeTool?: string;
}

interface ChatState {
  messages: ChatMessage[];
  isPending: boolean;
  // The server thread the NEXT send continues; undefined for a fresh chat.
  // Exposed so the history view can highlight the active room.
  threadId: string | undefined;
  send: (text: string, pathname: string) => void;
  reset: () => void;
  // Resume a past server thread: abort any active stream, replace the messages
  // with the historical turns, and point subsequent sends at this thread.
  loadThread: (threadId: string, turns: ThreadTurn[]) => void;
}

const ChatContext = createContext<ChatState | null>(null);

// Chat conversation state lives here, ABOVE the panel/route that renders it, so
// an in-flight /v1/messages request (which may create a transaction server-side)
// is never orphaned when the assistant panel collapses or the route changes.
// The mutation and its result callbacks belong to this always-mounted provider,
// so the reply is always applied to the thread rather than discarded on unmount.
export function ChatProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const sendMut = useSendMessage();
  const { selectedTransactionIds } = useSelection();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>();
  // A stream drives isPending itself (TanStack's isPending only covers the
  // fallback mutation), so the composer/typing UI stay disabled mid-stream.
  const [streamingActive, setStreamingActive] = useState(false);
  // Aborts the in-flight stream on reset so it never writes into cleared state.
  const abortRef = useRef<AbortController | null>(null);
  // Conversation generation: bumped by reset()/loadThread(). A send captures the
  // generation it started under; late results (the fallback MUTATION especially,
  // which the abort controller cannot cancel) check it before touching messages
  // or threadId — otherwise thread A's reply could land inside thread B after a
  // history switch, and setThreadId(A) would hijack the active room. Financial
  // cache invalidation still runs regardless: the server-side write happened.
  const genRef = useRef(0);

  // Patch a single message in place by id (functional so concurrent deltas
  // never clobber each other).
  const patchMessage = useCallback((id: number, patch: Partial<ChatMessage>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  }, []);

  // The classic mutation path — used as the fallback when streaming is
  // unavailable (older server / network error before any event arrived).
  const runMutationFallback = useCallback(
    (
      vars: {
        text: string;
        threadId?: string;
        context: ReturnType<typeof buildContext>;
        selection?: { transactionIds: string[] };
      },
      trimmed: string,
      gen: number,
    ) => {
      sendMut.mutate(vars, {
        onSuccess: (res) => {
          // Financial cache invalidation lives on the mutation itself (see
          // useSendMessage) and runs even when the user switched threads — the
          // server-side write is real. Here we only touch the conversation, and
          // only if it's still the one this send belongs to.
          if (genRef.current !== gen) return;
          if (res.threadId) setThreadId(res.threadId);
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + 1,
              role: "assistant",
              content: res.reply || "No response.",
              actions: res.actions,
              tool: res.tool,
            },
          ]);
        },
        onError: (err) => {
          if (genRef.current !== gen) return;
          const msg = err instanceof Error ? err.message : "request failed";
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now() + 1,
              role: "assistant",
              content: `The assistant is unavailable right now (${msg}). Try again once the server has a model configured.`,
              retryText: trimmed,
            },
          ]);
          toast.error(msg);
        },
      });
    },
    [sendMut],
  );

  const send = useCallback(
    (text: string, pathname: string) => {
      const trimmed = text.trim();
      if (!trimmed || sendMut.isPending || streamingActive) return;

      const userId = Date.now();
      const assistantId = userId + 1;
      const vars = {
        text: trimmed,
        threadId,
        context: buildContext(pathname),
        selection:
          selectedTransactionIds.length > 0
            ? { transactionIds: selectedTransactionIds }
            : undefined,
      };

      // Append the user turn + an empty streaming placeholder the stream fills.
      setMessages((prev) => [
        ...prev,
        { id: userId, role: "user", content: trimmed },
        { id: assistantId, role: "assistant", content: "", streaming: true },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      setStreamingActive(true);
      const gen = genRef.current;

      // Distinguishes "stream never started" (→ fallback) from "failed
      // mid-stream" (→ inline error on the placeholder).
      let receivedAny = false;

      void postSse(
        "/v1/messages/stream",
        {
          text: trimmed,
          source: "web",
          context: vars.context,
          ...(vars.threadId ? { threadId: vars.threadId } : {}),
          ...(vars.selection ? { selection: vars.selection } : {}),
        },
        {
          signal: controller.signal,
          onEvent: (event, data) => {
            receivedAny = true;
            // A reset()/loadThread() raced this event in — never write into the
            // conversation that replaced ours (the abort usually prevents this;
            // the generation check closes the microtask-ordering window).
            if (genRef.current !== gen) return;
            switch (event) {
              case "delta": {
                const chunk = (data as { text?: string }).text ?? "";
                // A delta means the current tool finished emitting; clear the
                // live status and append the text chunk in order.
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + chunk, activeTool: undefined }
                      : m,
                  ),
                );
                break;
              }
              case "tool_start": {
                const tool = (data as { tool?: string }).tool;
                if (tool) patchMessage(assistantId, { activeTool: tool, tool });
                break;
              }
              case "tool_end": {
                patchMessage(assistantId, { activeTool: undefined });
                break;
              }
              case "done": {
                const res = data as ChatResponse;
                if (res.threadId) setThreadId(res.threadId);
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? {
                          ...m,
                          content: res.reply || "No response.",
                          actions: res.actions,
                          tool: res.tool ?? m.tool,
                          streaming: false,
                          activeTool: undefined,
                        }
                      : m,
                  ),
                );
                if (res.actions?.length) invalidateFinancial(client);
                break;
              }
              case "error": {
                const msg = (data as { message?: string }).message || "request failed";
                patchMessage(assistantId, {
                  content: `The assistant hit an error (${msg}).`,
                  retryText: trimmed,
                  streaming: false,
                  activeTool: undefined,
                });
                toast.error(msg);
                break;
              }
            }
          },
        },
      )
        .catch((err: unknown) => {
          if (controller.signal.aborted) return; // reset() tore the stream down
          if (genRef.current !== gen) return; // conversation was replaced
          const isOldServer =
            err instanceof ApiError && (err.status === 404 || err.status === 405);
          const isNetworkError = !(err instanceof ApiError);
          if (!receivedAny && (isOldServer || isNetworkError)) {
            // Stream never started — drop the placeholder and retry once via the
            // unchanged mutation path (isPending carries over to sendMut).
            setMessages((prev) => prev.filter((m) => m.id !== assistantId));
            runMutationFallback(vars, trimmed, gen);
            return;
          }
          // Failed mid-stream (or a non-fallback error like 401): turn the
          // placeholder into the standard retryable error message.
          const msg = err instanceof Error ? err.message : "request failed";
          patchMessage(assistantId, {
            content: `The assistant is unavailable right now (${msg}). Try again once the server has a model configured.`,
            retryText: trimmed,
            streaming: false,
            activeTool: undefined,
          });
          toast.error(msg);
        })
        .finally(() => {
          // Gate BOTH on still being the active controller: an aborted stream's
          // late .finally must not clear the flag for a newer in-flight stream
          // (that would re-enable the composer mid-stream → concurrent sends).
          if (abortRef.current === controller) {
            abortRef.current = null;
            setStreamingActive(false);
          }
        });
    },
    [sendMut.isPending, streamingActive, threadId, selectedTransactionIds, patchMessage, runMutationFallback, client],
  );

  const reset = useCallback(() => {
    genRef.current += 1; // invalidate any in-flight send's late results
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamingActive(false);
    setMessages([]);
    setThreadId(undefined);
  }, []);

  const loadThread = useCallback((id: string, turns: ThreadTurn[]) => {
    // Reuse reset()'s abort path so an in-flight stream can't write into the
    // thread we're switching away from — and bump the generation so a pending
    // fallback MUTATION (which abort can't cancel) can't append thread A's
    // reply into thread B or repoint threadId.
    genRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setStreamingActive(false);
    // Historical turns are plain text — no tool/actions replayed.
    setMessages(turns.map((t) => ({ id: t.id, role: t.role, content: t.content })));
    setThreadId(id);
  }, []);

  const value = useMemo<ChatState>(
    () => ({
      messages,
      isPending: streamingActive || sendMut.isPending,
      threadId,
      send,
      reset,
      loadThread,
    }),
    [messages, streamingActive, sendMut.isPending, threadId, send, reset, loadThread],
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatState {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within ChatProvider");
  return ctx;
}
