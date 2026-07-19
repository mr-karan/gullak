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
// the legacy app used). Sits at the foot of the nav rail on the bind surface.
export function PersonPicker() {
  const { connected } = useConnection();
  const { data: profiles } = useProfiles(connected);
  const [personId, setPersonId] = useLocalStorage<string | null>("gullak_person", null);

  const list = profiles ?? [];
  const active = list.find((p) => p.id === personId) ?? list[0] ?? null;

  if (!active) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-bind-ink transition-colors outline-none hover:bg-bind-2 focus-visible:ring-2 focus-visible:ring-brand">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-bind-2 text-sm">
          {active.emoji ?? active.name.slice(0, 1)}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">{active.name}</span>
        <ChevronsUpDown className="size-4 shrink-0 text-bind-mut" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-52">
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
