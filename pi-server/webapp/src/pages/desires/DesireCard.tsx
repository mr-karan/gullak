import { MessageSquare } from "lucide-react";

import { fmtCompact } from "@/lib/money";
import type { Desire } from "@/lib/types";
import { useDesirePhotoUrl } from "@/api/desires";
import { Pill } from "@/components/Pill";

import { statusLabel, statusPillTone } from "./status";

export function DesireCard({
  desire,
  personName,
  onOpen,
  onVerdict,
}: {
  desire: Desire;
  personName: (id: string | null) => string;
  onOpen: () => void;
  onVerdict: (status: "yes" | "nah") => void;
}) {
  const coverId = desire.photoIds[0] ?? null;
  const coverUrl = useDesirePhotoUrl(desire.id, coverId);

  return (
    <section className="flex flex-col overflow-hidden rounded-xl border border-rule bg-card">
      <button
        type="button"
        onClick={onOpen}
        className="group block text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <div className="aspect-[4/3] w-full overflow-hidden bg-paper-3">
          {coverUrl ? (
            // eslint-disable-next-line jsx-a11y/img-redundant-alt
            <img
              src={coverUrl}
              alt=""
              className="size-full object-cover transition-opacity group-hover:opacity-95"
            />
          ) : (
            <div className="grid size-full place-items-center text-2xl opacity-40" aria-hidden>
              🪄
            </div>
          )}
        </div>

        <div className="flex flex-col gap-1.5 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="min-w-0 truncate font-display text-lg leading-tight tracking-tight text-ink">
              {desire.title}
            </h3>
            <span className="shrink-0 text-sm font-semibold tabular-nums tracking-tight text-ink">
              {fmtCompact(desire.estCostCents)}
            </span>
          </div>

          <p className="text-xs text-ink-2">{personName(desire.person)}</p>

          {desire.why ? (
            <p className="mt-0.5 line-clamp-2 text-sm italic text-ink-2">{desire.why}</p>
          ) : null}
        </div>
      </button>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-rule px-4 py-2.5">
        <Pill tone={statusPillTone(desire.status)}>{statusLabel(desire.status)}</Pill>

        <div className="flex items-center gap-3">
          {desire.commentCount > 0 ? (
            <span className="flex items-center gap-1 text-xs tabular-nums text-ink-2">
              <MessageSquare className="size-3.5" />
              {desire.commentCount}
            </span>
          ) : null}

          {desire.status === "dreaming" ? (
            <span className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onVerdict("yes")}
                className="rounded text-sm font-medium text-pos transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => onVerdict("nah")}
                className="rounded text-sm text-ink-2 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ring"
              >
                Nah
              </button>
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}
