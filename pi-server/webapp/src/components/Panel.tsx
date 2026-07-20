import { cn } from "@/lib/utils";

// The structural unit of the redesign: a flat, hairline-bordered section —
// squared and edge-defined, NOT a floating rounded card with shadow. Its header
// is an uppercase, tracked label plus an optional right slot (a count, a link, a
// control). Compose views out of Panels + real tables, not stacks of cards.
export function Panel({
  title,
  right,
  children,
  className,
  bodyClassName,
}: {
  title?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-rule bg-card", className)}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
          {title ? (
            <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-2">{title}</h2>
          ) : (
            <span />
          )}
          {right}
        </header>
      )}
      {bodyClassName ? <div className={bodyClassName}>{children}</div> : children}
    </section>
  );
}
