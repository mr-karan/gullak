# PRD: Gullak Quality Evals And Model Harness

**Date:** 2026-04-21

---

## Problem Statement

### What problem are we solving?
Gullak currently relies on manual user feedback to discover quality failures in the most important workflows: recording expenses, editing the right transaction, and replying in a way that feels natural enough for a WhatsApp expense tracker.

The failures reported on April 21, 2026 were not random model quirks. They exposed a structural gap:

- vague follow-ups like `This.` and `And this.` were not reliably tied to the correct transaction
- shorthand entries like `302 groceries` were treated as under-specified too often
- clarification replies were verbose, repetitive, and bot-like
- model or prompt changes had no regression harness, so the only real test was user frustration in production

This makes model switching risky, slows iteration on prompts and tool design, and hides whether an improvement in one case broke three others.

### Why now?
Two things changed on April 21, 2026:

1. Live user failures made it clear that conversational quality is core product behavior, not polish.
2. Production has now been switched to OpenRouter model `moonshotai/kimi-k2.6`, which raises the need for repeatable model comparison and regression detection before future swaps.

Without an eval harness, every prompt edit, context change, or model switch is effectively unversioned behavioral drift.

### Who is affected?
- **Primary users:** Karan, Saumya, and any small set of trusted WhatsApp users recording expenses conversationally
- **Secondary users:** Future maintainers changing prompts, tools, model ids, or state plumbing

---

## Proposed Solution

### Overview
Build a first-class quality harness for Gullak that can replay realistic conversation turns against controlled ledger and state snapshots, score both structural correctness and response quality, compare models side by side, and fail fast when a prompt, tool, or model change regresses key workflows.

The harness should evaluate the full decision loop, not just the final assistant text:

- inbound message normalization
- quoted-message and thread-context resolution
- tool selection
- tool arguments
- transaction targeting
- final user-facing reply

### User Experience
For a maintainer, the flow when complete should look like this:

1. Add or update an eval case from a real incident or a new product scenario.
2. Run a local eval command against one model or a matrix of models.
3. See a report with:
   - scenario-by-scenario pass/fail
   - expected vs actual tool calls
   - expected vs actual transaction ids
   - reply-quality scores and notes
   - cost and latency summaries
4. Before merging a change or switching models, run the same eval set in CI.
5. Reject the change if hard gates fail, or review the diff if only soft quality scores moved.

For product evolution, the flow should look like this:

1. Capture a frustrating live interaction.
2. Convert it into an anonymized regression case.
3. Fix the system.
4. Keep that case permanently in the corpus so the same failure does not return.

---

## End State

When complete:
- [ ] Gullak has a versioned eval corpus covering the main expense-tracker workflows and the real incidents seen so far
- [ ] A deterministic eval runner can replay each case against a temp ledger and temp state store
- [ ] Hard checks exist for tool choice, transaction targeting, and ledger mutation correctness
- [ ] Soft checks exist for clarification quality, reply brevity, and human tone
- [ ] The runner supports comparing multiple model ids against the same corpus
- [ ] CI can run a fast regression suite on every meaningful prompt/tool/state change
- [ ] A slower scheduled suite can track model performance, latency, and cost over time
- [ ] Production model changes are gated by eval results instead of intuition alone

---

## Acceptance Criteria

### Feature: Eval Corpus
- [ ] Each eval case contains:
  - input messages
  - optional quoted-message id and quoted text
  - initial thread state
  - initial ledger snapshot or fixture
  - expected tool actions
  - expected target transaction ids where applicable
  - expected ledger diff or no-write expectation
  - reply expectations
- [ ] The corpus includes real regressions from April 21, 2026:
  - shorthand expense entry: `302 groceries`
  - multiple shorthand entries in one thread
  - quoted follow-up: `This.`
  - quoted follow-up: `And this.`
  - ambiguous clarification branch involving Swiggy and Printo

### Feature: Deterministic Runner
- [ ] The runner executes against temp copies of `main.ledger` and `pi-state.json`
- [ ] The runner can inject recent transactions and reply-context state without needing WhatsApp live traffic
- [ ] The runner captures:
  - final assistant reply
  - tool call sequence
  - tool arguments
  - resulting ledger diff
  - resulting state diff
- [ ] The runner can assert no ledger mutation for read-only or clarification scenarios

