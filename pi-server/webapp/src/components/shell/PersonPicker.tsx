import { ChevronsUpDown } from "lucide-react";

import { useProfiles } from "@/api/profiles";
import { useConnection } from "@/hooks/useConnection";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Lightweight two-person attribution chip. Persists to gullak_person (same key
// the legacy app used). The "rail" variant (full-width, bind surface) is used in
// the mobile menu; the "bar" variant is a compact avatar for the command-first
// top bar (paper surface).
export function PersonPicker({ variant = "rail" }: { variant?: "rail" | "bar" }) {
  const { connected } = useConnection();
  const { data: profiles } = useProfiles(connected);
  const [personId, setPersonId] = useLocalStorage<string | null>("gullak_person", null);

  const list = profiles ?? [];
  const active = list.find((p) => p.id === personId) ?? list[0] ?? null;

  if (!active) return null;

  const trigger =
    variant === "bar" ? (
      <DropdownMenuTrigger
        aria-label={`Logging as ${active.name}`}
        title={`Logging as ${active.name}`}
        className="flex items-center gap-1.5 rounded-md px-1.5 py-1.5 text-sm text-ink transition-colors outline-none hover:bg-paper-3 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-paper-3 text-sm">
          {active.emoji ?? active.name.slice(0, 1)}
        </span>
        <ChevronsUpDown className="size-3.5 shrink-0 text-ink-2" />
      </DropdownMenuTrigger>
    ) : (
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-bind-ink transition-colors outline-none hover:bg-bind-2 focus-visible:ring-2 focus-visible:ring-brand">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-bind-2 text-sm">
          {active.emoji ?? active.name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{active.name}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-bind-mut" />
      </DropdownMenuTrigger>
    );

  return (
    <DropdownMenu>
      {trigger}
      <DropdownMenuContent
        side={variant === "bar" ? "bottom" : "top"}
        align="end"
        className="w-52"
      >
        <DropdownMenuLabel>Logging as</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {list.map((p) => (
          <DropdownMenuItem key={p.id} onSelect={() => setPersonId(p.id)}>
            <span className="grid size-5 place-items-center">{p.emoji ?? p.name.slice(0, 1)}</span>
            <span>{p.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
