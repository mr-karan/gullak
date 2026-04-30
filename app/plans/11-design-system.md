# 11 — Design system

The polish target is YNAB. That means: type, colour, motion, density,
empty states, and *no half-finished screens*.

## Principles

1. **Money is the hero.** Numbers get the largest, most legible type. Body
   text gets out of the way.
2. **One primary action per screen.** Save. Confirm. Add. The FAB is
   sacred.
3. **Honest motion.** Sheets slide up, lists react to gestures, success
   has a subtle haptic. We do not over-animate.
4. **Density without crowding.** Lists are tight (52 dp rows) but never
   cramped (16 dp gutters, generous line-height on body).
5. **System-aware.** Dark and light. Dynamic type respected. Material 3
   on Android, custom tweaks on iOS so it doesn't feel alien.

## Typography

We use **Inter** for body and **JetBrains Mono** for amounts (or any
mono-spaced number font; numbers in mono align vertically in a list).

Scale (Material 3 names, with our pt sizes):
- `displayLarge` 48 / 56 — never used in v1.
- `displayMedium` 36 / 44 — onboarding hero.
- `headlineLarge` 28 / 36 — month total.
- `headlineMedium` 22 / 28 — section headers.
- `titleLarge` 18 / 24 — list row primary text.
- `bodyLarge` 16 / 24 — descriptions.
- `bodyMedium` 14 / 20 — secondary text in rows.
- `labelLarge` 14 / 20 — buttons.
- `labelSmall` 11 / 16 — chips, captions.

Numbers (custom):
- Big: 36 / 40 mono, tabular figures.
- List: 16 mono, tabular figures.

## Colour

We use Material 3 dynamic colour with a fixed seed `#0A6E58` (a calm green
that works as both an action colour and a positive indicator).

Token guidelines:
- `primary` — action surfaces (FAB, primary buttons).
- `error` — used sparingly. Spend amounts in lists are NOT error red;
  that's too loud. They are `onSurfaceVariant` with a subtle tint.
- `tertiary` — for AI-suggested chips and SMS inbox accents.

Custom semantic tokens:
- `spendNeutral` — `onSurfaceVariant` with -10% lightness in light mode.
- `incomeAccent` — primary, used only on income rows / + sign toggle.
- `pendingDot` — `tertiary`, 8 dp dot for pending-sync rows.
- `failedDot` — `error`, 8 dp dot for failed-sync rows.

Backgrounds:
- Surface levels follow Material 3 elevation tonal model.
- The Quick Entry sheet sits on `surfaceContainerHigh`.
- The home top section uses `surfaceContainer` with no shadow.

## Spacing

`4 / 8 / 12 / 16 / 20 / 24 / 32 / 48` dp. Never in-between values.

Page gutter: 16 dp. List row vertical padding: 12 dp. Section gap: 24 dp.

## Components

A small kit, all in `ui/widgets/`:

- `MoneyText(amount: int, sign: bool, size: MoneySize)` — handles
  formatting, sign, mono.
- `AmountChip` — pill with currency symbol + amount, used in totals.
- `TransactionRow` — payee · category · date · amount.
- `EmptyStateCard(icon, title, body, action?)` — every list uses this.
- `SectionHeader(text)` — minimal, all-caps `labelSmall` with letter
  spacing.
- `PrimaryButton`, `SecondaryButton`, `IconButton`.
- `SyncDot(status)` — synced (none), pending (tertiary), failed (error).

## Motion

- Sheet open: 220 ms, easeOut.
- Sheet close: 180 ms, easeIn.
- List item insert: 200 ms slide + fade.
- List item delete: 180 ms slide-out left + fade.
- Save snackbar: rises 240 ms, dwells 4 s, falls 160 ms. Has Undo.
- Loading spinner: only after 600 ms of in-flight work; otherwise nothing.
- Haptic: "lightImpact" on Save. "mediumImpact" on Confirm-from-Inbox.

## Empty states

Every list MUST have one. Required props: icon, title, body, optional CTA.
Examples:

- Transactions list, no data: 💸 + "Nothing logged yet" + "Tap + to add
  your first expense."
- Inbox, permission off: 📬 + "Inbox is empty" + "Grant SMS permission to
  let Gullak read transactional messages." + [Grant].
- Inbox, permission on, nothing pending: 📬 + "All caught up" + "We'll
  drop new bank SMS here for review."

## Error states

- Inline form errors: under the field, in `error`, 12 / 16 type.
- Network sync error: top banner on Home, dismissable, with "Retry".
- Push failure on a row: red dot + "Retry" in the row's overflow menu.

## Accessibility

- All interactive elements have semantic labels.
- Touch targets: minimum 48 dp.
- Contrast: AA on body, AAA on amounts where possible.
- Dynamic type: scales without overflow.
- VoiceOver / TalkBack: row reads "Blinkit, groceries, four hundred fifty
  rupees, today."

## Things that destroy polish (avoid)

- Mid-screen spinners on common actions. Use skeletons or optimistic UI.
- Different fonts in the same screen.
- Snackbars without Undo for destructive actions.
- "Coming soon" buttons.
- Stock Material icons mixed with custom ones at the same hierarchy
  level.
- Toasts that interrupt typing.
- Modal nested in modal.
