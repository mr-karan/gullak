import {
  CalendarDays,
  Coins,
  Gem,
  Landmark,
  LayoutDashboard,
  SlidersHorizontal,
  Target,
  TrendingUp,
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
  { to: "/", label: "Overview", icon: LayoutDashboard },
  { to: "/transactions", label: "Transactions", icon: Coins },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/insights", label: "Insights", icon: TrendingUp },
  { to: "/rules", label: "Rules", icon: SlidersHorizontal },
];

export const WEALTH_NAV: NavItem[] = [
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/holdings", label: "Holdings", icon: Landmark },
  { to: "/desires", label: "Desires", icon: Gem },
];

export const ALL_NAV = [...PRIMARY_NAV, ...WEALTH_NAV];
