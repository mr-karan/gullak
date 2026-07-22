import { ArrowRight, CloudOff, GitMerge, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";

import { useConnection } from "@/hooks/useConnection";

const principles = [
  {
    icon: CloudOff,
    title: "Works where you are",
    body: "Log and edit expenses without a signal. Your phone remains useful on a flight, in a basement, or behind a bad network.",
  },
  {
    icon: GitMerge,
    title: "Merges intent, not snapshots",
    body: "Gullak syncs immutable field changes. A note edit cannot smuggle an old payee or category over somebody else’s newer work.",
  },
  {
    icon: KeyRound,
    title: "Your server, your keys",
    body: "Self-host the merge server and keep model credentials off the phone. The app still works when the server is unavailable.",
  },
];

export function LandingPage() {
  const { openDialog } = useConnection();

  return (
    <main>
      <section className="relative isolate border-b border-rule">
        <div className="landing-grid absolute inset-0 -z-10 opacity-50" aria-hidden />
        <div className="mx-auto grid min-h-[680px] max-w-7xl items-center gap-14 px-5 py-20 sm:px-8 lg:grid-cols-[1.08fr_0.92fr] lg:py-28">
          <div className="max-w-3xl">
            <p className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-brand">
              <ShieldCheck className="size-4" /> Local-first personal finance
            </p>
            <h1 className="max-w-4xl font-display text-5xl leading-[0.96] tracking-[-0.055em] text-ink sm:text-7xl lg:text-[5.6rem]">
              Your money ledger should survive the network.
            </h1>
            <p className="mt-7 max-w-2xl text-lg leading-8 text-ink-2 sm:text-xl">
              Gullak is a fast, private expense tracker for Android and iOS. It works offline,
              reconciles edits with a causal CRDT, and syncs through a server you control.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={openDialog}
                className="group inline-flex items-center gap-2 rounded-md bg-brand px-5 py-3 font-semibold text-brand-ink transition-colors hover:bg-brand-2"
              >
                Connect your server
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </button>
              <Link
                to="/docs"
                className="inline-flex items-center gap-2 rounded-md border border-rule bg-paper-2 px-5 py-3 font-semibold text-ink transition-colors hover:border-brand/50"
              >
                Read how sync works
              </Link>
            </div>
            <p className="mt-5 text-sm text-ink-2">No account service. No mandatory cloud. Integer money, always.</p>
          </div>

          <LedgerProof />
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8">
        <div className="mb-12 grid gap-5 md:grid-cols-2 md:items-end">
          <h2 className="font-display text-4xl tracking-[-0.04em] sm:text-5xl">Built around failure.</h2>
          <p className="max-w-xl text-lg leading-8 text-ink-2 md:justify-self-end">
            Offline is not an error state. Duplicate delivery, retries, clock skew, and interrupted
            pages are normal inputs to the design.
          </p>
        </div>
        <div className="grid border-l border-t border-rule md:grid-cols-3">
          {principles.map(({ icon: Icon, title, body }, index) => (
            <article key={title} className="min-h-64 border-b border-r border-rule bg-paper-2/50 p-7 sm:p-9">
              <div className="mb-16 flex items-start justify-between">
                <Icon className="size-6 text-brand" strokeWidth={1.6} />
                <span className="font-mono text-xs text-ink-2">0{index + 1}</span>
              </div>
              <h3 className="text-xl font-bold tracking-tight">{title}</h3>
              <p className="mt-3 leading-7 text-ink-2">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-rule bg-paper-2">
        <div className="mx-auto grid max-w-7xl gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">One union. One answer.</p>
            <h2 className="mt-5 font-display text-4xl tracking-[-0.04em] sm:text-5xl">Every device folds the same history.</h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-3">
            {[
              ["Phone", "assign notes", "actor p · 42"],
              ["Web", "assign payee", "actor w · 18"],
              ["Merged", "both survive", "same projection"],
            ].map(([label, action, dot]) => (
              <div key={label} className="bg-paper p-6">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-ink-2">{label}</p>
                <p className="mt-8 text-lg font-semibold text-ink">{action}</p>
                <p className="mt-2 font-mono text-xs text-brand">{dot}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-5 py-24 sm:px-8 md:flex-row md:items-center">
        <div>
          <Smartphone className="mb-5 size-7 text-brand" />
          <h2 className="font-display text-4xl tracking-[-0.04em]">Start local. Add sync when you want it.</h2>
          <p className="mt-3 text-lg text-ink-2">The phone remains the daily tool; the server is a merge point, not a dependency.</p>
        </div>
        <a
          href="https://github.com/mr-karan/gullak/releases"
          className="inline-flex shrink-0 items-center gap-2 rounded-md border border-rule px-5 py-3 font-semibold transition-colors hover:border-brand/50 hover:bg-paper-2"
        >
          Get the app <ArrowRight className="size-4" />
        </a>
      </section>
    </main>
  );
}

function LedgerProof() {
  return (
    <div className="relative mx-auto w-full max-w-lg lg:mr-0">
      <div className="absolute -inset-12 -z-10 rounded-full bg-brand/10 blur-3xl" aria-hidden />
      <div className="overflow-hidden rounded-xl border border-rule bg-paper-2 shadow-2xl shadow-black/20">
        <div className="flex items-center justify-between border-b border-rule px-5 py-4">
          <span className="text-sm font-semibold">Causal journal</span>
          <span className="rounded-full bg-pill-pos-bg px-2.5 py-1 text-xs font-bold text-pill-pos-ink">Converged</span>
        </div>
        <div className="divide-y divide-rule font-mono text-xs">
          <ProofRow dot="p:42" field="notes" value="probe" tone="text-warn" />
          <ProofRow dot="w:18" field="payeeName" value="Dyson V15" tone="text-brand" />
          <ProofRow dot="p:43" field="amountCents" value="-54900" tone="text-neg" />
        </div>
        <div className="grid grid-cols-[1fr_auto] gap-4 border-t border-rule bg-paper p-5">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-ink-2">Materialized transaction</p>
            <p className="mt-2 text-lg font-bold">Dyson V15</p>
            <p className="mt-1 text-sm text-ink-2">notes: probe</p>
          </div>
          <p className="tnum self-end text-lg font-bold text-neg">−₹549.00</p>
        </div>
      </div>
    </div>
  );
}

function ProofRow({ dot, field, value, tone }: { dot: string; field: string; value: string; tone: string }) {
  return (
    <div className="grid grid-cols-[3.5rem_1fr] gap-4 px-5 py-4">
      <span className="text-ink-2">{dot}</span>
      <span className="min-w-0"><span className="text-ink-2">assign </span>{field}<span className="text-ink-2"> = </span><span className={tone}>{value}</span></span>
    </div>
  );
}
