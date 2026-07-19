import { LedgerRule } from "@/components/LedgerRule";
import { ChatConversation } from "@/components/chat/ChatConversation";

// Chat as a full route — primarily the mobile chat tab; also reachable via the
// command palette's "New chat" on any device.
export function ChatPage() {
  return (
    <div className="-mx-5 -my-7 flex h-full min-h-0 flex-col sm:-mx-8 sm:-my-9">
      <div className="px-5 pt-6 pb-3 sm:px-8">
        <h1 className="font-display text-2xl tracking-tight text-ink">Assistant</h1>
        <LedgerRule className="mt-3" />
      </div>
      <ChatConversation />
    </div>
  );
}
