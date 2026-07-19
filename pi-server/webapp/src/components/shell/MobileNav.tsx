import { useState } from "react";
import { NavLink } from "react-router-dom";
import { MessageSquareText, Menu } from "lucide-react";

import { cn } from "@/lib/utils";
import { useConnection } from "@/hooks/useConnection";
import { PRIMARY_NAV, WEALTH_NAV, type NavItem } from "./nav";
import { PersonPicker } from "./PersonPicker";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const CHAT_ITEM: NavItem = { to: "/chat", label: "Chat", icon: MessageSquareText };
const BOTTOM_ITEMS: NavItem[] = [...PRIMARY_NAV, CHAT_ITEM];

export function MobileTopBar() {
  const { openDialog } = useConnection();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between bg-bind px-4 py-3 text-bind-ink">
      <span className="font-display text-xl tracking-tight">Gullak</span>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label="Open menu"
          className="rounded-md p-1.5 text-bind-ink transition-colors outline-none hover:bg-bind-2 focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Menu className="size-5" />
        </SheetTrigger>
        <SheetContent side="right" className="w-72">
          <SheetHeader>
            <SheetTitle>Wealth</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1">
            {WEALTH_NAV.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors",
                      isActive ? "bg-paper-3 font-semibold text-ink" : "text-ink-2 hover:bg-paper-3",
                    )
                  }
                >
                  <Icon className="size-[18px]" strokeWidth={1.75} />
                  {item.label}
                </NavLink>
              );
            })}
          </div>
          <div className="mt-auto flex flex-col gap-2 border-t border-rule pt-3">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                openDialog();
              }}
              className="rounded-md px-3 py-2.5 text-left text-sm font-medium text-ink-2 transition-colors hover:bg-paper-3"
            >
              Connection
            </button>
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}

export function MobileBottomBar() {
  return (
    <nav className="sticky bottom-0 z-30 grid grid-cols-4 border-t border-sidebar-border bg-bind pb-[env(safe-area-inset-bottom)] text-bind-ink">
      {BOTTOM_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              cn(
                "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors outline-none",
                isActive ? "text-bind-ink" : "text-bind-mut",
              )
            }
          >
            <Icon className="size-5" strokeWidth={1.75} />
            {item.label}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function MobilePersonRow() {
  return (
    <div className="bg-bind px-3 pb-2">
      <PersonPicker />
    </div>
  );
}
