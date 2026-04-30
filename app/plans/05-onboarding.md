# 05 — Onboarding

A four-screen wizard. Total time: under 90 seconds for a user who has the
URL and API key in their clipboard.

## Screen 1: Welcome

- Title: "Gullak"
- Subtitle: "An expense tracker for your self-hosted Actual Budget."
- Two paragraphs explaining you need: (1) an Actual server, (2) an
  `actual-http-api` instance pointed at it. Link to docs.
- Primary CTA: "I have those, continue".
- Secondary: "How do I set those up?" — opens an in-app guide page with the
  `docker-compose.yml` snippet (see [03](03-actual-budget-integration.md)).

## Screen 2: Connect

Form fields:
1. **Server URL** — text, validated as URL. Examples: `https://actual.mydomain.com`, `http://192.168.1.5:5007`.
2. **API key** — masked text, paste-friendly.
3. (Optional) **TLS** — auto-detected from URL scheme.

CTA: "Test connection". Hits `GET /v1/budgets`. On success, advances. On
failure, shows specific error:
- DNS / unreachable → "Can't reach the server. Check the URL and that
  `actual-http-api` is running."
- 401 → "API key rejected."
- TLS error → "Certificate problem. Disable TLS verification only if you
  trust this network." (toggle that sets `dio` `validateCertificate: false`,
  off by default; we save the choice).

We DO NOT save the URL/key until the test passes.

## Screen 3: Pick a budget

`GET /v1/budgets` → list with name + syncId. User taps one. We save
`selected_budget_sync_id` to secure storage.

If only one budget exists, we auto-pick and skip this screen.

## Screen 4: Currency + initial sync

- Display detected currency hint (we currently default to 2 minor digits).
  Toggle for 4 digits.
- Tap "Sync now" → fetch accounts, category groups, categories, payees,
  last 90 days of transactions across all accounts. Show progress.
- Choose a default account (the one most expenses log to). Default to the
  first non-offbudget account.

CTA: "Done". Lands on home.

## Errors and resilience

- Connection drops mid-sync → resume from where we left off; the wizard's
  "Sync now" is idempotent because we use `actual_id` as the upsert key.
- User backs out of onboarding → app exits the wizard but keeps no state
  beyond what it has tested. Next launch returns to onboarding.

## Re-onboarding (settings)

- "Re-test connection" runs the screen-2 flow again with the saved
  credentials and updates them if changed.
- "Switch budget" returns to screen 3.
- "Wipe local data" prompts twice (`Are you sure?` → typed confirmation),
  then drops the DB and bounces to screen 1. We never wipe Actual.

## What we DO NOT ask in onboarding

- AI endpoint. Lives in settings; default is "off". The app works without
  it.
- SMS permission. Asked the first time the user opens the inbox tab.
- Theme. Defaults to system; lives in settings.
