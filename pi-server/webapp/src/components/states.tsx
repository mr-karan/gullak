import type { ReactNode } from "react";

import { Button } from "./ui/button";

// Quiet states: one ink-2 sentence, never an illustration. Optional single
// action rendered as a ghost button.
export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-10">
      <p className="text-sm text-foreground">{title}</p>
      {hint ? <p className="text-sm text-ink-2">{hint}</p> : null}
      {action ? (
        <Button variant="ghost" size="sm" className="mt-1 -ml-3" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-start gap-2 py-10">
      <p className="text-sm text-neg">Something went wrong.</p>
      <p className="text-sm text-ink-2">{message || "The request failed. Try again in a moment."}</p>
      {onRetry ? (
        <Button variant="ghost" size="sm" className="mt-1 -ml-3" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function CenterNote({ children }: { children: ReactNode }) {
  return <p className="py-10 text-sm text-ink-2">{children}</p>;
}
