import { useState } from "react";
import { Moon, Sun } from "lucide-react";

import { cn } from "@/lib/utils";

// Flips <html data-theme> between dark/light and persists the raw choice to
// localStorage ("gullak_theme") — the same key the inline init in index.html
// reads before first paint. The web ledger defaults to light.
type Theme = "dark" | "light";

function currentTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function ThemeToggle({
  iconOnly = false,
  className,
}: {
  iconOnly?: boolean;
  className?: string;
}) {
  const [theme, setTheme] = useState<Theme>(currentTheme);

  const flip = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("gullak_theme", next);
    } catch {
      /* quota / private mode — non-fatal */
    }
    setTheme(next);
  };

  const Icon = theme === "dark" ? Sun : Moon;
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";

  if (iconOnly) {
    return (
      <button
        type="button"
        onClick={flip}
        aria-label={label}
        title={label}
        className={cn(
          "grid size-11 place-items-center rounded-md text-ink-2 transition-colors outline-none hover:bg-paper-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        <Icon className="size-[18px]" strokeWidth={1.75} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={flip}
      aria-label={label}
      title={label}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-ink-2 transition-colors outline-none hover:bg-paper-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <Icon className="size-[18px] shrink-0" strokeWidth={1.75} />
      <span>{theme === "dark" ? "Light theme" : "Dark theme"}</span>
    </button>
  );
}
