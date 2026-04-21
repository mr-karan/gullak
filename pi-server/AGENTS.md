# pi-server — Agent Guide

This directory contains the actual Gullak runtime: HTTP API, agent loop, ledger mutations, WhatsApp handling, and eval harness.

If you are changing behavior here, optimize for two things:

1. ledger correctness
2. conversational quality without losing structural correctness

## Layout

```
pi-server/
├── src/
│   ├── agent/          # prompts, tools, model wiring, follow-up resolution, reply formatting
│   ├── cli/            # operational entrypoints (`weekly-recap`, `evals`)
│   ├── evals/          # eval runner and types
│   ├── ledger/         # parse, write, validate, summarise
│   ├── recap/          # weekly recap generation
│   ├── state/          # JSON sidecar state
│   └── whatsapp/       # transport-facing webhook logic
├── evals/              # checked-in eval suites + ledger/state fixtures
└── test/               # unit and integration tests
```

## High-value files

| Task | File |
|------|------|
| Main runtime wiring | `src/runtime.ts` |
| HTTP surface | `src/app.ts` |
| Agent orchestration | `src/agent/service.ts` |
| Prompt policy | `src/agent/prompts.ts` |
| Tool behavior | `src/agent/tools.ts` |
| Follow-up / quoted reply resolution | `src/agent/contextual-followup.ts` |
| User-message normalization | `src/agent/message-normalizer.ts` |
| Final reply formatting | `src/agent/replies.ts` |
| Ledger read/write | `src/ledger/service.ts`, `src/ledger/writer.ts` |
| Thread / reply-anchor state | `src/state/store.ts` |
| WhatsApp webhook flow | `src/whatsapp/service.ts` |
| Eval runner | `src/evals/runner.ts` |
| Eval CLI | `src/cli/evals.ts` |

## Product rules

- `main.ledger` is the source of truth.
- `pi-state.json` is sidecar state only. It can cache memory and reply anchors, but it must not become the source of financial truth.
- Prefer deterministic pre-model logic for message normalization and follow-up targeting when possible.
- If the user is vague, the system should ask one direct question, not loop through repetitive clarification text.
- A wrong transaction edit is worse than a short clarification.
- For ambiguous follow-ups, bias toward no write unless targeting is genuinely clear.

## Evals

The eval harness is not a toy test path. Keep it close to production behavior.

- Prefer running the real `AgentService` against temp ledger and temp state files.
- Do not replace the core agent loop with mocks unless the test is explicitly a narrow unit test.
- Add real regressions as checked-in eval cases under `evals/`.
- Keep fixtures small and scenario-specific. Do not dump a giant production ledger into a fixture.
- Separate:
  - **hard checks**: action, transaction id, ledger mutation, reply anchor behavior
  - **soft checks**: tone, verbosity, apology patterns
- When a production incident happens, add an anonymized eval case before or alongside the fix.

### Eval corpus conventions

- Suites live in `evals/*.json`
- Ledger fixtures live in `evals/fixtures/*.ledger`
- Use explicit thread ids and state snapshots for quoted-reply scenarios
- Name cases after the user-visible failure mode, not the implementation detail
- Prefer one scenario per case

## Testing expectations

Before wrapping up changes here, run:

```bash
cd pi-server
pnpm test
pnpm build
```

For eval work, also run at least one suite:

```bash
cd pi-server
pnpm evals evals/critical-regressions.json
```

If a suite is expected to fail because it captures a known open regression, say so explicitly.

## Editing guidance

- Keep reply-copy tweaks tightly scoped; avoid broad prompt churn unless the eval corpus supports it.
- When modifying `tools.ts`, check whether the change should be captured in an eval as well as a unit test.
- When modifying `contextual-followup.ts` or `state/store.ts`, assume there is risk of silent regression and add targeted coverage.
- Preserve existing file and module boundaries unless there is a clear payoff.

