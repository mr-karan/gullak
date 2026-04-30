# Gullak Mobile — Plans

Read these in order. They are specs, not narration.

| # | File | Purpose |
|---|------|---------|
| 00 | [vision.md](00-vision.md) | What we are building and why |
| 01 | [tech-stack.md](01-tech-stack.md) | Frameworks, packages, version pins |
| 02 | [architecture.md](02-architecture.md) | Module layout, layering, threading |
| 03 | [local-first-storage.md](03-local-first-storage.md) | Where data lives, backup/restore |
| 04 | [data-model.md](04-data-model.md) | Local DB schema and sync states |
| 05 | [onboarding.md](05-onboarding.md) | First-run wizard |
| 06 | [ux-flows.md](06-ux-flows.md) | Screen inventory and navigation |
| 07 | [quick-entry.md](07-quick-entry.md) | The expense-entry surface — the whole point |
| 08 | [ai-extraction.md](08-ai-extraction.md) | Free-text → transaction |
| 09 | [sms-ingestion.md](09-sms-ingestion.md) | Android SMS reader, parsers, inbox |
| 10 | [deduplication.md](10-deduplication.md) | Reconciliation across SMS / manual / AI |
| 11 | [design-system.md](11-design-system.md) | Tokens, motion, polish bar |
| 12 | [build-roadmap.md](12-build-roadmap.md) | Phased delivery and cut lines |
| 13 | [risks-and-open-questions.md](13-risks-and-open-questions.md) | Known unknowns |

The single biggest decision (since the v0 plan): drop the Actual Budget
integration entirely. The Dart-side trade-offs (CRDT protocol, Docker
shim, dual-language tooling) outweighed the benefit for a single-device
app. We now own the data: SQLite on the phone, JSON export the user
controls. Everything else falls out of that.
