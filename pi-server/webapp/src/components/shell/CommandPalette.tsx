import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MessageSquarePlus } from "lucide-react";

import { ALL_NAV } from "./nav";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(to: string) {
    setOpen(false);
    navigate(to);
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Go to…" />
      <CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        <CommandGroup heading="Destinations">
          {ALL_NAV.map((item) => {
            const Icon = item.icon;
            return (
              <CommandItem key={item.to} value={item.label} onSelect={() => go(item.to)}>
                <Icon />
                {item.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandGroup heading="Assistant">
          <CommandItem value="New chat" onSelect={() => go("/chat")}>
            <MessageSquarePlus />
            New chat
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
