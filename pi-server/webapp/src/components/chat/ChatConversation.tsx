import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ArrowUp, Check, Sparkles, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useConnection } from "@/hooks/useConnection";
import { useSelection } from "@/components/shell/SelectionProvider";
import { ActionCard } from "./ActionCard";
import { MarkdownLite } from "./MarkdownLite";
import { useChat } from "./ChatProvider";
import { suggestedPrompts } from "./context";

// Friendly, past-tense labels for the tool the agent last used — shown as a
// tiny "what I did" caption under each assistant reply. Unknown tools fall back
// to a humanized form of their raw name.
const TOOL_LABELS: Record<string, string> = {
  summary: "Checked your monthly summary",
  category_spend: "Checked category spend",
  search_transactions: "Searched your transactions",
  recent_transactions: "Pulled recent transactions",
  account_balances: "Checked account balances",
  net_worth: "Computed net worth",
  top_payees: "Ranked your top payees",
  afford_check: "Ran the affordability math",
  goal_progress: "Checked goal progress",
  categorize_transactions: "Recategorized transactions",
  edit_transaction: "Edited a transaction",
  delete_transactions: "Deleted transactions",
  log_transaction: "Logged a transaction",
};

function toolLabel(tool: string): string {
  return TOOL_LABELS[tool] ?? `Used ${tool.replace(/_/g, " ")}`;
}

export function ChatConversation({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const { connected, openDialog } = useConnection();
  // Conversation state + the send mutation live in ChatProvider (mounted above
  // this view) so a pending request survives panel collapse / route change.
  const { messages, isPending, send } = useChat();
  const { selectedTransactionIds, setSelectedTransactionIds } = useSelection();
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
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-brand" aria-hidden />
              <h3 className="text-sm font-semibold text-ink">Ask Gullak</h3>
            </div>
            <p className="text-sm text-ink-2">
              Answers come from your own data — accounts, transactions, budgets.
            </p>
            <div className="flex flex-col gap-1.5">
              {prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => submit(p)}
                  className="rounded-md border border-rule px-3 py-2 text-left text-sm text-ink-2 transition-colors hover:border-brand/50 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
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
                {m.role === "assistant" && m.tool ? (
                  <p className="mt-1 flex items-center gap-1 text-[11px] text-ink-2">
                    <Check className="size-3 shrink-0" aria-hidden />
                    {toolLabel(m.tool)}
                  </p>
                ) : null}
                {m.role === "assistant" && m.retryText ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isPending && m.retryText) send(m.retryText, pathname);
                    }}
                    disabled={isPending}
                    className="mt-1.5 rounded-md border border-rule px-2 py-1 text-xs text-ink-2 transition-colors hover:border-brand/50 hover:text-ink disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            ))}
            {isPending ? (
              <div className="flex items-center gap-2" aria-live="polite">
                <span className="flex items-center gap-1" aria-hidden>
                  <span className="vault-typing-dot size-1.5 rounded-full bg-ink-2" />
                  <span
                    className="vault-typing-dot size-1.5 rounded-full bg-ink-2"
                    style={{ animationDelay: "0.15s" }}
                  />
                  <span
                    className="vault-typing-dot size-1.5 rounded-full bg-ink-2"
                    style={{ animationDelay: "0.3s" }}
                  />
                </span>
                <span className="text-sm text-ink-2">Looking at your data…</span>
              </div>
            ) : null}
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
            <span className="inline-flex items-center gap-1.5 rounded-md bg-pill-brand-bg px-2.5 py-1.5 text-xs text-pill-brand-ink">
              Will act on {selectedCount} selected transaction{selectedCount === 1 ? "" : "s"}
              <button
                type="button"
                onClick={() => setSelectedTransactionIds([])}
                title="Clear selection"
                aria-label="Clear selection"
                className="grid place-items-center rounded-sm transition-opacity hover:opacity-70 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </span>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          <textarea
            // The panel mounts only when opened, so autoFocus on mount lands the
            // cursor in the composer as soon as the assistant appears.
            autoFocus
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
