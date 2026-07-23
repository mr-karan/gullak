import { cn } from "@/lib/utils";

// A single subtle hairline under page titles, table header rows, and atop the
// assistant panel. tally is flat and minimal — the old double-rule read as
// retro, so this is one clean 1px divider. The API is unchanged so every call
// site still works; `tone` only nudges the opacity.
export function LedgerRule({
  className,
  tone = "ink",
}: {
  className?: string;
  tone?: "ink" | "bind";
}) {
  const line = tone === "bind" ? "bg-sidebar-border" : "bg-rule";
  return (
    <div className={cn(className)} aria-hidden="true">
      <div className={cn("h-px w-full", line)} />
    </div>
  );
}
