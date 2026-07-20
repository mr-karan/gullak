import { cn } from "@/lib/utils";

// The signature money chip — state that reads at a glance. Reserve it for a
// verdict (a net, a P&L, a status), not every number; overusing it flattens the
// page back into noise. Traffic-light tones are functional, not decorative.
export type PillTone = "pos" | "neg" | "warn" | "brand" | "neutral";

const TONES: Record<PillTone, string> = {
  pos: "bg-pill-pos-bg text-pill-pos-ink",
  neg: "bg-pill-neg-bg text-pill-neg-ink",
  warn: "bg-pill-warn-bg text-pill-warn-ink",
  brand: "bg-pill-brand-bg text-pill-brand-ink",
  neutral: "bg-paper-3 text-ink-2",
};

export function Pill({
  tone,
  className,
  children,
}: {
  tone: PillTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
