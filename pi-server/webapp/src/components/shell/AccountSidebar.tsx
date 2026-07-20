import { NavLink } from "react-router-dom";
import { Plug } from "lucide-react";

import { cn } from "@/lib/utils";
import { useConnection } from "@/hooks/useConnection";
import { PRIMARY_NAV, WEALTH_NAV, type NavItem } from "./nav";
import { PersonPicker } from "./PersonPicker";

function RailLink({ item }: { item: NavItem }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === "/"}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand",
          // Active state = a solid indigo pill with white icon + label (YNAB
          // rail). Inactive is quiet ink that washes indigo on hover.
          isActive
            ? "bg-brand font-semibold text-brand-ink"
            : "font-medium text-bind-mut hover:bg-bind-2/70 hover:text-bind-ink",
        )
      }
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.75} />
      <span className="truncate">{item.label}</span>
    </NavLink>
  );
}

export function NavRail() {
  const { openDialog } = useConnection();
  return (
    <nav className="flex h-full w-60 shrink-0 flex-col bg-bind px-3 py-5 text-bind-ink">
      <div className="px-2 pb-6">
        <span className="font-display text-2xl tracking-tight text-bind-ink">Gullak</span>
      </div>

      <div className="flex flex-1 flex-col gap-1">
        {PRIMARY_NAV.map((item) => (
          <RailLink key={item.to} item={item} />
        ))}

        <p className="px-3 pt-5 pb-1 text-[11px] font-medium tracking-wide text-bind-mut/80">Wealth</p>
        {WEALTH_NAV.map((item) => (
          <RailLink key={item.to} item={item} />
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-1 border-t border-sidebar-border pt-3">
        <button
          type="button"
          onClick={openDialog}
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-bind-mut transition-colors outline-none hover:bg-bind-2/60 hover:text-bind-ink focus-visible:ring-2 focus-visible:ring-brand"
        >
          <Plug className="size-[18px] shrink-0" strokeWidth={1.75} />
          <span>Connection</span>
        </button>
        <PersonPicker />
      </div>
    </nav>
  );
}
