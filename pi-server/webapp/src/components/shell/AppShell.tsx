import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

import { useIsDesktop } from "@/hooks/useMediaQuery";
import { AssistantPanel } from "@/components/chat/AssistantPanel";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { SelectionProvider } from "./SelectionProvider";
import { TopBar } from "./TopBar";
import { MobileBottomBar, MobilePersonRow, MobileTopBar } from "./MobileNav";
import { CommandPalette } from "./CommandPalette";
import { QuickAddDialog } from "./QuickAddDialog";
import { ConnectDialog } from "./ConnectDialog";

export function AppShell() {
  const isDesktop = useIsDesktop();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  // Command-first keyboard surface: ⌘K opens the omnibar palette, ⌘/ toggles the
  // assistant dock. Both live here so the top-bar controls and the shortcuts
  // drive the same lifted state.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        setAssistantOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const content = (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-8 sm:py-9">
        <Outlet />
      </div>
    </main>
  );

  return (
    <SelectionProvider>
      <ChatProvider>
        <div className="flex h-dvh flex-col overflow-hidden bg-paper text-foreground">
          {isDesktop ? (
            <>
              <TopBar
                onOpenPalette={() => setPaletteOpen(true)}
                onOpenAssistant={() => setAssistantOpen((v) => !v)}
                onOpenQuickAdd={() => setQuickAddOpen(true)}
              />
              {/* The assistant is a NON-MODAL dock: off by default (full-width
                  canvas), and when open the canvas simply makes room beside it —
                  no scrim, both panes stay live so you can read your data while
                  you chat. */}
              <div className="flex min-h-0 flex-1">
                {content}
                {assistantOpen ? (
                  <AssistantPanel onCollapse={() => setAssistantOpen(false)} />
                ) : null}
              </div>
            </>
          ) : (
            <>
              <MobileTopBar />
              {content}
              <MobilePersonRow />
              <MobileBottomBar />
            </>
          )}

          <CommandPalette
            open={paletteOpen}
            onOpenChange={setPaletteOpen}
            onAsk={() => setAssistantOpen(true)}
            onLog={() => setQuickAddOpen(true)}
          />
          <QuickAddDialog open={quickAddOpen} onOpenChange={setQuickAddOpen} />
          <ConnectDialog />
        </div>
      </ChatProvider>
    </SelectionProvider>
  );
}
