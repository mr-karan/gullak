import { Github } from "lucide-react";
import { Link, Outlet } from "react-router-dom";

import { useConnection } from "@/hooks/useConnection";
import { ConnectDialog } from "@/components/shell/ConnectDialog";
import { ThemeToggle } from "@/components/shell/ThemeToggle";

export function PublicShell() {
  const { connected, openDialog } = useConnection();

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <header className="sticky top-0 z-40 border-b border-rule bg-paper">
        <div className="mx-auto flex h-16 max-w-[92rem] items-center px-5 sm:px-8 lg:px-12">
          <Link
            to="/"
            className="font-display text-2xl font-semibold tracking-[-0.035em] text-ink outline-none"
          >
            Gullak<span aria-hidden className="text-brand">.</span>
          </Link>

          <nav aria-label="Public navigation" className="ml-auto flex items-center gap-1 text-sm">
            <Link
              to="/docs"
              className="hidden whitespace-nowrap px-3 py-2 font-medium text-ink-2 transition-colors duration-150 hover:text-ink sm:block"
            >
              How it works
            </Link>
            <a
              href="https://github.com/mr-karan/gullak"
              target="_blank"
              rel="noreferrer"
              aria-label="Gullak source on GitHub"
              className="hidden size-11 place-items-center text-ink-2 transition-colors duration-150 hover:text-ink sm:grid"
            >
              <Github className="size-[18px]" strokeWidth={1.75} />
            </a>
            <ThemeToggle iconOnly />
            {connected ? (
              <Link
                to="/overview"
                className="ml-2 min-h-11 whitespace-nowrap rounded-md border border-brand bg-brand px-4 py-2 font-semibold text-brand-ink transition-colors duration-150 hover:border-brand-2 hover:bg-brand-2"
              >
                Open ledger
              </Link>
            ) : (
              <button
                type="button"
                onClick={openDialog}
                className="ml-2 min-h-11 whitespace-nowrap rounded-md border border-brand bg-brand px-4 py-2 font-semibold text-brand-ink transition-colors duration-150 hover:border-brand-2 hover:bg-brand-2"
              >
                Connect server
              </button>
            )}
          </nav>
        </div>
      </header>

      <Outlet />

      <footer className="border-t border-rule">
        <div className="mx-auto max-w-[92rem] px-5 py-14 sm:px-8 lg:px-12 lg:py-20">
          <p className="max-w-3xl font-display text-3xl leading-tight tracking-[-0.035em] text-ink sm:text-5xl">
            Your ledger should belong to you.
          </p>
          <div className="mt-10 flex flex-col gap-4 border-t border-rule pt-5 text-sm text-ink-2 sm:flex-row sm:items-center sm:justify-between">
            <p>Open source. Local first. Self-hostable.</p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Link to="/docs" className="quiet-link whitespace-nowrap">Documentation</Link>
              <a href="https://github.com/mr-karan/gullak" className="quiet-link whitespace-nowrap">Source</a>
              <a href="https://github.com/mr-karan/gullak/releases" className="quiet-link whitespace-nowrap">Releases</a>
            </div>
          </div>
        </div>
      </footer>
      <ConnectDialog />
    </div>
  );
}
