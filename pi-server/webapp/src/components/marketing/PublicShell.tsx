import { BookOpen, Github } from "lucide-react";
import { Link, Outlet } from "react-router-dom";

import { useConnection } from "@/hooks/useConnection";
import { ConnectDialog } from "@/components/shell/ConnectDialog";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

export function PublicShell() {
  const { connected, openDialog } = useConnection();

  return (
    <div className="min-h-dvh overflow-x-hidden bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-rule/80 bg-paper/82 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-5 sm:px-8">
          <Link to="/" className="font-display text-xl tracking-tight text-ink">
            Gullak<span className="text-brand">.</span>
          </Link>
          <nav className="ml-auto flex items-center gap-1 text-sm text-ink-2">
            <Link
              to="/docs"
              className="hidden items-center gap-2 rounded-md px-3 py-2 transition-colors hover:bg-paper-3 hover:text-ink sm:flex"
            >
              <BookOpen className="size-4" />
              Docs
            </Link>
            <a
              href="https://github.com/mr-karan/gullak"
              target="_blank"
              rel="noreferrer"
              aria-label="Gullak on GitHub"
              className="grid size-9 place-items-center rounded-md transition-colors hover:bg-paper-3 hover:text-ink"
            >
              <Github className="size-[18px]" />
            </a>
            <ThemeToggle iconOnly />
            {connected ? (
              <Link
                to="/overview"
                className="ml-2 rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink transition-colors hover:bg-brand-2"
              >
                Open Gullak
              </Link>
            ) : (
              <button
                type="button"
                onClick={openDialog}
                className="ml-2 rounded-md bg-brand px-4 py-2 font-semibold text-brand-ink transition-colors hover:bg-brand-2"
              >
                Connect
              </button>
            )}
          </nav>
        </div>
      </header>

      <Outlet />

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-8 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>Gullak is open source and self-hostable.</p>
          <div className="flex gap-5">
            <Link to="/docs" className="hover:text-ink">Documentation</Link>
            <a href="https://github.com/mr-karan/gullak" className="hover:text-ink">Source</a>
            <a href="https://github.com/mr-karan/gullak/releases" className="hover:text-ink">Releases</a>
          </div>
        </div>
      </footer>
      <ConnectDialog />
    </div>
  );
}
