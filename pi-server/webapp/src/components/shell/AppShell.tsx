import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { PanelRightOpen } from "lucide-react";

import { useIsDesktop } from "@/hooks/useMediaQuery";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { AssistantPanel } from "@/components/chat/AssistantPanel";
import { ChatProvider } from "@/components/chat/ChatProvider";
import { SelectionProvider } from "./SelectionProvider";
import { NavRail } from "./NavRail";
import { MobileBottomBar, MobilePersonRow, MobileTopBar } from "./MobileNav";
import { CommandPalette } from "./CommandPalette";
import { ConnectDialog } from "./ConnectDialog";

export function AppShell() {
  const isDesktop = useIsDesktop();
  const [assistantOpen, setAssistantOpen] = useLocalStorage("gullak_sidebar_open", true);

  // Cmd/Ctrl + "/" toggles the assistant panel (desktop only).
  useEffect(() => {
    if (!isDesktop) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "/" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setAssistantOpen(!assistantOpen);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDesktop, assistantOpen, setAssistantOpen]);

  const content = (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-5 py-7 sm:px-8 sm:py-9">
        <Outlet />
      </div>
    </main>
  );

  return (
    <SelectionProvider>
    <ChatProvider>
    <div className="flex h-dvh flex-col overflow-hidden bg-paper text-foreground">
      {isDesktop ? (
        <div className="flex min-h-0 flex-1">
          <NavRail />
          {content}
          {assistantOpen ? (
            <AssistantPanel onCollapse={() => setAssistantOpen(false)} />
          ) : (
            <div className="flex w-11 shrink-0 flex-col items-center border-l border-rule bg-paper-2 py-4">
              <button
                type="button"
                onClick={() => setAssistantOpen(true)}
                aria-label="Open assistant (⌘/)"
                title="Open assistant (⌘/)"
                className="grid size-8 place-items-center rounded-md text-ink-2 transition-colors hover:bg-paper-3 hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PanelRightOpen className="size-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <MobileTopBar />
          {content}
          <MobilePersonRow />
          <MobileBottomBar />
        </>
      )}

      <CommandPalette />
      <ConnectDialog />
    </div>
    </ChatProvider>
    </SelectionProvider>
  );
}