### Feature: Scoring
- [ ] Hard-fail metrics exist for:
  - wrong transaction id
  - wrong tool family
  - unexpected write
  - missing write when one is required
  - malformed account/category values
- [ ] Soft scores exist for:
  - reply naturalness
  - unnecessary verbosity
  - redundant apology language
  - clarification directness
  - latency
  - token cost
- [ ] The report separates hard failures from softer quality degradation

### Feature: Model Matrix
- [ ] The runner accepts a model config file or CLI flags for:
  - base URL
  - api key env var name
  - model id
  - reasoning on/off
  - thinking level
- [ ] The same eval run can compare at least:
  - current prod model
  - previous baseline model
  - one candidate model
- [ ] Summary output shows per-model pass rate, mean latency, and estimated token cost

### Feature: CI And Regression Gates
- [ ] A fast suite runs in CI for prompt/tool/state changes
- [ ] A slower nightly or manual suite runs the broader corpus and model matrix
- [ ] CI fails on hard regression
- [ ] CI can upload an eval artifact with the detailed diff

---

## Technical Context

### Existing Patterns
- Pattern: [pi-server/src/agent/service.ts](/Users/karan/Code/gullak/pi-server/src/agent/service.ts) - central agent loop; the runner should observe behavior here rather than invent a parallel execution path
- Pattern: [pi-server/src/agent/tools.ts](/Users/karan/Code/gullak/pi-server/src/agent/tools.ts) - tool layer is the real mutation surface and should be the primary structural assertion target
- Pattern: [pi-server/src/state/store.ts](/Users/karan/Code/gullak/pi-server/src/state/store.ts) - thread memory, recent transaction ids, and reply contexts live here and must be fixtureable
- Pattern: [pi-server/src/whatsapp/service.ts](/Users/karan/Code/gullak/pi-server/src/whatsapp/service.ts) - production entrypoint for quoted messages and bridge metadata
- Pattern: [pi-server/src/agent/contextual-followup.ts](/Users/karan/Code/gullak/pi-server/src/agent/contextual-followup.ts) - key logic for follow-up targeting; several evals should isolate this risk
- Pattern: [pi-server/src/agent/message-normalizer.ts](/Users/karan/Code/gullak/pi-server/src/agent/message-normalizer.ts) - shorthand expense handling should be regression-tested directly and through end-to-end cases
- Pattern: [pi-server/src/agent/replies.ts](/Users/karan/Code/gullak/pi-server/src/agent/replies.ts) - reply formatting is where “human enough” output can be made consistent and testable
- Pattern: [pi-server/test/ledger.test.ts](/Users/karan/Code/gullak/pi-server/test/ledger.test.ts) - existing temp-file testing pattern can be reused for ledger fixtures

### Key Files
- [pi-server/src/config.ts](/Users/karan/Code/gullak/pi-server/src/config.ts) - model config surface; the eval runner should reuse this shape rather than inventing a second config schema
- [pi-server/src/runtime.ts](/Users/karan/Code/gullak/pi-server/src/runtime.ts) - useful seam for building a test runtime with temp paths and injectable model config
- [pi-server/test/contextual-followup.test.ts](/Users/karan/Code/gullak/pi-server/test/contextual-followup.test.ts) - current unit coverage for follow-up resolution; should remain the narrow fast layer
- [pi-server/test/whatsapp-media.test.ts](/Users/karan/Code/gullak/pi-server/test/whatsapp-media.test.ts) - current service-level test shape; useful template for WhatsApp-derived eval scenarios

---

## Proposed Product Shape

### 1. Eval Case Format
Use a small JSON or YAML schema for scenario fixtures. Each case should define:

- `id`
- `title`
- `tags`
- `initialLedgerFixture`
- `initialStateFixture`
- `request`
- `expected`
- `notes`

The `request` block should support:

- text
- thread id
- source
- timestamp
- quoted message id
- quoted text

The `expected` block should support:

- expected tool sequence
- expected transaction ids
- expected ledger write count
- expected reply contains / forbidden phrases
- max clarification turns
- max token or latency budget where relevant

### 2. Three Eval Layers
The harness should not be one giant slow test bucket. It should have three layers:

- **Layer A: Unit**
  - fast tests for follow-up resolution, normalization, reply formatting, account inference
- **Layer B: Agent Integration**
  - run `AgentService` against temp ledger/state and assert tool behavior plus reply
