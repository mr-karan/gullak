import { z } from "zod";

import type { AppConfig } from "../config.ts";
import { chatJson } from "../llm/client.ts";

const SYSTEM = `You parse a single SMS into structured expense data.
Output ONLY a single JSON object.

The SMS may come from a bank, card issuer, payment processor
(Stripe/Razorpay), or a merchant SMS gateway.

Schema:
{
  "is_transaction": boolean,
  "amount_cents": integer,
  "is_income": boolean,
  "currency": "INR" | "USD" | "EUR" | "GBP" | "JPY" | other ISO code,
  "payee": string|null,
  "account_hint": string|null,
  "date": string|null,
  "bank_ref": string|null,
  "confidence": number
}

Rules:
- is_transaction=false for OTPs, marketing, balance/limit alerts,
  declined-transaction notifications, statement reminders.
  All other fields can be null/0 in that case.
- amount_cents is integer minor units. Reject negative amounts;
  use is_income=true for credits, false for debits.
- payee: extract the merchant name only, not the bank.
- account_hint: include the bank name AND last-4 of the card if
  present, e.g. "HDFC Card xx1234".
- confidence: 0.9+ when transactional and unambiguous; 0.7 when
  one field had to be guessed; <=0.5 when fields are unclear.
- Output ONLY the JSON object. No prose.`;

const llmResponse = z.object({
  is_transaction: z.boolean().optional(),
  amount_cents: z.number().nullish(),
  is_income: z.boolean().optional(),
  currency: z.string().nullish(),
  payee: z.string().nullish(),
  account_hint: z.string().nullish(),
  date: z.string().nullish(),
  bank_ref: z.string().nullish(),
  confidence: z.number().nullish(),
});

export interface SmsCandidate {
  amountCents: number;
  isIncome: boolean;
  currency: string | null;
  payee: string | null;
  accountHint: string | null;
  date: string;
  bankRef: string | null;
  confidence: number;
  parserVersion: number;
}

export interface SmsParseResult {
  isTransaction: boolean;
  candidate: SmsCandidate | null;
}

export interface SmsParseRequest {
  sender: string;
  body: string;
  receivedAt: number;
}

export async function parseSms(
  config: AppConfig,
  req: SmsParseRequest,
): Promise<SmsParseResult> {
  const receivedDate = new Date(req.receivedAt).toISOString();
  const user = `<sender>: ${req.sender}\n<received_at>: ${receivedDate}\n<body>: ${req.body}`;

  const raw = await chatJson<unknown>(config, {
    system: SYSTEM,
    user,
  });
  const parsed = llmResponse.parse(raw);
  if (parsed.is_transaction !== true) {
    return { isTransaction: false, candidate: null };
  }
  const amountCents = Math.trunc(parsed.amount_cents ?? 0);
  if (amountCents <= 0) {
    return { isTransaction: false, candidate: null };
  }
  const dateStr = isYmd(parsed.date) ? parsed.date! : ymd(new Date(req.receivedAt));
  return {
    isTransaction: true,
    candidate: {
      amountCents,
      isIncome: parsed.is_income === true,
      currency: parsed.currency ?? null,
      payee: trimOrNull(parsed.payee),
      accountHint: trimOrNull(parsed.account_hint),
      date: dateStr,
      bankRef: trimOrNull(parsed.bank_ref),
      confidence: clampConfidence(parsed.confidence),
      parserVersion: 2,
    },
  };
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
