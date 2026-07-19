// Desire statuses are the server enum (dreaming | yes | nah | bought). Per the
// bahi-khata law these render as plain tonal words — never capsule pills.

export const DESIRE_STATUSES = ["dreaming", "yes", "nah", "bought"] as const;
export type DesireStatusValue = (typeof DESIRE_STATUSES)[number];

export const STATUS_LABEL: Record<string, string> = {
  dreaming: "Dreaming",
  yes: "Yes",
  nah: "Nah",
  bought: "Bought",
};

/** Tailwind text-colour class per status. Dreaming/Nah are quiet ink-2; a
    green "Yes" reads as approval; "Bought" takes the brand accent. */
export const STATUS_TONE: Record<string, string> = {
  dreaming: "text-ink-2",
  yes: "text-pos",
  nah: "text-ink-2",
  bought: "text-brand",
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function statusTone(status: string): string {
  return STATUS_TONE[status] ?? "text-ink-2";
}

// The verb filter offers All + each status as sentence-case words.
export const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "dreaming", label: "Dreaming" },
  { value: "yes", label: "Yes" },
  { value: "nah", label: "Nah" },
  { value: "bought", label: "Bought" },
];
