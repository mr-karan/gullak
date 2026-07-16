import { z } from "zod";

import type { AppConfig } from "../config.ts";
import { chatJson, LlmOutputError } from "../llm/client.ts";

/// SMS → structured expense parser.
///
/// LLM-only. The previous deterministic regex path was deleted after it
/// silently corrupted payee names whenever an issuer used a date/footer
/// format the regex didn't anticipate (HDFC card SMS in particular). The
/// failure mode there was unrecoverable garbage in the financial dataset.
///
/// Trade-off: every parse is now an LLM call. At ~100 transactional SMS/
/// month the cost and latency are immaterial. The Inbox preview still
/// runs this per-row at SMS arrival, and Confirm All uses the cached
/// candidate written at that time — so the model is not on the user-
/// facing confirm path.
///
/// Validation: we still don't trust the model blindly. The output runs
/// through `validateCandidate()` which rejects obvious leakage (bank
/// disclaimer footers, time suffixes, leading underscores from card SMS
/// formats). On rejection we retry the call once with a corrective hint
/// before giving up.

const SYSTEM = `You parse a single Indian bank/card/UPI SMS into structured expense data.
Output ONLY a single JSON object — no prose, no markdown fence.

The SMS may come from a bank, card issuer, payment processor (Stripe/Razorpay),
or a merchant SMS gateway. The body often contains a bank disclaimer footer
("Not You? To Block...", "Call 1800...", "SMS BLOCK CC XXXX to ..."). NEVER
include footer text in the payee.

Schema:
{
  "is_transaction": boolean,
  "amount_cents": integer,
  "is_income": boolean,
  "currency": "INR" | "USD" | "EUR" | "GBP" | "JPY" | other ISO code,
  "payee": string|null,
  "account_hint": string|null,
  "category_hint": string|null,
  "date": "YYYY-MM-DD"|null,
  "bank_ref": string|null,
  "confidence": number
}

Direction rules:
- "credited", "received", "deposited", "refund", "cashback", "salary",
  "interest paid/credited" → is_income=true.
- "debited", "spent", "paid", "sent", "withdrawn", "charged", "purchase",
  "used at" → is_income=false.
- amount_cents is positive integer minor units. Direction is carried in
  is_income; never negate amount_cents.
- Use the SPENT/RECEIVED amount, never an "Avl Bal", "Avl Limit", or available
  balance/limit that appears in the same SMS.
- Emit plain JSON: numbers with no grouping commas, no quotes, no currency
  symbol (INR 6,275.00 → amount_cents 627500); booleans as true/false, not
  "true"/"false".

is_transaction:
- false ONLY for pure OTPs, marketing, balance/limit reminders with no spend,
  declined-transaction notifications, or statement reminders.
- true otherwise. A real spend or credit always wins even when the SMS also
  contains an "Avl Limit", "Bal", "Available Balance", or a "Not You? SMS
  BLOCK" footer — those describe the same transaction, do not downgrade it.

Payee extraction — the part the regex parser kept getting wrong:
- Extract the MERCHANT name only. Never include the bank name, the card last-4,
  any timestamp, or any disclaimer footer.
- Output payee in Title Case. Examples: "Taco Bell", "Apple Services", "Blinkit",
  "Keya Spring Electricity", "Goibibo".
- Strip:
    - leading underscores (HDFC card SMS prepends "_" like "_TACO BELL..")
    - trailing punctuation (".", "..", ",")
    - the time-suffix some banks attach to the merchant ("On 2026-05-24:19:24:04")
    - any "Not You", "SMS BLOCK", "Call 1800", "Block+Reissue", "To Block",
      "/SMS BLOCK", or similar bank disclaimer tail
- If the merchant cannot be identified, return payee=null. Better null than
  garbage.
- Examples (body → payee):
    "Spent Rs.352 On HDFC Bank Card 4904 At _TACO BELL.. On 2026-05-24:19:24:04.Not You? To Block+Reissue..."
      → "Taco Bell"
    "INR 4299.00 spent on HDFC Bank Card 4904 at billdeskpg.appleservices@hdfcbank on 2026-05-26..."
      → "Apple Services"
    "Sent Rs.146.00 from Kotak Bank AC X9876 to friend@example on 06-05-26.UPI Ref ..."
      → "friend@example"
    "Rs 2030 reversed/refunded by PPSL TRANSPO on 26-05-26"
      → "Paytm Transport"

category_hint:
- Choose from supplied <categories> when it clearly fits.
- Prefer the prior-mapping in <known_payees> when the merchant matches there.
- Otherwise pick a category from the supplied list when the merchant is
  unambiguous (e.g. a known QSR brand → "Eating Out").
- Return null when unsure — the app shows it as Uncategorised, which is better
  than a confident wrong guess.

account_hint: bank name + last-4 if present, e.g. "HDFC Card x4904".
date: YYYY-MM-DD. If the SMS has only a time or no date at all, return null.
bank_ref: UPI Ref / Reference No / RRN style identifier when present.
confidence: 0.9+ when unambiguous; 0.7 when one field had to be guessed; <=0.5
  when fields are unclear.`;

