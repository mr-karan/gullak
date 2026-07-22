import { Link, NavLink } from "react-router-dom";
import { MessageSquareText, Plus, Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { PRIMARY_NAV, WEALTH_NAV, type NavItem } from "./nav";
import { ThemeToggle } from "./ThemeToggle";
import { PersonPicker } from "./PersonPicker";

// The command-first top bar, two tiers:
//   1. brand · omnibar (⌘K jump/ask/log) · controls
//   2. a PERSISTENT destination nav — visible wayfinding, tab-underline active
//      state. No side rail, no fixed assistant column; the canvas stays
//      full-width and single-focus.
function TabLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.to === "/overview"}
      className={({ isActive }) =>
        cn(
          "-mb-px flex h-full shrink-0 items-center border-b-2 px-3 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isActive
            ? "border-brand font-semibold text-ink"
            : "border-transparent font-medium text-ink-2 hover:text-ink",
        )
      }
    >
      {item.label}
    </NavLink>
  );
}

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
    <header className="sticky top-0 z-30 flex shrink-0 flex-col bg-paper/85 backdrop-blur-md">
      <div className="flex h-14 items-center gap-4 px-6">
        <Link
          to="/overview"
          className="shrink-0 rounded font-display text-xl tracking-tight text-ink outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Gullak
        </Link>

        <div className="flex min-w-0 flex-1 justify-center">
          <button
            type="button"
            onClick={onOpenPalette}
            className="group flex h-9 w-full max-w-xl items-center gap-2.5 rounded-lg border border-rule bg-paper-2 px-3 text-sm text-ink-2 transition-colors outline-none hover:border-brand/50 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Search className="size-4 shrink-0" strokeWidth={1.75} />
            <span className="flex-1 truncate text-left">Search, ask, or log an expense…</span>
            <kbd className="hidden shrink-0 items-center rounded border border-rule bg-paper px-1.5 py-0.5 font-sans text-[11px] font-medium text-ink-2 sm:inline-flex">
              ⌘K
            </kbd>
          </button>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onOpenQuickAdd}
            aria-label="Log an expense"
            title="Log an expense"
            className="grid size-9 place-items-center rounded-md text-ink-2 transition-colors outline-none hover:bg-paper-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Plus className="size-[18px]" strokeWidth={2} />
          </button>
          <button
            type="button"
            onClick={onOpenAssistant}
            aria-label="Open assistant (⌘/)"
            title="Ask Gullak (⌘/)"
            className="grid size-9 place-items-center rounded-md text-ink-2 transition-colors outline-none hover:bg-paper-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MessageSquareText className="size-[18px]" strokeWidth={1.75} />
          </button>
          <ThemeToggle iconOnly />
          <PersonPicker variant="bar" />
        </div>
      </div>

      <nav className="flex h-11 items-center gap-0.5 overflow-x-auto border-b border-rule px-6">
        {PRIMARY_NAV.map((item) => (
          <TabLink key={item.to} item={item} />
        ))}
        <span className="mx-2 h-4 w-px shrink-0 bg-rule" aria-hidden />
        {WEALTH_NAV.map((item) => (
          <TabLink key={item.to} item={item} />
        ))}
      </nav>
    </header>
  );
}