- **Layer C: Model Comparison**
  - replay the same integration corpus across multiple model configs and summarize results

### 3. Hard And Soft Metrics
Hard correctness matters more than vibes.

Hard metrics:

- tool chosen correctly
- correct transaction id targeted
- correct number of writes
- correct ledger category/payment account when the scenario expects it
- no unexpected creation/edit/delete

Soft metrics:

- reply is short
- reply is direct
- no repeated apology patterns
- no robotic ambiguity restatement
- clarification asks one concrete question instead of several

Soft metrics can start rule-based. A judge model can be added later, but not required for v1.

### 4. Corpus Sources
The corpus should come from three sources:

- **Real incidents:** anonymized WhatsApp transcripts and thread state snapshots
- **Product scenarios:** deliberately created cases for normal behavior
- **Adversarial cases:** shorthand, ambiguous merchant names, quoted corrections, multi-expense messages, payment-mode edits, trip-note edits

### 5. Model Registry
The harness should keep a small checked-in model registry with named presets, for example:

- `prod-current`
- `baseline-gemini`
- `candidate-kimi`
- `candidate-openai`

As of **April 21, 2026**, production has been explicitly configured to use OpenRouter with `moonshotai/kimi-k2.6`. The harness should treat that as the current prod target, not an implicit default.

### 6. CI Strategy
Two suites:

- **PR suite**
  - small, fast, deterministic
  - no more than a few critical scenarios
  - blocks merges on hard regressions
- **Nightly or manual comparison suite**
  - larger corpus
  - multiple models
  - tracks latency, cost, and quality drift over time

### 7. Artifact Format
Every eval run should produce:

- machine-readable JSON summary
- human-readable Markdown report
- per-case transcripts with:
  - input
  - normalized input
  - tools used
  - final reply
  - ledger diff
  - score breakdown

---

## Suggested Rollout Phases

### Phase 1: Harness Skeleton
- define eval schema
- build temp runtime and scenario runner
- capture tool calls, replies, ledger diffs

### Phase 2: Critical Regression Corpus
- codify the April 21, 2026 incidents
- add shorthand, quoted follow-up, and ambiguous edit cases
- add hard gates for wrong target id and wrong write behavior

### Phase 3: Reply Quality Scoring
- add rule-based tone and clarification checks
- enforce forbidden patterns like repeated apologies or repeated ambiguity summaries

### Phase 4: Model Matrix
- run corpus against current prod and candidate models
- record pass rate, latency, and estimated cost
- require model-change review against the report

### Phase 5: CI And Nightly Tracking
- wire the fast suite into PR checks
- wire the full matrix into scheduled runs
- preserve artifacts for regression history

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Overfitting to a tiny fixed corpus | High | High | Keep adding anonymized real incidents and adversarial cases |
| Model nondeterminism causes flaky evals | Medium | High | Prefer structural assertions, fixed seeds where possible, and multiple-run tolerance only for soft scores |
| Reply-quality scoring becomes subjective and noisy | Medium | Medium | Start with narrow rule-based checks before any judge-model scoring |
| Eval suite becomes too slow or costly | Medium | Medium | Split fast gating suite from broader scheduled suite |
| Sensitive user text leaks into fixtures | Medium | High | Add anonymization and fixture review before check-in |
| Harness diverges from real runtime | Medium | High | Reuse `AgentService`, `StateStore`, and real tools instead of mocking core behavior |
| Model swap regressions still leak into prod | Medium | High | Require eval comparison before model changes and keep a fast rollback path via env-based config |

---

## Non-Goals (v1)

- Full UI or dashboard for eval results
- Fine-tuning or training a custom model
- Automatic production shadow execution on every live message
- Perfect human indistinguishability in replies
- Replacing ledger-cli or the current tool architecture

---

## Open Questions

| Question | Owner | Status |
|----------|-------|--------|
| Should anonymized real-user transcripts be checked into the repo or stored outside it with generated fixtures committed instead? | Karan | Open |
| Should soft reply-quality scoring remain rule-based in v1 or include a separate judge model from day one? | Karan | Open |
| Should nightly evals hit live model APIs directly, or cache recorded outputs for some baseline runs? | Karan | Open |
| What is the acceptable cost budget per nightly matrix run? | Karan | Open |
| Do we want one corpus for both HTTP and WhatsApp entrypoints, or separate transport-aware suites with shared scenario fixtures? | Karan | Open |