// Be tolerant of a well-meaning model that returns numbers/booleans as
// strings ("74200", "true") — accept the value rather than throwing the whole
// parse away. But ONLY unambiguous, lossless forms: a comma'd/currency string
// is left as-is so it fails validation and triggers a re-prompt, never a
// silent (and financially wrong) coercion. Never JS-truthy boolean coercion
// ("false" is truthy) — that could flip a debit into income.
function coerceExactBoolean(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim().toLowerCase();
  return s === "true" ? true : s === "false" ? false : v;
}
function coerceExactNumber(v: unknown): unknown {
  if (typeof v !== "string") return v;
  const s = v.trim();
  return /^-?\d+(?:\.\d+)?$/.test(s) ? Number(s) : v; // rejects commas, symbols, ""
}

const llmBool = z.preprocess(coerceExactBoolean, z.boolean());
const llmInt = z.preprocess(coerceExactNumber, z.number().finite().int());
const llmNum = z.preprocess(coerceExactNumber, z.number().finite());

const llmResponse = z.object({
  is_transaction: llmBool.optional(),
  amount_cents: llmInt.nullish(),
  is_income: llmBool.optional(),
  currency: z.string().nullish(),
  payee: z.string().nullish(),
  account_hint: z.string().nullish(),
  category_hint: z.string().nullish(),
  date: z.string().nullish(),
  bank_ref: z.string().nullish(),
  confidence: llmNum.nullish(),
});

export interface SmsCandidate {
  amountCents: number;
  isIncome: boolean;
  currency: string | null;
  payee: string | null;
  accountHint: string | null;
  categoryHint: string | null;
  categoryId: string | null;
  date: string;
  bankRef: string | null;
  confidence: number;
  parserVersion: number;
}

// Machine-readable outcome so the app's parse queue can route precisely:
//  - "transaction"  → candidate present, create/queue it
//  - "not_a_txn"    → model is confident this isn't a spend (OTP/marketing/…);
//                     terminal, never retried
//  - "parse_failed" → the model call/validation failed (bad JSON, exception);
//                     terminal-ish, surfaced for review, NOT hot-looped
// Transport failures (phone can't reach the server) never produce a result at
// all — the app sees a network error and keeps the SMS queued for retry.
export type SmsParseStatus = "transaction" | "not_a_txn" | "parse_failed";

export interface SmsParseResult {
  status: SmsParseStatus;
  isTransaction: boolean; // kept for backward-compat with older clients
  candidate: SmsCandidate | null;
  error?: string;
}

export interface SmsParseRequest {
  sender: string;
  body: string;
  receivedAt: number;
  categories?: { id: string; name: string }[];
  payees?: { id: string; name: string; categoryId?: string | null }[];
}

