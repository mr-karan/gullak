import { ArrowRight, Check, CloudOff, LockKeyhole, RefreshCw } from "lucide-react";
import { Link } from "react-router-dom";

import { useConnection } from "@/hooks/useConnection";

const boundaries = [
  ["Daily ledger", "Lives on your phone", "Works without a connection"],
  ["Sync", "Runs through your server", "Optional and retry-safe"],
  ["AI credentials", "Stay on your server", "Never stored in the app"],
  ["Money", "Integer minor units", "No decimal drift"],
] as const;

export function LandingPage() {
  const { openDialog } = useConnection();

  return (
    <main>
      <section className="border-b border-rule">
        <div className="mx-auto grid max-w-[92rem] min-w-0 gap-12 px-5 pt-10 pb-14 sm:px-8 sm:pt-14 sm:pb-20 lg:grid-cols-[minmax(0,0.9fr)_minmax(18rem,0.62fr)] lg:items-center lg:gap-20 lg:px-12 lg:pt-12 lg:pb-16">
          <div className="min-w-0 route-enter">
            <p className="max-w-xl text-base font-medium text-brand">A private expense tracker for Android and iOS.</p>
            <h1 className="mt-5 max-w-[11ch] [overflow-wrap:anywhere] font-display text-[clamp(3.2rem,7vw,6.6rem)] leading-[0.92] tracking-[-0.055em] text-ink">
              Your money stays on your phone.
            </h1>
            <p className="mt-7 max-w-[58ch] text-lg leading-8 text-ink-2">
              Log expenses instantly, review bank messages, and understand where your money went.
              Gullak works offline and syncs through a server you control when you want it to.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="https://github.com/mr-karan/gullak/releases"
                className="inline-flex whitespace-nowrap items-center gap-2 rounded-md border border-brand bg-brand px-5 py-3 font-semibold text-brand-ink transition-colors duration-150 hover:border-brand-2 hover:bg-brand-2"
              >
                Get the app <ArrowRight className="size-4" />
              </a>
              <button
                type="button"
                onClick={openDialog}
                className="whitespace-nowrap rounded-md border border-rule px-5 py-3 font-semibold text-ink transition-colors duration-150 hover:border-brand hover:text-brand-2"
              >
                Connect your server
              </button>
            </div>
            <p className="mt-5 text-sm text-ink-2">No account service. No mandatory cloud. No advertising profile.</p>
          </div>

          <figure className="mx-auto w-full max-w-[18rem] min-w-0 lg:mr-0 xl:max-w-[20rem]">
            <img
              src="/screens/01_home.png"
              alt="Gullak home screen showing monthly spending and recent transactions"
              width="1080"
              height="2400"
              fetchPriority="high"
              className="public-capture block h-auto w-full"
            />
            <figcaption className="mt-3 text-sm text-ink-2">The working ledger is local. This is the app, not a mock-up.</figcaption>
          </figure>
        </div>
      </section>

      <section className="mx-auto max-w-[92rem] px-5 py-16 sm:px-8 lg:px-12 lg:py-24">
        <div className="grid min-w-0 gap-12 lg:grid-cols-[minmax(15rem,0.55fr)_minmax(0,1fr)] lg:gap-20">
          <div className="lg:pt-10">
            <h2 className="font-display text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">Log first. Sort it out without friction.</h2>
            <p className="mt-5 max-w-[46ch] text-lg leading-8 text-ink-2">
              Quick Entry keeps the amount and account visible. SMS review turns bank messages into drafts instead of silently changing the ledger.
            </p>
            <ul className="mt-8 space-y-4 text-sm text-ink">
              <Fact>Fast manual entry remains available offline.</Fact>
              <Fact>Suggested payees and categories stay editable.</Fact>
              <Fact>Every saved amount uses integer minor units.</Fact>
            </ul>
          </div>
          <div className="grid min-w-0 gap-5 sm:grid-cols-[0.9fr_1.1fr] sm:items-start">
            <figure className="min-w-0 sm:mt-16">
              <img src="/screens/02_quick_entry.png" alt="Gullak Quick Entry screen" width="1080" height="2400" loading="lazy" className="public-capture block h-auto w-full" />
              <figcaption className="mt-3 text-sm text-ink-2">Capture without waiting for the network.</figcaption>
            </figure>
            <figure className="min-w-0">
              <img src="/screens/03_activity.png" alt="Gullak transaction activity ledger" width="1080" height="2400" loading="lazy" className="public-capture block h-auto w-full" />
              <figcaption className="mt-3 text-sm text-ink-2">Review the same ledger by day, account, category, or payee.</figcaption>
            </figure>
          </div>
        </div>
      </section>

      <section className="border-y border-rule bg-paper-2">
        <div className="mx-auto max-w-[92rem] px-5 py-16 sm:px-8 lg:px-12 lg:py-20">
          <div className="max-w-2xl">
            <h2 className="font-display text-4xl tracking-[-0.04em] sm:text-5xl">Clear boundaries, not privacy theatre.</h2>
            <p className="mt-5 text-lg leading-8 text-ink-2">Gullak names where each part of the system lives and what happens when the network disappears.</p>
          </div>
          <dl className="mt-12 border-t border-rule">
            {boundaries.map(([term, owner, note]) => (
              <div key={term} className="grid gap-2 border-b border-rule py-5 sm:grid-cols-[0.7fr_1fr_1fr] sm:items-baseline sm:gap-8">
                <dt className="font-semibold text-ink">{term}</dt>
                <dd className="text-ink">{owner}</dd>
                <dd className="text-sm text-ink-2">{note}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto grid max-w-[92rem] min-w-0 gap-12 px-5 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.56fr)] lg:items-center lg:gap-20 lg:px-12 lg:py-24">
        <div className="grid min-w-0 grid-cols-2 gap-5">
          <figure className="min-w-0">
            <img src="/screens/04_insights.png" alt="Gullak spending insights" width="1080" height="2400" loading="lazy" className="public-capture block h-auto w-full" />
          </figure>
          <figure className="min-w-0 pt-10 sm:pt-20">
            <img src="/screens/05_budget.png" alt="Gullak monthly budget view" width="1080" height="2400" loading="lazy" className="public-capture block h-auto w-full" />
          </figure>
        </div>
        <div>
          <h2 className="font-display text-4xl leading-tight tracking-[-0.04em] sm:text-5xl">See the month without turning money into a game.</h2>
          <p className="mt-5 text-lg leading-8 text-ink-2">Budgets, category breakdowns, cash flow, and recent activity stay readable and connected to the underlying transactions.</p>
          <Link to="/docs" className="quiet-link mt-8 inline-flex whitespace-nowrap items-center gap-2 font-semibold">
            Read how sync works <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <section className="border-t border-rule">
        <div className="mx-auto grid max-w-[92rem] gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.65fr_1fr] lg:gap-20 lg:px-12 lg:py-24">
          <div>
            <CloudOff className="size-6 text-brand" strokeWidth={1.6} />
            <h2 className="mt-5 font-display text-4xl tracking-[-0.04em] sm:text-5xl">Offline is ordinary.</h2>
          </div>
          <ol className="border-t border-rule">
            <SyncStep icon={LockKeyhole} title="Commit locally">Your action reaches the phone’s SQLite ledger before networking begins.</SyncStep>
            <SyncStep icon={RefreshCw} title="Exchange immutable changes">Devices send only the facts they changed and safely retry interrupted delivery.</SyncStep>
            <SyncStep icon={Check} title="Fold one shared history">The phone, web app, and server derive the same visible state from the merged event log.</SyncStep>
          </ol>
        </div>
      </section>
    </main>
  );
}

function Fact({ children }: { children: React.ReactNode }) {
  return <li className="flex gap-3"><Check className="mt-0.5 size-4 shrink-0 text-brand" /><span>{children}</span></li>;
}

function SyncStep({ icon: Icon, title, children }: { icon: typeof Check; title: string; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[2rem_1fr] gap-4 border-b border-rule py-6">
      <Icon className="mt-0.5 size-5 text-brand" strokeWidth={1.6} />
      <div><h3 className="font-semibold text-ink">{title}</h3><p className="mt-2 leading-7 text-ink-2">{children}</p></div>
    </li>
  );
}
