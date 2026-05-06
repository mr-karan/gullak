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
  "category_hint": string|null,
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
- Direction is literal from the SMS: credited/received/deposited/refund/cashback/salary
  means is_income=true; debited/spent/paid/sent/withdrawn/charged/purchase
  means is_income=false. Do not mark credits as expenses.
- payee: extract the merchant name only, not the bank.
- category_hint: choose one of the supplied categories when it clearly fits.
  Use prior payee-category mappings when present; otherwise infer from merchant
  words (Blinkit/BigBasket→Groceries, Zomato/Swiggy→Eating Out, Uber/Ola→Travel).
  Return null when unsure.
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
  category_hint: z.string().nullish(),
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
  categoryHint: string | null;
  categoryId: string | null;
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
  categories?: { id: string; name: string }[];
  payees?: { id: string; name: string; categoryId?: string | null }[];
}

export async function parseSms(
  config: AppConfig,
  req: SmsParseRequest,
): Promise<SmsParseResult> {
  const receivedDate = new Date(req.receivedAt).toISOString();
  const user = [
    `<sender>: ${req.sender}`,
    `<received_at>: ${receivedDate}`,
    `<categories>: ${formatNamedRows(req.categories)}`,
    `<known_payees>: ${formatPayees(req.payees, req.categories)}`,
    `<body>: ${req.body}`,
  ].join("\n");

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
  const inferredIncome = inferIncomeFromBody(req.body) ?? (parsed.is_income === true);
  const categoryHint = trimOrNull(parsed.category_hint) ?? inferCategoryHint(parsed.payee, req.categories, req.payees);
  const categoryId = matchByName(categoryHint, req.categories ?? []);
  return {
    isTransaction: true,
    candidate: {
      amountCents,
      isIncome: inferredIncome,
      currency: parsed.currency ?? null,
      payee: trimOrNull(parsed.payee),
      accountHint: trimOrNull(parsed.account_hint),
      categoryHint,
      categoryId,
      date: dateStr,
      bankRef: trimOrNull(parsed.bank_ref),
      confidence: clampConfidence(parsed.confidence),
      parserVersion: 2,
    },
  };
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

function inferCategoryHint(
  rawPayee: unknown,
  categories: { id: string; name: string }[] | undefined,
  payees: { name: string; categoryId?: string | null }[] | undefined,
): string | null {
  if (typeof rawPayee !== "string") return null;
  const payee = rawPayee.trim().toLowerCase();
  if (!payee) return null;
  for (const p of payees ?? []) {
    const n = p.name.toLowerCase();
    if ((n === payee || n.includes(payee) || payee.includes(n)) && p.categoryId) {
      return categories?.find((c) => c.id === p.categoryId)?.name ?? null;
    }
  }
  const rules: [RegExp, string[]][] = [
    [/(blinkit|bigbasket|zepto|dmart|grocer|supermarket)/, ["groceries", "grocery"]],
    [/(zomato|swiggy|restaurant|cafe|coffee|pizza|burger|food)/, ["eating out", "food"]],
    [/(uber|ola|rapido|metro|fuel|petrol|diesel|parking|toll)/, ["travel", "transport"]],
    [/(amazon|flipkart|myntra|nykaa|shopping|paytm)/, ["shopping"]],
    [/(netflix|spotify|prime|hotstar|bookmyshow|movie)/, ["entertainment"]],
    [/(salary|interest|dividend)/, ["salary", "income"]],
  ];
  const names = (categories ?? []).map((c) => c.name);
  for (const [re, wanted] of rules) {
    if (!re.test(payee)) continue;
    for (const w of wanted) {
      const match = names.find((n) => n.toLowerCase() === w || n.toLowerCase().includes(w));
      if (match) return match;
    }
  }
  return null;
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

function inferIncomeFromBody(body: string): boolean | null {
  const s = body.toLowerCase();

  // Prefer explicit bank/card direction over model judgment. These are the
  // words that decide sign in Indian bank SMS; LLMs occasionally parse a
  // credited/received amount correctly but still mark it as an expense.
  const incomePatterns = [
    /\bcredited\b/,
    /\bcredit(?:ed)?\s+to\b/,
    /\breceived\b/,
    /\brecvd\b/,
    /\bdeposited\b/,
    /\brefund(?:ed)?\b/,
    /\bcashback\b/,
    /\bsalary\b/,
    /\binterest\s+(?:paid|credited)\b/,
  ];
  if (incomePatterns.some((re) => re.test(s))) return true;

  const expensePatterns = [
    /\bdebited\b/,
    /\bdebit\b/,
    /\bspent\b/,
    /\bpaid\b/,
    /\bsent\b/,
    /\bwithdrawn\b/,
    /\bcharged\b/,
    /\bpurchase(?:d)?\b/,
    /\bused\s+at\b/,
  ];
  if (expensePatterns.some((re) => re.test(s))) return false;

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
