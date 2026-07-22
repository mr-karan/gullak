import { AlertTriangle, ArrowRight, Check, GitBranch, RefreshCw, Server, Smartphone } from "lucide-react";
import { Link } from "react-router-dom";

const toc = [
  ["overview", "Overview"],
  ["local-first", "Local-first model"],
  ["crdt", "Causal CRDT"],
  ["conflicts", "Conflicts"],
  ["recovery", "Recovery"],
  ["self-hosting", "Self-hosting"],
];

export function DocsPage() {
  return (
    <main className="mx-auto grid max-w-7xl gap-12 px-5 py-14 sm:px-8 lg:grid-cols-[220px_minmax(0,760px)] lg:justify-between lg:py-20">
      <aside className="hidden lg:block">
        <div className="sticky top-28">
          <p className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-ink-2">On this page</p>
          <nav className="flex flex-col border-l border-rule text-sm">
            {toc.map(([id, label]) => (
              <a key={id} href={`#${id}`} className="-ml-px border-l border-transparent px-4 py-2 text-ink-2 hover:border-brand hover:text-ink">
                {label}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      <article className="min-w-0">
        <header id="overview" className="scroll-mt-28 border-b border-rule pb-12">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-brand">Architecture guide</p>
          <h1 className="mt-5 font-display text-5xl tracking-[-0.05em] sm:text-6xl">How Gullak keeps one ledger across unreliable devices.</h1>
          <p className="mt-6 text-xl leading-8 text-ink-2">
            The phone owns the interaction. The sync server merges immutable changes. Relational rows are rebuildable views of that shared history.
          </p>
          <div className="mt-8 flex flex-wrap gap-3 text-sm">
            {['Offline writes', 'Deterministic merge', 'No clock ordering', 'Explicit quarantine'].map((item) => (
              <span key={item} className="inline-flex items-center gap-2 rounded-full border border-rule px-3 py-1.5 text-ink-2">
                <Check className="size-3.5 text-pos" /> {item}
              </span>
            ))}
          </div>
        </header>

        <DocSection id="local-first" eyebrow="01" title="Local-first model">
          <p>
            Every user action commits to the phone’s SQLite database before networking begins. The UI reads that local projection immediately. Sync can retry later without holding the interaction open.
          </p>
          <Flow />
          <p>
            The server is a merge point and a durable home for model credentials. Losing connectivity delays replication; it does not make the expense tracker unusable.
          </p>
        </DocSection>

        <DocSection id="crdt" eyebrow="02" title="A causal field CRDT, not row-level LWW">
          <p>
            Each edit is an immutable event naming only the fields the action changed. A note edit carries <code>notes</code>; it does not resend the whole transaction. That is the fundamental protection against stale metadata overwrites.
          </p>
          <pre className="overflow-x-auto rounded-lg border border-rule bg-paper-2 p-5 text-sm leading-7 text-ink"><code>{`{
  "changeId": "phone:42",
  "context": { "phone": 41, "web": 17 },
  "ops": [
    { "kind": "assign", "resource": "transactions",
      "entityId": "…", "field": "notes", "value": "probe" }
  ]
}`}</code></pre>
          <p>
            Causal context tells Gullak whether one value observed another. Wall-clock timestamps are audit metadata only, so a device set years into the future cannot permanently shadow later edits.
          </p>
          <Callout title="Why the old incident cannot recur in this form">
            The phone’s note change and the web’s payee change touch different registers. Their union contains both. Delivery order, retries, and pagination cannot turn either one into an implicit write to the other field.
          </Callout>
        </DocSection>

        <DocSection id="conflicts" eyebrow="03" title="Concurrent edits remain evidence">
          <p>
            When two replicas concurrently assign the same field, Gullak retains both causally maximal candidates. A deterministic Lamport/actor/sequence tuple selects the visible projection, so every replica displays the same value without deleting the losing fact.
          </p>
          <div className="grid gap-px overflow-hidden rounded-lg border border-rule bg-rule sm:grid-cols-3">
            <ConflictCell icon={Smartphone} label="Phone" value="Food" meta="phone:9" />
            <ConflictCell icon={Server} label="Web" value="Lifestyle" meta="web:4" />
            <ConflictCell icon={GitBranch} label="Projection" value="Lifestyle" meta="2 candidates retained" />
          </div>
          <p>
            A later explicit edit observes both candidates and causally supersedes them. This is where a deterministic tie-break is useful: at read time over a merged log, rather than destructively at ingestion.
          </p>
        </DocSection>

        <DocSection id="recovery" eyebrow="04" title="Retries, poison, and recovery">
          <ul className="space-y-4">
            <Guarantee title="Idempotent delivery">The event dot <code>(actorId, sequence)</code> is unique. Exact retries are safe; different bytes under the same dot are rejected.</Guarantee>
            <Guarantee title="Atomic pages">Events, causal frontiers, register state, and visible rows commit in one SQLite transaction.</Guarantee>
            <Guarantee title="Quarantine without wedging">Malformed events are recorded with their original bytes and reason. They are surfaced while unrelated valid events continue.</Guarantee>
            <Guarantee title="Checkpoint bootstrap">A client below retained history installs a content-hash-verified checkpoint rather than guessing across a cursor gap.</Guarantee>
          </ul>
          <div className="mt-8 flex gap-3 rounded-lg border border-warn/30 bg-pill-warn-bg p-5 text-pill-warn-ink">
            <AlertTriangle className="mt-0.5 size-5 shrink-0" />
            <p className="text-sm leading-6">CRDT convergence does not magically preserve every cross-row financial invariant. Compound actions are validated and applied atomically; invariants that are not merge-safe still require coordination or explicit rejection.</p>
          </div>
        </DocSection>

        <DocSection id="self-hosting" eyebrow="05" title="Self-hosting boundary">
          <p>
            The Flutter app stores the working ledger locally. The Hono/SQLite server accepts authenticated CRDT events, serves checkpoints, materializes the web projection, and holds optional AI provider keys. Money stays integer minor units and IDs are client-generated UUIDs.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <Boundary icon={Smartphone} title="On the device" items={["Working SQLite ledger", "Immutable local events", "SMS review and quick entry", "Offline reads and writes"]} />
            <Boundary icon={Server} title="On your server" items={["Authenticated merge log", "Web materialized view", "Checkpoint and recovery state", "Optional model credentials"]} />
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <a href="https://github.com/mr-karan/gullak" className="inline-flex items-center gap-2 rounded-md bg-brand px-5 py-3 font-semibold text-brand-ink hover:bg-brand-2">
              Read the source <ArrowRight className="size-4" />
            </a>
            <Link to="/" className="inline-flex items-center gap-2 rounded-md border border-rule px-5 py-3 font-semibold hover:bg-paper-2">
              Back to Gullak
            </Link>
          </div>
        </DocSection>
      </article>
    </main>
  );
}

function DocSection({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28 border-b border-rule py-14 last:border-0">
      <p className="font-mono text-xs text-brand">{eyebrow}</p>
      <h2 className="mt-3 font-display text-3xl tracking-[-0.035em] sm:text-4xl">{title}</h2>
      <div className="mt-6 space-y-6 text-[17px] leading-8 text-ink-2 [&_code]:rounded [&_code]:bg-paper-3 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-sm [&_code]:text-ink">
        {children}
      </div>
    </section>
  );
}

function Flow() {
  return (
    <div className="grid gap-3 rounded-lg border border-rule bg-paper-2 p-4 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center sm:p-6">
      <FlowNode icon={Smartphone} label="Commit locally" />
      <ArrowRight className="hidden size-4 text-ink-2 sm:block" />
      <FlowNode icon={RefreshCw} label="Exchange events" />
      <ArrowRight className="hidden size-4 text-ink-2 sm:block" />
      <FlowNode icon={Server} label="Fold same union" />
    </div>
  );
}

function FlowNode({ icon: Icon, label }: { icon: typeof Smartphone; label: string }) {
  return <div className="flex items-center gap-3 rounded-md bg-paper p-4 text-sm font-semibold text-ink"><Icon className="size-4 text-brand" />{label}</div>;
}

function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return <aside className="border-l-2 border-brand bg-paper-2 px-5 py-4"><p className="font-semibold text-ink">{title}</p><p className="mt-2 text-sm leading-6">{children}</p></aside>;
}

function ConflictCell({ icon: Icon, label, value, meta }: { icon: typeof Smartphone; label: string; value: string; meta: string }) {
  return <div className="bg-paper-2 p-5"><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-ink-2"><Icon className="size-4" />{label}</div><p className="mt-8 font-semibold text-ink">{value}</p><p className="mt-1 font-mono text-xs text-brand">{meta}</p></div>;
}

function Guarantee({ title, children }: { title: string; children: React.ReactNode }) {
  return <li className="grid grid-cols-[1.5rem_1fr] gap-3"><Check className="mt-1 size-5 text-pos" /><p><strong className="text-ink">{title}.</strong> {children}</p></li>;
}

function Boundary({ icon: Icon, title, items }: { icon: typeof Smartphone; title: string; items: string[] }) {
  return <div className="rounded-lg border border-rule bg-paper-2 p-6"><Icon className="size-5 text-brand" /><h3 className="mt-5 font-bold text-ink">{title}</h3><ul className="mt-4 space-y-2 text-sm">{items.map((item) => <li key={item} className="flex gap-2"><span className="text-brand">—</span>{item}</li>)}</ul></div>;
}
