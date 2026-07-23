import { useState } from "react";
import { Menu, Plus } from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";
import { useConnection } from "@/hooks/useConnection";
import { ALL_NAV, ASSISTANT_NAV, PRIMARY_NAV, type NavItem } from "./nav";
import { PersonPicker } from "./PersonPicker";
import { ThemeToggle } from "./ThemeToggle";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const PRIMARY_MOBILE: NavItem[] = [PRIMARY_NAV[0], PRIMARY_NAV[1], PRIMARY_NAV[2], ASSISTANT_NAV[0]];

export function MobileTopBar({ onOpenQuickAdd }: { onOpenQuickAdd: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-rule bg-paper px-4">
      <span className="font-display text-2xl font-semibold tracking-[-0.035em] text-ink">Gullak<span className="text-brand">.</span></span>
      <button type="button" onClick={onOpenQuickAdd} aria-label="Log an expense" className="grid size-11 place-items-center rounded-md border border-rule text-ink transition-colors duration-150 hover:border-brand hover:text-brand-2">
        <Plus className="size-5" />
      </button>
    </header>
  );
}

export function MobileBottomBar() {
  const [open, setOpen] = useState(false);
  const { openDialog } = useConnection();

  return (
    <nav className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-rule bg-paper pb-[env(safe-area-inset-bottom)]" aria-label="Primary">
      {PRIMARY_MOBILE.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink key={item.to} to={item.to} end={item.to === "/overview"} className={({ isActive }) => cn(
            "flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-ink-2 outline-none",
            isActive && "font-semibold text-brand-2",
          )}>
            <Icon className="size-[19px]" strokeWidth={1.7} />
            <span className="whitespace-nowrap">{item.label}</span>
          </NavLink>
        );
      })}

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className="flex min-h-14 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium text-ink-2 outline-none">
          <Menu className="size-[19px]" strokeWidth={1.7} />
          <span>More</span>
        </SheetTrigger>
        <SheetContent side="right" className="flex w-[min(22rem,90vw)] flex-col">
          <SheetHeader><SheetTitle>Gullak</SheetTitle></SheetHeader>
          <div className="flex flex-col gap-1">
            {ALL_NAV.map((item) => {
              const Icon = item.icon;
              return <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className={({ isActive }) => cn(
                "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm text-ink-2",
                isActive ? "bg-paper-3 font-semibold text-ink" : "hover:bg-paper-2 hover:text-ink",
              )}><Icon className="size-[18px]" strokeWidth={1.7} />{item.label}</NavLink>;
            })}
          </div>
          <div className="mt-auto border-t border-rule pt-4">
            <PersonPicker />
            <div className="mt-3 flex items-center justify-between">
              <button type="button" onClick={() => { setOpen(false); openDialog(); }} className="min-h-11 px-3 text-sm font-medium text-ink-2">Connection</button>
              <ThemeToggle iconOnly />
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
