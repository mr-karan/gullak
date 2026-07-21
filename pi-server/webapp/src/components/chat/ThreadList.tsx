import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { threadQueryOptions, useThreads } from "@/api/threads";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useChat } from "./ChatProvider";

// Compact relative time ("just now", "2h ago", "3d ago") — no dep, no i18n.
function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

// The panel-width chat-history ("chatrooms") view. Lists past threads, filters
// by title client-side, and resumes one on click via ChatProvider.loadThread.
export function ThreadList({ onSelect }: { onSelect: () => void }) {
  const { data, isLoading, isError } = useThreads(true);
  const { loadThread, threadId: activeThreadId } = useChat();
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const threads = data?.threads ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, query]);

  async function open(threadId: string) {
    if (loadingId) return; // one resume at a time
    setLoadingId(threadId);
    try {
      const res = await client.fetchQuery(threadQueryOptions(threadId));
      loadThread(threadId, res.turns);
      onSelect(); // back to the conversation view
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not load conversation";
      toast.error(msg);
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 px-4 py-3">
        <span className="text-xs font-medium tracking-wide text-ink-2 uppercase">Chats</span>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations…"
          className="h-8 text-sm"
          aria-label="Search conversations"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {isLoading ? (
          <div className="flex flex-col gap-1 px-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex flex-col gap-1.5 rounded-md px-2 py-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <p className="px-4 py-6 text-sm text-ink-2">
            History isn't available on this server yet.
          </p>
        ) : filtered.length === 0 ? (
          <p className="px-4 py-6 text-sm text-ink-2">
            {query.trim() ? "No matching conversations." : "No conversations yet."}
          </p>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {filtered.map((t) => {
              const active = t.threadId === activeThreadId;
              const busy = t.threadId === loadingId;
              return (
                <li key={t.threadId}>
                  <button
                    type="button"
                    onClick={() => open(t.threadId)}
                    disabled={busy}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full flex-col gap-0.5 rounded-md px-3 py-2 text-left transition-colors",
                      "hover:bg-paper-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                      active && "bg-paper-3",
                      busy && "opacity-50",
                    )}
                  >
                    <span className="truncate text-sm text-ink">
                      {t.title || "Untitled chat"}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
                      <span>{relativeTime(t.lastAt)}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {t.turnCount} {t.turnCount === 1 ? "message" : "messages"}
                      </span>
                      {t.source === "whatsapp" ? (
                        <span className="rounded-sm bg-paper-3 px-1.5 py-0.5 text-[10px] text-ink-2">
                          WhatsApp
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
