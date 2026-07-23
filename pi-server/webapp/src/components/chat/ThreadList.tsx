import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckSquare2, Square, Trash2 } from "lucide-react";

import { threadQueryOptions, useDeleteThreads, useThreads } from "@/api/threads";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";
import type { ThreadSummary as ThreadSummaryData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/pages/holdings/ConfirmDialog";
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
  const { loadThread, reset, isPending, threadId: activeThreadId } = useChat();
  const deleteThreads = useDeleteThreads();
  const client = useQueryClient();
  const [query, setQuery] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);

  const threads = data?.threads ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((t) => t.title.toLowerCase().includes(q));
  }, [threads, query]);
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((thread) => selected.has(thread.threadId));

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

  function leaveSelectionMode() {
    setSelecting(false);
    setSelected(new Set());
  }

  function toggle(threadId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(threadId)) next.delete(threadId);
      else next.add(threadId);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelected((current) => {
      const next = new Set(current);
      if (allFilteredSelected) {
        for (const thread of filtered) next.delete(thread.threadId);
      } else {
        for (const thread of filtered) next.add(thread.threadId);
      }
      return next;
    });
  }

  async function confirmDelete() {
    const threadIds = [...selected];
    if (threadIds.length === 0 || deleteThreads.isPending || isPending) return;
    try {
      await deleteThreads.mutateAsync(threadIds);
      if (activeThreadId && threadIds.includes(activeThreadId)) reset();
      setConfirmOpen(false);
      leaveSelectionMode();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not delete conversations";
      toast.error(message);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-2 px-4 py-3">
        <div className="flex min-h-8 items-center justify-between gap-3">
          <span className="text-xs font-medium tracking-wide text-ink-2 uppercase">Chats</span>
          <button
            type="button"
            onClick={() => (selecting ? leaveSelectionMode() : setSelecting(true))}
            disabled={isLoading || threads.length === 0 || deleteThreads.isPending}
            className="min-h-8 whitespace-nowrap rounded-md px-2 text-xs font-semibold text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {selecting ? "Cancel" : "Select"}
          </button>
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search conversations…"
          className="h-8 text-sm"
          aria-label="Search conversations"
        />
      </div>

      {selecting ? (
        <div className="flex min-h-11 items-center gap-2 border-y border-rule px-4 text-xs">
          <button
            type="button"
            onClick={toggleAllFiltered}
            disabled={filtered.length === 0 || deleteThreads.isPending}
            className="min-h-9 whitespace-nowrap rounded-md px-2 font-semibold text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
          >
            {allFilteredSelected ? "Clear all" : "Select all"}
          </button>
          <span className="ml-auto whitespace-nowrap text-ink-2">{selected.size} selected</span>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={selected.size === 0 || deleteThreads.isPending || isPending}
            className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md px-2 font-semibold text-neg transition-colors hover:bg-pill-neg-bg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="size-3.5" /> Delete
          </button>
        </div>
      ) : null}

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
                  {selecting ? (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selected.has(t.threadId)}
                      onClick={() => toggle(t.threadId)}
                      className={cn(
                        "flex w-full items-start gap-3 rounded-md px-3 py-2 text-left transition-colors",
                        "hover:bg-paper-3 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                        selected.has(t.threadId) && "bg-paper-3",
                      )}
                    >
                      {selected.has(t.threadId) ? (
                        <CheckSquare2 className="mt-0.5 size-4 shrink-0 text-brand" />
                      ) : (
                        <Square className="mt-0.5 size-4 shrink-0 text-ink-2" />
                      )}
                      <ThreadSummary thread={t} />
                    </button>
                  ) : (
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
                      <ThreadSummary thread={t} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${selected.size} ${selected.size === 1 ? "conversation" : "conversations"}?`}
        description="This removes the selected chat history. Transactions and other financial records created from those conversations are not deleted."
        confirmLabel={deleteThreads.isPending ? "Deleting…" : "Delete"}
        onConfirm={() => void confirmDelete()}
        pending={deleteThreads.isPending}
      />
    </div>
  );
}

function ThreadSummary({ thread }: { thread: ThreadSummaryData }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm text-ink">{thread.title || "Untitled chat"}</span>
      <span className="flex items-center gap-1.5 text-[11px] text-ink-2">
        <span>{relativeTime(thread.lastAt)}</span>
        <span aria-hidden>·</span>
        <span>{thread.turnCount} {thread.turnCount === 1 ? "message" : "messages"}</span>
        {thread.source === "whatsapp" ? (
          <span className="rounded-sm bg-paper-3 px-1.5 py-0.5 text-[10px] text-ink-2">WhatsApp</span>
        ) : null}
      </span>
    </span>
  );
}
