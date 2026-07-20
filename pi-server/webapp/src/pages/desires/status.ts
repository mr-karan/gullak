import type { PillTone } from "@/components/Pill";

// Desire statuses are the server enum (dreaming | yes | nah | bought).

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

/** The verdict as a traffic-light Pill tone: a green "Yes" reads as approval,
    "Bought" takes the brand accent, dreaming/nah stay quiet neutral. */
export const STATUS_PILL_TONE: Record<string, PillTone> = {
  dreaming: "neutral",
  yes: "pos",
  nah: "neutral",
  bought: "brand",
};

export function statusPillTone(status: string): PillTone {
  return STATUS_PILL_TONE[status] ?? "neutral";
}

// The verb filter offers All + each status as sentence-case words.
export const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "dreaming", label: "Dreaming" },
  { value: "yes", label: "Yes" },
  { value: "nah", label: "Nah" },
  { value: "bought", label: "Bought" },
];
