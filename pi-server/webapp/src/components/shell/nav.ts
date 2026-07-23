import {
  CalendarDays,
  Coins,
  Gem,
  Landmark,
  LayoutDashboard,
  MessageSquareText,
  SlidersHorizontal,
  Target,
  TrendingUp,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

// Primary destinations. Icons are bare marks used only for wayfinding in the
// dark shell — never as content decoration, never in tiles.
export const PRIMARY_NAV: NavItem[] = [
  { to: "/overview", label: "Overview", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: Coins },
  { to: "/budget", label: "Budget", icon: Wallet },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/insights", label: "Insights", icon: TrendingUp },
  { to: "/rules", label: "Rules", icon: SlidersHorizontal },
];

export const WEALTH_NAV: NavItem[] = [
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/holdings", label: "Holdings", icon: Landmark },
  { to: "/desires", label: "Desires", icon: Gem },
];

export const ASSISTANT_NAV: NavItem[] = [
  { to: "/chat", label: "Chatroom", icon: MessageSquareText },
];

export const ALL_NAV = [...PRIMARY_NAV, ...WEALTH_NAV, ...ASSISTANT_NAV];

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Ledger", items: PRIMARY_NAV.slice(0, 4) },
  { label: "Understand", items: PRIMARY_NAV.slice(4) },
  { label: "Plan", items: WEALTH_NAV },
  { label: "Assistant", items: ASSISTANT_NAV },
];
