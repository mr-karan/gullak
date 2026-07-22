# Gullak Sync Protocol v2: causal field CRDT

## Safety contract

The replicated authority is the immutable set of accepted changes. Account,
category, payee, transaction, tag, budget, and recurrence tables are
materialized projections and may be rebuilt from CRDT state. Rules and rule
matches are server-owned configuration and are deliberately outside this
replication epoch; legacy rule snapshots can therefore never poison a phone's
financial pull stream.

For any two replicas containing the same changes, both the complete CRDT state
and visible relational projection must be identical, independent of delivery
order, batching, duplication, retries, or wall clocks.

No full row snapshot is a mutation. A mutation names only the fields or
semantic relations that the user action changed. Unknown fields are retained
as opaque CRDT facts and are never interpreted as deletion.

## Change envelope

One user action produces one atomic change. Compound actions (transfers,
splits, grouping, category reassignment) put every affected entity operation in
the same change.

```json
{
  "protocol": 2,
  "epoch": "uuid",
  "changeId": "actor-uuid:42",
  "actorId": "actor-uuid",
  "sequence": 42,
  "context": { "actor-uuid": 41, "other-actor": 8 },
  "lamport": 97,
  "wallTimeMs": 1780000000000,
  "schemaVersion": 1,
  "ops": [
    {
      "kind": "assign",
      "resource": "transactions",
      "entityId": "uuid",
      "field": "notes",
      "value": "probe"
    }
  ]
}
```

- `actorId` is a durable random UUID. Registration returns a one-time random
  actor credential; every push, pull, bootstrap, and acknowledgement is bound
  to both values. Clearing app data creates a new actor. Entering a new epoch
  also rotates the actor after all prior events are acknowledged, preventing a
  retained `(actorId, sequence)` dot from ever being reused.
- `sequence` is allocated monotonically and durably in the same SQLite
  transaction that stores the change and updates the local projection.
- `(actorId, sequence)` is the dot and globally identifies the change.
- `context` is the replica's contiguous version vector before the mutation.
  An event `a` happens before `b` iff `b.context[a.actorId] >= a.sequence`.
- `lamport` is one greater than the largest Lamport value observed locally.
  It is used only to choose a visible value among concurrent candidates.
- `wallTimeMs` is audit metadata only and never participates in correctness.
- `sync_changes.transport_cursor` is paging order only. It is never conflict order.

The server rejects duplicate dots with different bytes, reused actor sequence
numbers, unsupported epochs, invalid money types, or a gap in an actor's
contiguous sequence. Exact duplicate changes are idempotent success.

## Register merge

Every `(resource, entityId, field)` is a causal multi-value register. A
candidate stores the assigning change's dot, causal context, Lamport value,
actor, and JSON value.

To merge a candidate into a register:

1. If any existing candidate's context contains the incoming dot, discard the
   incoming candidate because it is causally obsolete.
2. Remove every existing candidate whose dot is contained by the incoming
   context.
3. Retain all remaining candidates and the incoming candidate. They are
   concurrent.

Set union followed by removal of causally dominated candidates is associative,
commutative, and idempotent. Merge never discards a concurrent value.

The visible relational value is the candidate with the greatest tuple
`(lamport, actorId, sequence)`. This deterministic choice is a read projection,
not destructive LWW: all concurrent candidates remain queryable as conflicts.
A later explicit edit observes and causally supersedes every candidate, thereby
resolving the conflict.

Clock skew cannot permanently shadow an edit. Wall time is ignored, and a
causal successor wins even when its physical clock is years behind.

## Row lifecycle and relations

Row existence is the reserved `$exists` register. Ordinary edits never
implicitly resurrect a row.

- Financial/domain rows use remove-wins projection: if causally maximal
  lifecycle candidates concurrently contain both `true` and `false`, the row
  is hidden. Restore emits `true` after observing the delete and therefore
  causally supersedes it. Field facts remain under the tombstone for recovery.
- Membership rows such as `(transactionId, tagId)` use add-wins projection:
  a concurrent unseen add survives a remove. A remove after observing the add
  causally supersedes it.
- Derived values such as payee use count and split/group totals are recomputed
  from visible source facts. They are not independent registers.
- `payees.name` is canonical whenever a transaction or recurrence has a
  `payeeId`; its embedded `payeeName` is only a derived projection cache. An
  unrelated transaction edit can therefore never rename a payee. Unlinking a
  payee is an explicit operation that also supplies the detached label.
- Transaction-tag membership uses the stable logical identity
  `tt:${canonicalJson([transactionId, tagId])}`. Physical random row IDs never
  affect convergence.
- A genuinely additive value must use a deduplicated PN-counter operation,
  never repeated scalar assignment.

## Persistence and materialization

Both Drift and better-sqlite3 keep the same logical metadata:

- `sync_changes`: immutable accepted envelopes, unique by `changeId` and
  `(actorId, sequence)`; server also has an auto-increment transport cursor.
- `sync_registers`: one row per entity field containing the causally maximal
  candidate antichain as canonical JSON and the projection policy.
