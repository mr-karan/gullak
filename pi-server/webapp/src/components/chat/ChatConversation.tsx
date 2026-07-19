import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSendMessage } from "@/api/messages";
import { useConnection } from "@/hooks/useConnection";
import { toast } from "@/components/ui/sonner";
import { MarkdownLite } from "./MarkdownLite";
import { buildContext, suggestedPrompts } from "./context";

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  content: string;
}

export function ChatConversation({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const { connected, openDialog } = useConnection();
  const send = useSendMessage();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | undefined>();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const prompts = useMemo(() => suggestedPrompts(pathname), [pathname]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, send.isPending]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || send.isPending) return;
    if (!connected) {
      openDialog();
      return;
    }
    setInput("");
    setMessages((prev) => [...prev, { id: Date.now(), role: "user", content: trimmed }]);
    send.mutate(
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
  }

  const empty = messages.length === 0;

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {empty ? (
          <div className="flex h-full flex-col justify-end gap-3">
            <p className="text-sm text-ink-2">
              Ask about your money. The assistant sees where you are, not your keys.
            </p>
            <div className="flex flex-col gap-1.5">
              {prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => submit(p)}
                  className="rounded-md border border-transparent px-3 py-2 text-left text-sm text-ink-2 transition-colors hover:border-rule hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((m) => (
              <div
                key={m.id}
                className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-rule bg-paper text-foreground",
                  )}
                >
                  {m.role === "user" ? (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                  ) : (
                    <MarkdownLite text={m.content} />
                  )}
                </div>
              </div>
            ))}
            {send.isPending ? <p className="text-sm text-ink-2">Thinking…</p> : null}
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="border-t border-rule p-3"
      >
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(input);
              }
            }}
            rows={1}
            placeholder="Ask Gullak…"
            className="max-h-32 min-h-9 flex-1 resize-none rounded-md border border-input bg-paper px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          />
          <button
            type="submit"
            disabled={send.isPending || !input.trim()}
            aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-[color-mix(in_oklch,var(--primary)_94%,black)] disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
