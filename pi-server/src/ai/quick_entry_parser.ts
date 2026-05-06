import { z } from "zod";

import type { AppConfig } from "../config.ts";
import { chatJson } from "../llm/client.ts";

const SYSTEM = `You convert a one-line expense note into a structured
expense draft. Output ONLY a single JSON object — no prose.

Schema:
{
  "amount_minor": integer,        // major × 10^minor_digits
  "is_income": boolean,
  "payee": string|null,
  "account_hint": string|null,
  "category_hint": string|null,
  "notes": string|null,
  "date": "YYYY-MM-DD" | null,    // null = today
  "confidence": 0..1
}

Rules:
- The note's currency conventions match the user's locale. Treat
  written numbers as the major unit. Use minor_digits=2 unless told
  otherwise. "1.5L" / "1L" / "1k" are Indian shorthand.
- Default is an expense (is_income=false). Words like "got",
  "received", "salary", "refund" → is_income=true.
- payee: the merchant or counterparty as written.
- account_hint: bank/card name if mentioned ("hdfc", "axis card").
- category_hint: a free-text category guess if obvious, else null.
  Prefer a supplied category name. Use known payee→category mappings when present.
- date: only set when the user explicitly named a day. "yesterday",
  "today", "5 may" → resolve against the supplied today.
- Do NOT invent values. If unclear, leave that field null and lower
  the confidence.

Examples (assume minor_digits=2):
- "blinkit 450 hdfc groceries" → {"amount_minor":45000,"is_income":false,"payee":"blinkit","account_hint":"hdfc","category_hint":"groceries","notes":null,"date":null,"confidence":0.9}
- "300 zomato yesterday" → {"amount_minor":30000,"is_income":false,"payee":"zomato","account_hint":null,"category_hint":null,"notes":null,"date":"<yesterday>","confidence":0.8}
- "got 5k from mom" → {"amount_minor":500000,"is_income":true,"payee":"mom","account_hint":null,"category_hint":null,"notes":null,"date":null,"confidence":0.85}
`;

const SYSTEM_IMAGE = `You read a receipt photo and extract a single
expense draft. Same JSON schema as the text path. Use the receipt's
total amount as amount_minor. Set is_income=false unless the receipt
is clearly a refund.`;

const namedRow = z.object({ id: z.string(), name: z.string() });
const payeeRow = namedRow.extend({ categoryId: z.string().nullable().optional() });

export const quickEntryRequest = z.object({
  text: z.string().min(0).max(2000),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minorDigits: z.number().int().min(0).max(4),
  accounts: z.array(namedRow).max(200).default([]),
  categories: z.array(namedRow).max(500).default([]),
  payees: z.array(payeeRow).max(2000).default([]),
  imageBase64: z.string().optional(),
  imageMimeType: z.string().optional(),
});

export type QuickEntryRequest = z.infer<typeof quickEntryRequest>;

const llmResponse = z.object({
  amount_minor: z.number().nullish(),
  is_income: z.boolean().optional(),
  payee: z.string().nullish(),
  account_hint: z.string().nullish(),
  category_hint: z.string().nullish(),
  notes: z.string().nullish(),
  date: z.string().nullish(),
  confidence: z.number().nullish(),
});

export interface QuickEntryResult {
  amountCents: number;
  isIncome: boolean;
  payeeName: string | null;
  payeeId: string | null;
  accountHint: string | null;
  accountId: string | null;
  categoryHint: string | null;
  categoryId: string | null;
  notes: string | null;
  date: string | null;
  confidence: number;
}

export async function parseQuickEntry(
  config: AppConfig,
  req: QuickEntryRequest,
): Promise<QuickEntryResult> {
  const minor = req.minorDigits;
  const userLines = [
    `today: ${req.today}`,
    `minor_digits: ${minor}`,
    `accounts: ${req.accounts.map((a) => a.name).join(", ") || "(none)"}`,
    `categories: ${req.categories.map((c) => c.name).join(", ") || "(none)"}`,
    `payees: ${formatPayees(req.payees, req.categories)}`,
    `note: ${req.text}`,
  ];
  const raw = await chatJson<unknown>(config, {
    system: req.imageBase64 ? SYSTEM_IMAGE : SYSTEM,
    user: userLines.join("\n"),
    imageBase64: req.imageBase64,
    imageMimeType: req.imageMimeType,
  });
  const parsed = llmResponse.parse(raw);
  const amount = Math.trunc(parsed.amount_minor ?? 0);
  const date = isYmd(parsed.date) ? parsed.date! : null;
  const categoryHint = trimOrNull(parsed.category_hint) ?? categoryForPayee(parsed.payee, req.payees, req.categories);
  return {
    amountCents: amount,
    isIncome: parsed.is_income === true,
    payeeName: trimOrNull(parsed.payee),
    payeeId: matchByName(parsed.payee, req.payees),
    accountHint: trimOrNull(parsed.account_hint),
    accountId: matchByName(parsed.account_hint, req.accounts),
    categoryHint,
    categoryId: matchByName(categoryHint, req.categories),
    notes: trimOrNull(parsed.notes),
    date,
    confidence: clampConfidence(parsed.confidence),
  };
}

function categoryForPayee(
  rawPayee: unknown,
  payees: { name: string; categoryId?: string | null }[],
  categories: { id: string; name: string }[],
): string | null {
  if (typeof rawPayee !== "string") return null;
  const payee = rawPayee.trim().toLowerCase();
  if (!payee) return null;
  for (const p of payees) {
    const n = p.name.toLowerCase();
    if ((n === payee || n.includes(payee) || payee.includes(n)) && p.categoryId) {
      return categories.find((c) => c.id === p.categoryId)?.name ?? null;
    }
  }
  return null;
}

function formatPayees(
  payees: { name: string; categoryId?: string | null }[],
  categories: { id: string; name: string }[],
): string {
  if (payees.length === 0) return "(none)";
  const catById = new Map(categories.map((c) => [c.id, c.name]));
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
