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
    <div className="flex max-w-xl flex-col items-start gap-2 border-l-2 border-rule py-2 pl-5">
      <p className="font-semibold text-foreground">{title}</p>
      {hint ? <p className="text-sm text-ink-2">{hint}</p> : null}
      {action ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={action.onClick}>
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
    <div className="flex max-w-xl flex-col items-start gap-2 border-l-2 border-neg py-2 pl-5">
      <p className="font-semibold text-neg">The request failed.</p>
      <p className="text-sm text-ink-2">{message || "The request failed. Try again in a moment."}</p>
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function CenterNote({ children }: { children: ReactNode }) {
  return <p className="py-10 text-sm text-ink-2">{children}</p>;
}
