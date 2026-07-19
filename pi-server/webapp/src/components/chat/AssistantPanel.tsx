import { useState } from "react";
import { PanelRightClose, SquarePen } from "lucide-react";

import { LedgerRule } from "@/components/LedgerRule";
import { ChatConversation } from "./ChatConversation";

// The permanent right-hand assistant on desktop (>=1024px). Paper surface with
// a left hairline; the ledger double-rule sits atop the conversation.
export function AssistantPanel({ onCollapse }: { onCollapse: () => void }) {
  const [sessionKey, setSessionKey] = useState(0);
  return (
    <aside className="flex h-full w-[360px] shrink-0 flex-col border-l border-rule bg-paper-2">
      <div className="flex items-center justify-between px-4 pt-4 pb-3">
        <h2 className="font-display text-lg tracking-tight text-ink">Assistant</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSessionKey((k) => k + 1)}
            aria-label="New chat"
            title="New chat"
            className="grid size-8 place-items-center rounded-md text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SquarePen className="size-4" />
          </button>
          <button
            type="button"
            onClick={onCollapse}
            aria-label="Collapse assistant"
            title="Collapse (⌘/)"
            className="grid size-8 place-items-center rounded-md text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            <PanelRightClose className="size-4" />
          </button>
        </div>
      </div>
      <LedgerRule className="mx-4" />
      <ChatConversation key={sessionKey} className="mt-1" />
    </aside>
  );
}
