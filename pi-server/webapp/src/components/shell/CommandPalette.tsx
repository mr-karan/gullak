import { useNavigate } from "react-router-dom";
import { MessageSquarePlus, Plus, Sparkles } from "lucide-react";

import { ALL_NAV } from "./nav";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

// The omnibar target. Controlled by the shell so the top-bar search field and
// the ⌘K shortcut open the same dialog. Beyond jumping to a destination, it
// offers the two command-first verbs: ask the assistant, and log an expense.
export function CommandPalette({
  open,
  onOpenChange,
  onAsk,
  onLog,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onAsk: () => void;
  onLog: () => void;
}) {
  const navigate = useNavigate();

  function go(to: string) {
    onOpenChange(false);
    navigate(to);
  }

  function run(fn: () => void) {
    onOpenChange(false);
    fn();
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search, ask, or log an expense…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Actions">
          <CommandItem value="Log an expense transaction" onSelect={() => run(onLog)}>
            <Plus />
            Log an expense
          </CommandItem>
          <CommandItem value="Ask Gullak assistant chat" onSelect={() => run(onAsk)}>
            <Sparkles />
            Ask Gullak
          </CommandItem>
        </CommandGroup>
        <CommandGroup heading="Go to">
          {ALL_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem key={item.to} value={item.label} onSelect={() => go(item.to)}>
                <Icon />
                {item.label}
              </CommandItem>
            );
          })}
          <CommandItem value="New chat conversation" onSelect={() => run(onAsk)}>
            <MessageSquarePlus />
            New chat
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
