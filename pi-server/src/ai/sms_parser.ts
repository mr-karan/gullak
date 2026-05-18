import { z } from "zod";

import type { AppConfig } from "../config.ts";
import { chatJson } from "../llm/client.ts";
import { staticCategoryForPayee } from "./payee_rules.ts";

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
- is_transaction=false ONLY when the SMS is purely an OTP, marketing, a
  balance/limit reminder with no spend, a declined-transaction
  notification, or a statement reminder. All other fields can be null/0
  in that case.
- A real spend or credit always wins. If the SMS contains "Spent",
  "Debited", "Credited", "Paid", "Received", "Withdrawn", "Sent",
  "Refunded", or a similar verb attached to an amount, treat it as
  is_transaction=true even when the message also includes an "Avl Limit",
  "Bal", "Available Balance", or a "Not you? SMS BLOCK" footer. Those
  ancillary lines describe the same spend; do not let them downgrade
  the message to a non-transaction.
- amount_cents is integer minor units. Reject negative amounts;
  use is_income=true for credits, false for debits.
- Direction is literal from the SMS: credited/received/deposited/refund/cashback/salary
  means is_income=true; debited/spent/paid/sent/withdrawn/charged/purchase
  means is_income=false. Do not mark credits as expenses.
- payee: extract the merchant name only, not the bank.
- category_hint: choose one of the supplied categories when it clearly fits.
  Use prior payee-category mappings when present. Otherwise choose a supplied
  category when the SMS/merchant makes it unambiguous. Return null when unsure;
  the app will show it as Unknown/uncategorised.
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
  const deterministic = parseDeterministicBankSms(req);
  if (deterministic) return deterministic;

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
  const categoryHint = knownPayeeCategory(parsed.payee, req.categories, req.payees) ?? trimOrNull(parsed.category_hint) ?? inferCategoryHint(parsed.payee, req.categories);
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

function parseDeterministicBankSms(req: SmsParseRequest): SmsParseResult | null {
  const body = req.body.replace(/\s+/g, " ").trim();
  const isIncome = inferIncomeFromBody(body);
  if (isIncome == null) return null;
  const amountCents = extractAmountCents(body);
  if (amountCents == null || amountCents <= 0) return null;

  const payee = extractPayee(body);
  const categoryHint =
    knownPayeeCategory(payee, req.categories, req.payees) ??
    inferCategoryHint(payee, req.categories);
  const categoryId = matchByName(categoryHint, req.categories ?? []);
  return {
    isTransaction: true,
    candidate: {
      amountCents,
      isIncome,
      currency: "INR",
      payee,
      accountHint: extractAccountHint(body, req.sender),
      categoryHint,
      categoryId,
      date: extractSmsDate(body) ?? ymd(new Date(req.receivedAt)),
      bankRef: extractBankRef(body),
      confidence: 0.9,
      parserVersion: 3,
    },
  };
}

function extractAmountCents(body: string): number | null {
  const amountPatterns = [
    /\b(?:rs\.?|inr|₹)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
    /\b([0-9][0-9,]*(?:\.[0-9]{1,2})?)\s*(?:rs\.?|inr)\b/i,
  ];
  for (const re of amountPatterns) {
    const match = body.match(re);
    const raw = match?.[1];
    if (!raw) continue;
    const n = Number.parseFloat(raw.replace(/,/g, ""));
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100);
  }
  return null;
}

function extractPayee(body: string): string | null {
  const patterns = [
    /\bto\s+(.+?)\s+on\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/i,
    /\bto\s+(.+?)\s*(?:\.|,)?\s*(?:upi\s+ref|ref(?:erence)?\b)/i,
    /\bat\s+(.+?)\s*(?:\.|,)?\s*(?:upi\s+ref|ref(?:erence)?\b|on\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b|$)/i,
    /\bfrom\s+(.+?)\s+on\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\b/i,
  ];
  for (const re of patterns) {
    const match = body.match(re);
    const cleaned = cleanPayee(match?.[1]);
    if (cleaned) return cleaned;
  }
  return null;
}

function cleanPayee(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/\b(?:UPI|NEFT|IMPS|RTGS)\b\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:-]+$/g, "")
    .trim();
  if (!cleaned) return null;
  if (/^(?:kotak|hdfc|axis|icici|sbi|yes|idfc|bank|a\/?c|ac)\b/i.test(cleaned)) {
    return null;
  }
  return cleaned.slice(0, 120);
}

function extractAccountHint(body: string, sender: string): string | null {
  const account = body.match(/\b(?:a\/c|ac|account|card)\s*(?:no\.?)?\s*(?:x+|xx|ending\s*)?([0-9]{3,6})\b/i);
  const bank =
    body.match(/\b(Kotak|HDFC|Axis|ICICI|SBI|Yes|IDFC|Federal|IndusInd|Canara|PNB)\b/i)?.[1] ??
    sender.match(/-?([A-Z]{3,8})/i)?.[1];
  if (!account && !bank) return null;
  const suffix = account?.[1];
  return [bank ? titleCase(bank) : null, suffix ? `AC X${suffix}` : null]
    .filter(Boolean)
    .join(" ");
}

function extractSmsDate(body: string): string | null {
  const match = body.match(/\b(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})\b/);
  const [, rawDay, rawMonth, rawYear] = match ?? [];
  if (!rawDay || !rawMonth || !rawYear) return null;
  const day = Number.parseInt(rawDay, 10);
  const month = Number.parseInt(rawMonth, 10);
  let year = Number.parseInt(rawYear, 10);
  if (year < 100) year += 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function extractBankRef(body: string): string | null {
  const match = body.match(/\b(?:UPI\s+Ref|UPI\s+Reference|Ref(?:erence)?(?:\s+No\.?)?)\s*[:#-]?\s*([A-Z0-9]{6,})\b/i);
  return match?.[1] ?? null;
}

function titleCase(s: string): string {
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
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

function knownPayeeCategory(
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
  return null;
}

function inferCategoryHint(
  rawPayee: unknown,
  categories: { id: string; name: string }[] | undefined,
): string | null {
  // Delegates to the shared static rules table. Returns the raw rule
  // name ("Eating Out") only when the user has a matching category in
  // their list — otherwise null so the inbox row shows uncategorised.
  const ruleHint = staticCategoryForPayee(rawPayee);
  if (!ruleHint) return null;
  const names = (categories ?? []).map((c) => c.name);
  const lowerHint = ruleHint.toLowerCase();
  const match = names.find(
    (n) => n.toLowerCase() === lowerHint || n.toLowerCase().includes(lowerHint),
  );
  return match ?? null;
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