- `sync_frontiers`: contiguous sequence integrated per actor plus the local
  Lamport clock.
- `sync_quarantine`: invalid changes with reason, source, and original bytes.
- `sync_checkpoints`: epoch, schema, causal frontier, complete register state,
  projection hash, and creation cursor.

Applying a local or remote change, advancing its frontier, updating every
register, materializing every affected domain row, and enqueueing/acknowledging
the change are one database transaction. A crash exposes all or none.

Server and web mutations use a persistent server actor and the same engine.
Direct mutation of synced tables outside that engine is forbidden.
`recordCommand` groups one domain command into one immutable envelope;
`recordChange` records only that command's semantic field intent.

Cross-row CRDT convergence does not by itself preserve arbitrary financial
invariants. A whole change is validated atomically. Reconciled-row locks and
other non-I-confluent invariants may require server rejection/coordination;
rejection is explicit and leaves the local event pending/conflicted.

## Transport

Push and pull exchange immutable changes, not projections. The receiver merges
changes in any order. Push acknowledgements name accepted, duplicate,
quarantined, and rejected change IDs. A client retires an outbox entry only
after its exact ID is accepted or identified as an exact duplicate.

Pull pagination advances only after the entire page transaction commits.
Malformed events are quarantined individually and reported; they cannot wedge
or silently skip unrelated events. Originated events may be echoed safely and
are useful to verify canonical acceptance.

## Schema evolution

Wire field identifiers never change meaning. Adding a field creates a new
identifier. Rename or type change creates a new identifier and a deterministic,
idempotent migration change from a reserved migration actor. Old clients store
unknown operations opaquely even when they cannot materialize them. Missing
fields are never nulls or deletes.

Validators dispatch by entity schema version. Rules are server-owned
configuration and never enter the financial event journal.

## Bootstrap, compaction, and actor retirement

The first run creates one sync epoch and a genesis checkpoint from the audited
current server projection. A checkpoint contains the full register
candidate state, lifecycle tombstones, relation state, actor frontier, schema,
and projection hash. A visible-row-only backup is not sufficient.

Clients below retained history, or whose cursor is ahead of the server, receive
`reset_required` and install a content-hash-verified checkpoint atomically. An
unresolved local event prevents replacement rather than being discarded.
Accepted events authored by the recovering actor may be replayed by the
authenticated server; this restores its exact frontier and advances its next
sequence instead of misclassifying the replay as spoofing.
Gullak currently performs **no event pruning or compaction**. Event bodies
must not be compacted until durable per-dot causal/Lamport summaries exist,
checkpoint equivalence is tested, and every active actor has acknowledged the
frontier or has been explicitly retired. A retired actor must bootstrap under
a new actor ID before writing again.

The wire accepts only schema version 1 today. JSON integer values must stay in
the cross-runtime safe range `[-(2^53-1), 2^53-1]`; coordinates are quantized
to exactly seven decimal places in `[-180, 180]`. Wall time never resolves a
conflict.

### Operator CLI

Run the operator tool from `pi-server/`. `status` and `audit` are read-only and
report the active epoch invariant, checkpoints, clients and exact
acknowledgements, frontiers, conflicts,
quarantine, and independently recomputed relational/checkpoint/fold hashes.

```bash
npm run sync:v2 -- status
npm run sync:v2 -- audit
```

Actor retirement requires a separate SQLite-native snapshot and its exact
SHA-256. The tool opens it read-only, runs SQLite integrity checks, and requires
its projection, event head, epochs, frontiers, checkpoints, and client state to
match the live DB exactly. Arbitrary bytes, stale copies, and main-file-only WAL
copies fail. The tool never changes the snapshot.

```bash
npm run sync:v2 -- retire --dry-run --actor <actor-id> \
  --confirm RETIRE:<actor-id> \
  --backup /safe/gullak.db.backup --backup-sha256 <64-hex>
```

The server requires exactly one active epoch. An abandoned actor can be retired
only by naming it, supplying a current backup proof, and typing its exact
confirmation. Retirement is never inferred from age, and events are never
pruned.

## Required proof suite

- Random event DAG permutations, duplicates, batching, partitions, delayed
  dependencies, and reconnects converge to byte-identical register state and
  projection in Dart and TypeScript.
- Merge is associative, commutative, and idempotent.
- Incremental materialization equals a from-scratch fold of the event union.
- Independent stale edits both survive; concurrent same-field values both
  remain while every replica chooses the same visible winner.
- Later causal edits win regardless of wall-clock fuzz by years.
- Remove-wins lifecycle, causal restore, and add-wins membership match the
  specified truth tables.
- Event, actor sequence, register state, domain projection, and outbox are
  atomic under crash injection at every statement boundary.
- Checkpoint plus tail equals full-history fold. Bootstrap plus pending local
  events equals the unpruned event union.
- Unknown future fields survive old-client round trips. Migration changes are
  idempotent. Malformed changes quarantine without cursor wedge.
- Every phone, server, agent, and web mutation path emits exactly one atomic
  change; no direct synced-table write escapes the engine.
