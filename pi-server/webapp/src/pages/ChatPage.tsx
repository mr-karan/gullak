import { useState } from "react";
import { History, SquarePen } from "lucide-react";

import { LedgerRule } from "@/components/LedgerRule";
import { ChatConversation } from "@/components/chat/ChatConversation";
import { ThreadList } from "@/components/chat/ThreadList";
import { useChat } from "@/components/chat/ChatProvider";
import { cn } from "@/lib/utils";

// Chat as a full route — primarily the mobile chat tab; also reachable via the
// command palette's "New chat" on any device.
export function ChatPage() {
  const { reset, isPending } = useChat();
  const [view, setView] = useState<"chat" | "history">("chat");

  function newChat() {
    setView("chat");
    reset();
  }

  return (
    <div className="-mx-5 -my-7 flex h-full min-h-0 flex-col sm:-mx-8 sm:-my-9">
      <div className="px-5 pt-6 pb-3 sm:px-8">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-2xl tracking-tight text-ink">Assistant</h1>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setView((v) => (v === "history" ? "chat" : "history"))}
              aria-label="Chat history"
              aria-pressed={view === "history"}
              title="Chat history"
              className={cn(
                "grid size-8 place-items-center rounded-md transition-colors hover:bg-paper-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring",
                view === "history" ? "text-brand" : "text-ink-2",
              )}
            >
              <History className="size-4" />
            </button>
            <button
              type="button"
              onClick={newChat}
              disabled={isPending}
              aria-label="New chat"
              title="New chat"
              className="grid size-8 place-items-center rounded-md text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
            >
              <SquarePen className="size-4" />
            </button>
          </div>
        </div>
        <LedgerRule className="mt-3" />
      </div>
      {view === "history" ? (
        <ThreadList onSelect={() => setView("chat")} />
      ) : (
        <ChatConversation />
      )}
    </div>
  );
}
