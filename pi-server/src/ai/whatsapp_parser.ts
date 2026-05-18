import { z } from "zod";

import type { AppConfig } from "../config.ts";
import { chatJson } from "../llm/client.ts";
import { staticCategoryForPayee } from "./payee_rules.ts";

/// Parses a single inbound WhatsApp message into 0..N expense candidates.
/// Unlike SMS, WhatsApp messages routinely contain multiple expenses on
/// separate lines (`"480 groceries\n2800 home decor"`) and natural-language
/// phrasing rather than bank-template strings. We let the model split the
/// message and emit one item per expense — then queue each as its own
/// inbox candidate so the existing per-row review UX applies.

const SYSTEM = `You parse a WhatsApp message into structured expense items.
Each line or comma-separated fragment that looks like a spend should become
ONE item. If the message contains no expense at all (a greeting, a
question, small talk) return an empty items array.

Output ONLY a single JSON object:

{
  "items": [
    {
      "amount_cents": integer,
      "is_income": boolean,
      "payee": string|null,
      "account_hint": string|null,
      "category_hint": string|null,
      "date": string|null,         // YYYY-MM-DD; omit/null = today
      "notes": string|null,
      "text": string                // the slice of the message this item covers
    }
  ]
}

Rules:
- Money is integer minor units. "480" with 2 minor digits = 48000.
- is_income=true ONLY when the user says they received money (refund,
  salary, transfer received). Default is_income=false for spends.
- Reject negative amounts. If you cannot extract an amount for an item,
  drop it from items.
- payee is the merchant or person involved when stated. Don't invent.
- account_hint: bank/wallet name if user mentions it (e.g. "hdfc",
  "axis", "cash"). Don't invent.
- category_hint: choose from the supplied categories when it clearly
  fits ("groceries 480" → "Groceries"). Use null if unsure.
- date defaults to today. Parse "yesterday" relative to <today>.
- notes: leftover descriptive text the user wrote ("home decor" in
  "2800 home decor" goes to notes).
- text: the exact substring you matched — used so the user can audit.
- A message with multiple expenses on multiple lines / separated by
  commas / "and" / newlines → produce one item per expense.
- Output ONLY the JSON object. No prose.`;

const llmResponse = z.object({
  items: z
    .array(
      z.object({
        amount_cents: z.number().nullish(),
        is_income: z.boolean().nullish(),
        payee: z.string().nullish(),
        account_hint: z.string().nullish(),
        category_hint: z.string().nullish(),
        date: z.string().nullish(),
        notes: z.string().nullish(),
        text: z.string().nullish(),
      }),
    )
    .max(20),
});

export interface WhatsappCandidate {
  amountCents: number;
  isIncome: boolean;
  payee: string | null;
  accountHint: string | null;
  categoryHint: string | null;
  categoryId: string | null;
  date: string;
  notes: string | null;
  text: string;
}

export interface WhatsappParseRequest {
  body: string;
  receivedAt: number;
  categories?: { id: string; name: string }[];
  accounts?: { id: string; name: string }[];
}

export async function parseWhatsappExpenses(
  config: AppConfig,
  req: WhatsappParseRequest,
): Promise<WhatsappCandidate[]> {
  const today = ymd(new Date(req.receivedAt));
  const user = [
    `<today>: ${today}`,
    `<accounts>: ${(req.accounts ?? []).map((a) => a.name).join(", ") || "(none)"}`,
    `<categories>: ${(req.categories ?? []).map((c) => c.name).join(", ") || "(none)"}`,
    "",
    `Message: ${req.body}`,
  ].join("\n");

  const raw = await chatJson<unknown>(config, {
    system: SYSTEM,
    user,
    temperature: 0,
  });
  const parsed = llmResponse.parse(raw);
  const out: WhatsappCandidate[] = [];
  for (const item of parsed.items) {
    const amount = Math.trunc(item.amount_cents ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const date = isYmd(item.date) ? item.date! : today;
    // Fall back to the built-in payee→category table when the LLM
    // didn't pick a category — covers "uber 300" / "zomato lunch"
    // first-time entries without waiting for the user to train it.
    const categoryHint =
      trimOrNull(item.category_hint) ??
      staticCategoryForPayee(trimOrNull(item.payee) ?? item.text ?? "");
    const categoryId = matchByName(categoryHint, req.categories ?? []);
    out.push({
      amountCents: amount,
      isIncome: item.is_income === true,
      payee: trimOrNull(item.payee),
      accountHint: trimOrNull(item.account_hint),
      categoryHint,
      categoryId,
      date,
      notes: trimOrNull(item.notes),
      text: trimOrNull(item.text) ?? req.body.trim(),
    });
  }
  return out;
}

/// Inbox-shape JSON for one candidate, in the same key layout the Flutter
/// app's SMS pipeline already expects. Phones read `candidate_json` and
/// hydrate the Inbox row without any whatsapp-specific code paths.
export function candidateJson(c: WhatsappCandidate): string {
  return JSON.stringify({
    amount_cents: c.amountCents,
    is_income: c.isIncome,
    currency: "INR",
    payee: c.payee,
    account_hint: c.accountHint,
    category_hint: c.categoryHint,
    category_id: c.categoryId,
    date: c.date,
    bank_ref: null,
    confidence: 0.85,
    parser_version: 1,
    source: "whatsapp",
    notes: c.notes,
    text: c.text,
  });
}

function matchByName(
  raw: string | null,
  rows: { id: string; name: string }[],
): string | null {
  if (!raw || rows.length === 0) return null;
  const hint = raw.trim().toLowerCase();
  if (!hint) return null;
  for (const r of rows) {
    if (r.name.toLowerCase() === hint) return r.id;
  }
  for (const r of rows) {
    const n = r.name.toLowerCase();
    if (n.includes(hint) || hint.includes(n)) return r.id;
  }
  return null;
}

function trimOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function isYmd(v: unknown): v is string {
  return typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
}

function ymd(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}
