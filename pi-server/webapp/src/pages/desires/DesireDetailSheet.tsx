import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { iso, type DateRange, currentMonthRange } from "@/lib/dates";
import { fmtCents, fmtCompact, fmtDayMonth } from "@/lib/money";
import type { DesireComment } from "@/lib/types";
import {
  useAddDesireComment,
  useDeleteDesire,
  useDesire,
  useDesirePhotoUrl,
  useUpdateDesire,
  useUploadDesirePhoto,
} from "@/api/desires";
import { useSummaries } from "@/api/summary";
import { useTransactions } from "@/api/transactions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pill } from "@/components/Pill";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";

import { ConfirmDialog } from "./ConfirmDialog";
import { statusLabel, statusPillTone } from "./status";

const textareaClass =
  "flex w-full rounded-md border border-input bg-paper px-3 py-2 text-sm text-foreground transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** Last three FULL calendar months (excludes the current, partial month). */
function lastThreeFullMonths(now = new Date()): DateRange[] {
  const ranges: DateRange[] = [];
  for (let i = 1; i <= 3; i++) {
    const first = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const last = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
    ranges.push({ startDate: iso(first), endDate: iso(last) });
  }
  return ranges;
}

export function DesireDetailSheet({
  desireId,
  open,
  onOpenChange,
  person,
  personName,
}: {
  desireId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: string | null;
  personName: (id: string | null) => string;
}) {
  const detailQ = useDesire(open ? desireId : null);
  const detail = detailQ.data;
  const desire = detail?.desire;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-lg"
      >
        <SheetHeader className="pr-8">
          <SheetTitle>{desire?.title ?? "Desire"}</SheetTitle>
          {desire ? (
            <p className="flex items-center gap-2 text-sm text-ink-2">
              <span className="truncate">{personName(desire.person)}</span>
              <Pill tone={statusPillTone(desire.status)}>{statusLabel(desire.status)}</Pill>
            </p>
          ) : null}
        </SheetHeader>

        {detailQ.isLoading || !desire || !detail ? (
          <div className="mt-4 flex flex-col gap-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <DetailBody
            desireId={desire.id}
            title={desire.title}
            photos={detail.photos}
            comments={detail.comments}
            why={desire.why}
            estCostCents={desire.estCostCents}
            status={desire.status}
            boughtTransactionId={desire.boughtTransactionId}
            person={person}
            personName={personName}
            onDeleted={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

function DetailBody({
  desireId,
  title,
  photos,
  comments,
  why,
  estCostCents,
  status,
  boughtTransactionId,
  person,
  personName,
  onDeleted,
}: {
  desireId: string;
  title: string;
  photos: { id: string }[];
  comments: DesireComment[];
  why: string | null;
  estCostCents: number;
  status: string;
  boughtTransactionId: string | null;
  person: string | null;
  personName: (id: string | null) => string;
  onDeleted: () => void;
}) {
  const update = useUpdateDesire();
  const upload = useUploadDesirePhoto();
  const del = useDeleteDesire();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Local, editable copies. Reset whenever the underlying desire row changes.
  const [whyDraft, setWhyDraft] = useState(why ?? "");
  const [costDraft, setCostDraft] = useState(String(estCostCents / 100));
  useEffect(() => setWhyDraft(why ?? ""), [why, desireId]);
  useEffect(() => setCostDraft(String(estCostCents / 100)), [estCostCents, desireId]);

  const saveWhy = () => {
    const next = whyDraft.trim();
    if (next === (why ?? "")) return;
    update.mutate(
      { id: desireId, patch: { why: next || null } },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save.") },
    );
  };

  const saveCost = () => {
    const cents = Math.round(Number(costDraft) * 100);
    if (!Number.isFinite(cents) || cents < 0 || cents === estCostCents) {
      setCostDraft(String(estCostCents / 100));
      return;
    }
    update.mutate(
      { id: desireId, patch: { estCostCents: cents } },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to save.") },
    );
  };

  const setStatus = (next: "dreaming" | "yes" | "nah" | "bought") =>
    update.mutate(
      { id: desireId, patch: { status: next } },
      { onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to update.") },
    );

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    upload.mutate(
      { id: desireId, file },
      {
        onSuccess: () => toast.success("Photo added."),
        // Server caps at 6 × 5MB and sniffs the bytes — surface its message.
        onError: (err) => toast.error(err instanceof Error ? err.message : "Upload failed."),
      },
    );
  };

  return (
    <div className="mt-4 flex flex-col gap-6 pb-4">
      {/* Photo strip + upload */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {photos.map((p) => (
            <PhotoThumb key={p.id} desireId={desireId} photoId={p.id} />
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending || photos.length >= 6}
            className="grid size-20 shrink-0 place-items-center rounded-md border border-dashed border-rule text-xs text-ink-2 transition-colors hover:bg-paper-3 disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-ring"
          >
            {upload.isPending ? "…" : photos.length >= 6 ? "Full" : "+ Photo"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={onPickFile}
          />
        </div>
      </section>

      {/* Est cost */}
      <section className="flex flex-col gap-1.5">
        <label htmlFor="detail-cost" className="text-sm font-medium text-ink">
          Est. cost (₹)
        </label>
        <Input
          id="detail-cost"
          inputMode="decimal"
          value={costDraft}
          onChange={(e) => setCostDraft(e.target.value)}
          onBlur={saveCost}
          className="tnum"
        />
        <Affordability estCostCents={estCostCents} />
      </section>

      {/* Why */}
      <section className="flex flex-col gap-1.5">
        <label htmlFor="detail-why" className="text-sm font-medium text-ink">
          Why
        </label>
        <textarea
          id="detail-why"
          value={whyDraft}
          onChange={(e) => setWhyDraft(e.target.value)}
          onBlur={saveWhy}
          rows={3}
          placeholder="What makes this worth wanting?"
          className={textareaClass}
        />
      </section>

      {/* Status transitions */}
      <section className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ink">Status</p>
        <div className="flex flex-wrap items-center gap-4">
          {status === "dreaming" ? (
            <>
              <TransitionButton tone="pos" onClick={() => setStatus("yes")}>
                Say yes
              </TransitionButton>
              <TransitionButton onClick={() => setStatus("nah")}>Nah, skip it</TransitionButton>
            </>
          ) : null}
          {status === "yes" ? (
            <TransitionButton tone="accent" onClick={() => setStatus("bought")}>
              Mark bought
            </TransitionButton>
          ) : null}
          {status !== "dreaming" ? (
            <TransitionButton onClick={() => setStatus("dreaming")}>
              Back to dreaming
            </TransitionButton>
          ) : null}
        </div>
      </section>

      {status === "bought" ? (
        <BoughtLink
          desireId={desireId}
          estCostCents={estCostCents}
          boughtTransactionId={boughtTransactionId}
        />
      ) : null}

      {/* Comments */}
      <CommentsThread
        desireId={desireId}
        comments={comments}
        person={person}
        personName={personName}
      />

      {/* Delete */}
      <section className="border-t border-rule pt-4">
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          className="rounded text-sm text-neg transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Delete this desire
        </button>
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete "${title}"?`}
        description="This removes the desire, its photos and comments. It can't be undone."
        pending={del.isPending}
        onConfirm={() =>
          del.mutate(desireId, {
            onSuccess: () => {
              setConfirmOpen(false);
              onDeleted();
              toast.success("Desire deleted.");
            },
            onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to delete."),
          })
        }
      />
    </div>
  );
}

function TransitionButton({
  children,
  onClick,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "pos" | "accent";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        tone === "pos" && "text-pos hover:opacity-80",
        tone === "accent" && "text-brand hover:opacity-80",
        !tone && "text-ink-2 hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

function PhotoThumb({ desireId, photoId }: { desireId: string; photoId: string }) {
  const url = useDesirePhotoUrl(desireId, photoId);
  return (
    <div className="size-20 shrink-0 overflow-hidden rounded-md bg-paper-3">
      {url ? <img src={url} alt="" className="size-full object-cover" /> : null}
    </div>
  );
}

// Avg surplus over the last three full months → months-of-surplus. Numbers, not
// judgement (bahi-khata law: never moralise a want).
function Affordability({ estCostCents }: { estCostCents: number }) {
  const ranges = useMemo(() => lastThreeFullMonths(), []);
  const results = useSummaries(ranges);
  const nets = results.filter((r) => r.data).map((r) => r.data!.netCents);
  if (results.some((r) => r.isLoading) && nets.length === 0) {
    return <p className="text-xs text-ink-2">Reading your recent surplus…</p>;
  }
  if (!nets.length) return null;
  const avg = Math.round(nets.reduce((a, b) => a + b, 0) / nets.length);
  const months = avg > 0 && estCostCents > 0 ? Math.max(1, Math.round(estCostCents / avg)) : null;
  return (
    <p className="text-xs text-ink-2 tnum">
      ~{fmtCompact(avg)}/mo avg surplus
      {months !== null ? ` · ≈ ${months} month${months === 1 ? "" : "s"} of surplus` : ""}
    </p>
  );
}

function BoughtLink({
  desireId,
  estCostCents,
  boughtTransactionId,
}: {
  desireId: string;
  estCostCents: number;
  boughtTransactionId: string | null;
}) {
  const range = useMemo(() => currentMonthRange(), []);
  const txnQ = useTransactions(range);
  const update = useUpdateDesire();

  const candidates = useMemo(() => {
    const lo = estCostCents * 0.9;
    const hi = estCostCents * 1.1;
    return (txnQ.data?.transactions ?? [])
      .filter((t) => {
        const a = Math.abs(t.amountCents);
        return a >= lo && a <= hi;
      })
      .slice(0, 8);
  }, [txnQ.data, estCostCents]);

  const link = (id: string) =>
    update.mutate(
      { id: desireId, patch: { boughtTransactionId: id } },
      {
        onSuccess: () => toast.success("Transaction linked."),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to link."),
      },
    );

  if (boughtTransactionId) {
    return (
      <section className="flex flex-col gap-1">
        <p className="text-sm font-medium text-ink">Linked purchase</p>
        <p className="text-xs text-ink-2">A transaction is linked to this desire.</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <p className="text-sm font-medium text-ink">Link the purchase</p>
      {txnQ.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : candidates.length === 0 ? (
        <p className="text-xs text-ink-2">
          No transactions this month within 10% of {fmtCompact(estCostCents)}.
        </p>
      ) : (
        <ul className="flex flex-col">
          {candidates.map((t) => (
            <li key={t.id} className="border-t border-rule first:border-t-0">
              <button
                type="button"
                onClick={() => link(t.id)}
                className="-mx-2 flex w-[calc(100%+1rem)] items-center justify-between gap-3 rounded-md px-2 py-2 text-left transition-colors hover:bg-paper-3 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm text-ink">{t.payeeName || "Unknown"}</span>
                  <span className="block text-xs text-ink-2">{fmtDayMonth(t.date)}</span>
                </span>
                <span className="shrink-0 text-sm tnum text-ink">{fmtCents(Math.abs(t.amountCents))}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentsThread({
  desireId,
  comments,
  person,
  personName,
}: {
  desireId: string;
  comments: DesireComment[];
  person: string | null;
  personName: (id: string | null) => string;
}) {
  const [body, setBody] = useState("");
  const add = useAddDesireComment();

  const submit = () => {
    const text = body.trim();
    if (!text || !person) return;
    add.mutate(
      { id: desireId, person, body: text },
      {
        onSuccess: () => setBody(""),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to comment."),
      },
    );
  };

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm font-medium text-ink">Talk it over</p>

      {comments.length === 0 ? (
        <p className="text-xs text-ink-2">No comments yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {comments.map((c) => (
            <li key={c.id} className="flex flex-col gap-0.5">
              <span className="text-xs font-medium text-ink">{personName(c.person)}</span>
              <span className="text-sm text-ink-2">{c.body}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-col gap-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={2}
          placeholder={person ? "Add a thought…" : "Pick who you're logging as first."}
          disabled={!person}
          className={textareaClass}
        />
        <div className="flex justify-end">
          <Button size="sm" onClick={submit} disabled={!body.trim() || !person || add.isPending}>
            {add.isPending ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
    </section>
  );
}
