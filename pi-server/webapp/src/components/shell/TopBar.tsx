import { MessageSquareText, Plus, Search } from "lucide-react";

export function TopBar({
  onOpenPalette,
  onOpenAssistant,
  onOpenQuickAdd,
}: {
  onOpenPalette: () => void;
  onOpenAssistant: () => void;
  onOpenQuickAdd: () => void;
}) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-3 border-b border-rule bg-paper px-5 sm:px-8">
      <button
        type="button"
        onClick={onOpenPalette}
        className="group flex h-10 min-w-0 max-w-2xl flex-1 items-center gap-3 rounded-md border border-rule bg-paper px-3 text-sm text-ink-2 outline-none transition-colors duration-150 hover:border-brand hover:text-ink"
      >
        <Search className="size-4 shrink-0" strokeWidth={1.7} />
        <span className="truncate text-left">Search transactions, jump to a page, or ask Gullak</span>
        <kbd className="ml-auto hidden shrink-0 border-l border-rule pl-3 font-mono text-[11px] text-ink-2 sm:block">⌘K</kbd>
      </button>
      <button
        type="button"
        onClick={onOpenQuickAdd}
        className="grid size-10 shrink-0 place-items-center rounded-md border border-rule text-ink-2 transition-colors duration-150 hover:border-brand hover:text-brand-2"
        aria-label="Log an expense"
        title="Log an expense"
      >
        <Plus className="size-[18px]" />
      </button>
      <button
        type="button"
        onClick={onOpenAssistant}
        className="grid size-10 shrink-0 place-items-center rounded-md border border-rule text-ink-2 transition-colors duration-150 hover:border-brand hover:text-brand-2"
        aria-label="Open Gullak assistant"
        title="Ask Gullak (⌘/)"
      >
        <MessageSquareText className="size-[18px]" strokeWidth={1.7} />
      </button>
    </header>
  );
}