const PARSER_VERSION = 5;

// Re-prompt used when the model's FIRST answer couldn't be decoded (malformed
// JSON or a value we won't guess at, e.g. a comma'd amount). We ask it to fix
// its own output rather than policing it ourselves.
const DECODE_RETRY_HINT =
  "your previous answer could not be decoded: return exactly one JSON object, " +
  "use real true/false booleans, and amount_cents must be an unquoted integer " +
  "with no grouping commas (INR 6,275.00 → 627500) taken from the transaction " +
  "amount, never an available balance or limit";

export async function parseSms(
  config: AppConfig,
  req: SmsParseRequest,
): Promise<SmsParseResult> {
  try {
    let first: RawCandidate | null;
    try {
      first = await callModel(config, req, null);
    } catch (e) {
      // A malformed/undecodable model answer is recoverable — give the model
      // one more shot with a corrective nudge before surfacing parse_failed.
      // Transport/timeout errors are NOT LlmOutputError/ZodError, so they
      // propagate to the outer catch untouched.
      if (!(e instanceof LlmOutputError) && !(e instanceof z.ZodError)) throw e;
      first = await callModel(config, req, DECODE_RETRY_HINT);
    }
    const firstIssue = first ? validateCandidate(first.payee) : null;
    if (!firstIssue || !first) {
      return first ? finalize(first, req) : notATxn();
    }
    // One retry with a corrective hint when payee leakage is detected.
    const retry = await callModel(
      config,
      req,
      `the payee failed validation — ${firstIssue}; re-read the payee extraction rules`,
    );
    if (!retry) return notATxn();
    const retryIssue = validateCandidate(retry.payee);
    if (retryIssue) {
      // Second pass still leaked — give up on the merchant string but keep
      // the rest of the fields. Better an uncategorised txn than a wrong one.
      retry.payee = null;
    }
    return finalize(retry, req);
  } catch (e) {
    // Model/transport/validation blew up. Return a terminal parse_failed so the
    // app surfaces it for review rather than hot-looping retries on an SMS the
    // model can't handle. (A true network failure happens app-side, before
    // this ever runs, and keeps the SMS queued.)
    return {
      status: "parse_failed",
      isTransaction: false,
      candidate: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function notATxn(): SmsParseResult {
  return { status: "not_a_txn", isTransaction: false, candidate: null };
}

interface RawCandidate {
  amountCents: number;
  isIncome: boolean;
  currency: string | null;
  payee: string | null;
  accountHint: string | null;
  categoryHint: string | null;
  date: string;
  bankRef: string | null;
  confidence: number;
}

async function callModel(
  config: AppConfig,
  req: SmsParseRequest,
  correctiveHint: string | null,
): Promise<RawCandidate | null> {
  const receivedDate = new Date(req.receivedAt).toISOString();
  const userLines = [
    `<sender>: ${req.sender}`,
    `<received_at>: ${receivedDate}`,
    `<categories>: ${formatNamedRows(req.categories)}`,
    `<known_payees>: ${formatPayees(req.payees, req.categories)}`,
    `<body>: ${req.body}`,
  ];
  if (correctiveHint) {
    userLines.push(`<reminder>: ${correctiveHint}. Respond again.`);
  }
  const raw = await chatJson<unknown>(config, {
    system: SYSTEM,
    user: userLines.join("\n"),
  });
  const parsed = llmResponse.parse(raw);
  if (parsed.is_transaction !== true) return null;
  const amountCents = Math.trunc(parsed.amount_cents ?? 0);
  // A transaction with no usable amount is a decode miss (e.g. the model put a
  // comma'd value we refused to coerce), not a "not a transaction" — throw so
  // the caller re-prompts instead of silently dropping a real spend.
  if (amountCents <= 0) {
    throw new LlmOutputError(
      "model flagged a transaction but returned no positive amount_cents",
    );
  }
  const dateStr = isYmd(parsed.date) ? parsed.date! : ymd(new Date(req.receivedAt));
  return {
    amountCents,
    isIncome: parsed.is_income === true,
    currency: parsed.currency ?? null,
    payee: trimOrNull(parsed.payee),
    accountHint: trimOrNull(parsed.account_hint),
    categoryHint: trimOrNull(parsed.category_hint),
    date: dateStr,
    bankRef: trimOrNull(parsed.bank_ref),
    confidence: clampConfidence(parsed.confidence),
  };
}

function finalize(c: RawCandidate, req: SmsParseRequest): SmsParseResult {
  const categoryId = matchByName(c.categoryHint, req.categories ?? []);
  return {
    status: "transaction",
    isTransaction: true,
    candidate: {
      amountCents: c.amountCents,
      isIncome: c.isIncome,
      currency: c.currency,
      payee: c.payee,
      accountHint: c.accountHint,
      categoryHint: c.categoryHint,
      categoryId,
      date: c.date,
      bankRef: c.bankRef,
      confidence: c.confidence,
      parserVersion: PARSER_VERSION,
    },
  };
}

/// Deterministic post-validator. The model can still leak footer text or a
/// time-suffix into the payee on edge cases; reject those so we either retry
/// or null the payee out instead of writing garbage to the database.
///
/// Returns a short corrective hint when the payee looks wrong, or null when
/// it looks clean.
export function validateCandidate(payee: string | null): string | null {
  if (payee == null) return null;
  const trimmed = payee.trim();
  if (trimmed.length === 0) return null;
  const lower = trimmed.toLowerCase();
  if (trimmed.length > 60) return "the payee was too long — extract only the merchant name";
  if (trimmed.startsWith("_")) return 'the payee started with "_" — strip the underscore that some card SMS prepend';
  if (/[.]{2,}$/.test(trimmed)) return 'the payee ended with "..", strip trailing punctuation';
  if (/\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) return "the payee included a time suffix, strip it";
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(trimmed)) return "the payee included a YYYY-MM-DD date fragment, strip it";
  if (lower.includes("not you")) return 'the payee contained "Not You" — that\'s the bank disclaimer footer, exclude it';
  if (lower.includes("sms block")) return 'the payee contained "SMS BLOCK", that\'s the bank disclaimer footer, exclude it';
  if (lower.includes("call 1800") || lower.includes("call 1-800")) return "the payee contained a customer-care phone number, exclude it";
  if (lower.includes("block+reissue") || lower.includes("to block")) return "the payee contained a card-block instruction, exclude it";
  return null;
}

function formatNamedRows(rows: { name: string }[] | undefined): string {
  return rows?.map((r) => r.name).join(", ") || "(none)";
}

function formatPayees(
  payees: { name: string; categoryId?: string | null }[] | undefined,
  categories: { id: string; name: string }[] | undefined,
): string {
  if (!payees?.length) return "(none)";
  const catById = new Map((categories ?? []).map((c) => [c.id, c.name]));
  return payees
    .slice(0, 300)
    .map((p) => `${p.name}${p.categoryId ? `→${catById.get(p.categoryId) ?? p.categoryId}` : ""}`)
    .join(", ");
}

function matchByName(
  raw: unknown,
  rows: { id: string; name: string }[],
): string | null {
  if (typeof raw !== "string") return null;
  const hint = raw.trim().toLowerCase();
  if (hint.length === 0 || rows.length === 0) return null;
  for (const r of rows) {
    if (r.name.toLowerCase() === hint) return r.id;
  }
  for (const r of rows) {
    const n = r.name.toLowerCase();
    if (n.includes(hint) || hint.includes(n)) return r.id;
  }
  return null;
}

function isYmd(v: unknown): boolean {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function clampConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : 0.5;
  if (Number.isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}
