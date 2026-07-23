import { MessageSquareText, Plus, Search } from "lucide-react";
import { Link, NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";
import { PersonPicker } from "./PersonPicker";
import { NAV_GROUPS } from "./nav";

export function SideRail({
  onOpenPalette,
  onOpenAssistant,
  onOpenQuickAdd,
}: {
  onOpenPalette: () => void;
  onOpenAssistant: () => void;
  onOpenQuickAdd: () => void;
}) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-bind text-bind-ink">
      <div className="flex h-16 items-center border-b border-sidebar-border px-5">
        <Link to="/overview" className="font-display text-2xl font-semibold tracking-[-0.035em] outline-none">
          Gullak<span className="text-brand" aria-hidden>.</span>
        </Link>
      </div>

      <div className="px-3 pt-4">
        <button
          type="button"
          onClick={onOpenQuickAdd}
          className="flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-brand px-4 text-sm font-semibold text-brand-ink transition-colors duration-150 hover:bg-brand-2"
        >
          <Plus className="size-4" /> Log expense
        </button>
        <div className="mt-2 grid grid-cols-2 gap-1">
          <button type="button" onClick={onOpenPalette} className="flex h-9 items-center justify-center gap-2 rounded-md text-xs font-medium text-bind-mut transition-colors duration-150 hover:bg-bind-2 hover:text-bind-ink">
            <Search className="size-3.5" /> Search
          </button>
          <button type="button" onClick={onOpenAssistant} className="flex h-9 items-center justify-center gap-2 rounded-md text-xs font-medium text-bind-mut transition-colors duration-150 hover:bg-bind-2 hover:text-bind-ink">
            <MessageSquareText className="size-3.5" /> Ask
          </button>
        </div>
      </div>

      <nav aria-label="Workspace" className="flex-1 overflow-y-auto px-3 py-5">
        {NAV_GROUPS.map((group, groupIndex) => (
          <div key={group.label} className={cn(groupIndex > 0 && "mt-6")}>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-bind-mut">{group.label}</p>
            <div className="mt-2 space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/overview"}
                    className={({ isActive }) => cn(
                      "flex h-10 items-center gap-3 rounded-md border-l-2 px-3 text-sm outline-none transition-colors duration-150",
                      isActive
                        ? "border-brand bg-bind-2 font-semibold text-bind-ink"
                        : "border-transparent font-medium text-bind-mut hover:bg-bind-2 hover:text-bind-ink",
                    )}
                  >
                    <Icon className="size-[17px]" strokeWidth={1.7} />
                    {item.label}
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-1">
          <div className="min-w-0 flex-1"><PersonPicker /></div>
          <ThemeToggle iconOnly />
        </div>
      </div>
    </aside>
  );
}
