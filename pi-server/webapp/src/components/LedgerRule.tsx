import { cn } from "@/lib/utils";

// The bahi-khata signature geometry: a double hairline (1.5px + 0.75px, rounded
// caps, 5px total). Used ONLY under page titles, under table header rows, and
// atop the assistant panel — nowhere else. That restraint is what makes it a
// signature rather than decoration.
export function LedgerRule({
  className,
  tone = "ink",
}: {
  className?: string;
  tone?: "ink" | "bind";
}) {
  const strong = tone === "bind" ? "bg-bind-ink/60" : "bg-ink/55";
  const faint = tone === "bind" ? "bg-bind-ink/25" : "bg-ink/25";
  return (
    <div className={cn("flex flex-col gap-[2.75px]", className)} aria-hidden="true">
      <div className={cn("h-[1.5px] rounded-full", strong)} />
      <div className={cn("h-[0.75px] rounded-full", faint)} />
    </div>
  );
}
