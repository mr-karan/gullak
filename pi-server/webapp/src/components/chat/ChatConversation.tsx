import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUp } from "lucide-react";

import { cn } from "@/lib/utils";
import { Pill } from "@/components/Pill";
import { useConnection } from "@/hooks/useConnection";
import { useSelection } from "@/components/shell/SelectionProvider";
import { ActionCard } from "./ActionCard";
import { MarkdownLite } from "./MarkdownLite";
import { useChat } from "./ChatProvider";
import { suggestedPrompts } from "./context";

export function ChatConversation({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const { connected, openDialog } = useConnection();
  // Conversation state + the send mutation live in ChatProvider (mounted above
  // this view) so a pending request survives panel collapse / route change.
  const { messages, isPending, send } = useChat();
  const { selectedTransactionIds } = useSelection();
  const selectedCount = selectedTransactionIds.length;
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const prompts = useMemo(() => suggestedPrompts(pathname), [pathname]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isPending]);

  function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isPending) return;
    if (!connected) {
      openDialog();
      return;
    }
    setInput("");
    send(trimmed, pathname);
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
                className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}
              >
                {m.role === "user" ? (
                  // User: a subtle indigo-tinted bubble, right-aligned.
                  <div className="max-w-[85%] rounded-lg bg-pill-brand-bg px-3 py-2">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words text-ink">
                      {m.content}
                    </p>
                  </div>
                ) : (
                  // Assistant: plain on paper, no bubble.
                  <div className="max-w-[92%] text-foreground">
                    <MarkdownLite text={m.content} />
                  </div>
                )}
                {m.role === "assistant" && m.actions?.length ? (
                  <div className="flex w-full max-w-[85%] flex-col">
                    {m.actions.map((a, i) => (
                      <ActionCard key={`${m.id}-${i}`} action={a} />
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
            {isPending ? <p className="text-sm text-ink-2">Thinking…</p> : null}
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
        {selectedCount > 0 ? (
          <div className="mb-2">
            <Pill tone="brand">{selectedCount} selected</Pill>
          </div>
        ) : null}
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
            disabled={isPending || !input.trim()}
            aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-md bg-brand text-brand-ink transition-colors hover:bg-brand-2 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}
