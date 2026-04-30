# 09 — SMS ingestion (Android)

## Scope

- **Android only.** iOS does not allow third-party apps to read SMS.
- **Optional.** The user grants permission explicitly. The app works fine
  without it.
- **Read-only.** We never send SMS, never delete them, never modify the
  inbox.
- **Transactional only.** OTPs, marketing, "you've been selected!" — all
  dropped silently. We do NOT show non-transactional SMS in the inbox.

## Permissions

- `android.permission.RECEIVE_SMS` — for live ingestion of new messages.
- `android.permission.READ_SMS` — for the initial backfill of the last 90
  days from the inbox.
- `android.permission.POST_NOTIFICATIONS` — Android 13+, to surface a
  notification when a high-confidence transactional SMS arrives.

We request these on first open of the Inbox tab, with a one-screen
explanation: "Gullak reads only transactional SMS from banks. Everything
else is ignored. Reads happen on-device. We don't send SMS anywhere."

If the user denies, the Inbox tab shows a "permission needed" empty state
with a "Grant" button.

## Pipeline

```
[ Android SMS inbox ]
      │
      ▼
[ Backfill on permission grant: last 90 days ]    ← READ_SMS
[ Live listener: onSmsReceived ]                  ← RECEIVE_SMS
      │
      ▼
[ Classifier ]  is this transactional?
      │
   yes│              no → store as non_transactional, drop.
      ▼
[ Bank-specific regex parser ]  match a sender pattern?
      │
   yes│              no → fall through
      ▼
[ Extract amount, payee, account hint, date ]
      │
                   no? → if AI configured, run LLM extractor
                          else store as `error`, drop.
      ▼
[ TransactionCandidate ]
      │
      ▼
[ Dedupe vs existing transactions ]  see [10-deduplication.md]
      │
      ▼
[ Inbox queue ]  → notification (if confidence > 0.75)
      │
      ▼
[ User taps Confirm or Dismiss ]
```

## Classifier (is it transactional?)

A two-tier filter, all on-device, no LLM needed.

**Tier 1: sender-based allowlist.** Indian bank SMS senders follow patterns
like `VK-HDFCBK`, `AD-ICICIB`, `JD-AXISBK`, `BX-SBIINB`. We ship a list of
~30 known senders covering HDFC, ICICI, Axis, SBI, Kotak, Yes, IndusInd,
RBL, Citi, Amex, Bajaj Finserv, BoB, PNB, Canara. Senders not in the list
fall through to tier 2.

**Tier 2: keyword filter.** A word-boundary regex over the body:
`/\b(debited|credited|spent|paid|withdrawn|received|transferred|purchase|charged|refund|debit|credit)\b/i`
combined with a currency token (`Rs|INR|₹|USD|\$`) and a numeric value.

Anything that fails both tiers is `non_transactional` and never resurfaces.

OTPs are special-cased: if the body contains `OTP|one[\s-]time|verification code`,
we drop without further inspection.

Marketing detector: presence of `loan offer|emi offer|win|congratulations|claim`
in tier 2 = drop.

## Bank-specific parsers

Each bank gets a small file in `lib/data/sms/parsers/<bank>.dart`. A parser
is:

```dart
class HdfcCardParser implements SmsParser {
  bool matches(String sender, String body);
  TransactionCandidate? parse(SmsMessage m);
}
```

The matcher is sender prefix + body shape. Examples we will ship parsers
for:

- HDFC debit card POS: `Spent Rs.<amt> On HDFC Bank Card xx<last4> At <merchant> on <date>.`
- HDFC credit card: `Thank you for using HDFC Bank Credit Card xx<last4> for Rs.<amt> at <merchant> on <date>.`
- HDFC UPI debit: `Sent Rs.<amt> from HDFC Bank A/c xx<last4> to <vpa> on <date>. Ref:...`
- ICICI debit: `Acct XX<last4> debited with INR <amt> on <date>; <merchant> credited.`
- ICICI credit card: `Transaction alert: INR <amt> spent on ICICI Bank Card XX<last4> on <date> at <merchant>.`
- Axis: `Spent Card no. XX<last4> INR <amt> <date> at <merchant>.`
- SBI debit: `Your A/c XX<last4> debited by Rs.<amt> on <date> @<merchant>.`
- Kotak: similar.

A `TransactionCandidate` is filled with:
- `amountCents` (always positive in the parser; we set sign=spend for the
  patterns above).
- `accountHint` ("HDFC ****1234").
- `payeeName` extracted from the merchant token.
- `date` parsed from the SMS date token; if absent, the SMS receive date.
- `confidence`: 0.95 for an exact sender+pattern hit, 0.8 if the sender
  matched but body matched a relaxed pattern, 0.6 for tier-2-only matches.

We track `parser_version` per row so when we ship better parsers later we
can re-process old rows.

## LLM fallback

When no regex parser matches but tier-1/tier-2 said transactional, AND the
user has AI configured, we send the SMS body to the LLM with a special
prompt that returns the same `TransactionCandidate` shape (see
[08-ai-extraction.md](08-ai-extraction.md), with an "SMS body" header
instead of "user note"). Confidence cap: 0.7.

If AI is not configured, the SMS is stored as `error` and dropped. No
silent guesswork.

## Inbox notification

When a candidate lands with confidence ≥ 0.75 and the app is backgrounded,
post a local notification: "₹450 at Blinkit — review?" Tapping opens the
Inbox tab. We rate-limit to one notification per 60 seconds, batched.

## Backfill rules

- On permission grant: read the last 90 days, classify, parse, dedupe
  against any transactions already in our local DB by `imported_id` /
  `(amount, date ±1d, account)`. Land non-duplicates in the inbox.
- During backfill, we do NOT post notifications.
- Backfill runs in an isolate (it's CPU-bound regex over potentially
  thousands of messages).

## What we never do

- Read non-SMS notifications. We do not request notification access.
- Read MMS, RCS, or anything that isn't SMS.
- Forward SMS content off-device unless AI is configured AND the user
  enabled "use AI for unparsed SMS" (off by default).
- Auto-confirm anything. The user always taps Confirm.
