import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";

import { useIsDesktop } from "@/hooks/useMediaQuery";
import { AssistantPanel } from "@/components/chat/AssistantPanel";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { SelectionProvider } from "./SelectionProvider";
import { TopBar } from "./TopBar";
import { MobileBottomBar, MobileTopBar } from "./MobileNav";
import { SideRail } from "./SideRail";
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
    <main className="app-canvas min-h-0 flex-1 overflow-y-auto">
      <div className="app-content route-enter">
        <Outlet />
      </div>
    </main>
  );

  return (
    <SelectionProvider>
      <ChatProvider>
        <div className="flex h-dvh overflow-hidden bg-paper text-foreground">
          {isDesktop ? (
            <>
              <SideRail
                onOpenPalette={() => setPaletteOpen(true)}
                onOpenAssistant={() => setAssistantOpen((v) => !v)}
                onOpenQuickAdd={() => setQuickAddOpen(true)}
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <TopBar
                  onOpenPalette={() => setPaletteOpen(true)}
                  onOpenAssistant={() => setAssistantOpen((v) => !v)}
                  onOpenQuickAdd={() => setQuickAddOpen(true)}
                />
                <div className="flex min-h-0 flex-1">
                  {content}
                  {assistantOpen ? (
                    <AssistantPanel onCollapse={() => setAssistantOpen(false)} />
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileTopBar onOpenQuickAdd={() => setQuickAddOpen(true)} />
              {content}
              <MobileBottomBar />
            </div>
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
