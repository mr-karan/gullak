# 08 — AI extraction

## Goal

Free-text → structured `TransactionCandidate`. Specifically:
`"450 blinkit hdfc"` → `{ amount: -45000, payee: "Blinkit", account: "HDFC",
category: "Groceries", date: today }`.

## Where it runs

- **Quick Entry "Type" tab**, after a 350 ms debounce.
- **SMS classifier fallback**, when no regex bank parser matches. See
  [09-sms-ingestion.md](09-sms-ingestion.md).

## Endpoint contract

We talk to an OpenAI-compatible chat completion endpoint. The user
configures:
- Base URL (e.g. `https://api.openai.com/v1`, or any compatible — Groq,
  Together, OpenRouter, a local Ollama at `http://localhost:11434/v1`).
- API key (or empty for unauthenticated local endpoints).
- Model name (free text — the user knows what they have access to).

We hit `POST <base>/chat/completions` with messages and `response_format =
{ type: "json_object" }`.

If `response_format` is unsupported by the provider (some local endpoints),
we fall back to plain text + JSON parse with a tolerant extractor (find the
first `{...}` block).

## Prompt

System prompt (literal, stored in code):

```
You are an expense parser. Convert the user's note into a structured
expense draft as JSON. Output ONLY a single JSON object, nothing else.

Schema:
{
  "amount_minor": integer,        // positive number; do not negate
  "is_income": boolean,           // true only if the note clearly says income
  "payee": string|null,
  "account_hint": string|null,    // e.g. "HDFC", "ICICI ****1234"
  "category_hint": string|null,   // best guess from the user's wording
  "notes": string|null,           // anything left over that doesn't fit a field
  "date": string|null,            // ISO YYYY-MM-DD if explicit, else null
  "confidence": number            // 0..1 self-assessed
}

Rules:
- amount_minor uses the budget's minor units. If the user types "450" assume
  rupees with 2 minor digits → 45000. If they type "12.30" with a decimal,
  read 1230. If unsure, return amount_minor with the user's literal digits
  scaled by 100.
- Do NOT invent payees or accounts. If the user did not say one, return null.
- Do NOT pick a category if you are guessing from a single ambiguous word.
- For "yesterday" / "monday" / "last friday" — resolve relative to <today>.
- Output JSON only. No prose, no markdown.
```

User-facing context appended:
```
<today>: 2026-04-30
<known_accounts>: ["HDFC", "ICICI Credit Card", "Cash"]
<known_categories>: ["Groceries", "Eating Out", "Transport", ...]
<known_payees>: ["Blinkit", "Zomato", "Swiggy", ...]
```

We pass at most 50 of each (most recent / most used) so prompt size stays
small.

## Mapping the response back

After receiving JSON:

1. **Amount sign.** `amount_minor` is positive. We negate unless `is_income`.
2. **Account match.** Fuzzy-match `account_hint` against known accounts:
   exact, then case-insensitive, then prefix, then Levenshtein ≤ 3. If no
   match, leave `accountId` null and surface "Account?" in the UI.
3. **Payee match.** Same fuzzy ladder against known payees. If no match,
   we keep `payee_name` as-is — Actual auto-creates payees on `payee_name`.
4. **Category match.** Same. If still no hit, leave null.
5. **Date.** If null, default to today. If parsed but in the future,
   clamp to today.
6. **Confidence.** Below 0.4 → orange chip, Save disabled until user
   confirms.

## Cost / latency budget

- One call per debounced edit. Expected latency: 300–800 ms on a fast LLM,
  up to 3 s on a slow local model.
- Show a typing indicator while the call is in flight. Cancel on text
  change; do not stack.
- Each call is ≤ 2 KB request, ≤ 1 KB response, JSON-mode.

## Failure modes

| Mode | Handling |
|---|---|
| Network timeout | Banner "AI is slow", let user save manually. |
| Non-JSON response | Try lenient extract; if still bad, surface as failure. |
| 401/403 | Banner "AI key rejected — check settings". |
| Rate-limited (429) | Backoff for 30 s, banner. |
| AI off | The Type tab shows "AI is off — switch to Form". |

## Privacy

- The prompt contains the user's free text, plus account/payee/category
  *names*. No amounts from prior transactions, no payee data outside the
  hint list.
- We store the request + response in `audit_log` only at debug-log level,
  off by default.
- The user can disable AI any time. The Form tab is fully usable.

## Local fallback for SMS

For the SMS path specifically (where we want zero-network), the user can
configure a local Ollama endpoint. The system prompt is identical. If no
LLM is configured, SMS that don't match a regex parser are dropped, not
queued. This is intentional — we'd rather miss than guess.
