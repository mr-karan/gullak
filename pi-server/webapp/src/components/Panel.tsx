import { cn } from "@/lib/utils";

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
    <section className={cn("overflow-hidden rounded-md border border-rule bg-card", className)}>
      {(title || right) && (
        <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
          {title ? (
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
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
