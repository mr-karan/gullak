import { z } from "zod";

import type { AppConfig } from "../config.ts";
import { chatJson } from "../llm/client.ts";
import { staticCategoryForPayee } from "./payee_rules.ts";

/// Second-stage SMS parser. Given the raw bank SMS, the current parser
/// candidate (often only an amount + bank), the user's high-signal note
/// captured at SMS-time, and optionally a cached location, produce a
/// richer candidate with payee + category. Kept separate from
/// `sms_parser` so the original `/v1/ai/sms/parse` stays "SMS in,
/// candidate out" and the enrichment race conditions (note before
/// parse, parse before note, offline retry) are easy to reason about.

const SYSTEM = `You enrich a parsed bank SMS using a short note the user
typed at the moment the transaction happened. The note is high-signal —
it usually names the merchant or reason ("decathlon hiking shoes",
"tea with priya", "rent april"). Use it to fill payee + category that
the raw SMS alone could not produce.

Output ONLY a single JSON object:

{
  "amount_cents": integer,
  "is_income": boolean,
  "payee": string|null,
  "account_hint": string|null,
  "category_hint": string|null,
  "date": string|null,
  "notes": string|null,
  "confidence": number
}

Rules:
- amount_cents/is_income/account_hint default to the current candidate.
  Do not change them unless the note clearly says so (e.g. "refund").
- payee: extract a clean merchant name from the note when present.
  Title-case it ("Decathlon", "Zomato"). Don't invent.
- category_hint: choose one of the supplied categories when the note
  makes it unambiguous. Use the prior payee→category mappings when the
  note names a known payee.
- notes: short, clean description for the transaction — typically the
  user's note tidied up. Drop the merchant name if it's already the
  payee.
- date: keep the current candidate's date.
- confidence: 0.9+ when payee+category both unambiguous, 0.7 when one
  field guessed, <0.5 when unclear.
- Output ONLY the JSON. No prose.`;

const llmResponse = z.object({
  amount_cents: z.number().nullish(),
  is_income: z.boolean().nullish(),
  payee: z.string().nullish(),
  account_hint: z.string().nullish(),
  category_hint: z.string().nullish(),
  date: z.string().nullish(),
  notes: z.string().nullish(),
  confidence: z.number().nullish(),
});

export interface CurrentCandidate {
  amountCents: number;
  isIncome: boolean;
  payee?: string | null;
  accountHint?: string | null;
  categoryHint?: string | null;
  date?: string | null;
}

export interface LocationContext {
  lat?: number | null;
  lng?: number | null;
  accuracyMeters?: number | null;
  capturedAt?: number | null;
  placeName?: string | null;
}

export interface SmsEnrichRequest {
  smsBody: string;
  receivedAt: number;
  currentCandidate: CurrentCandidate;
  userNote: string;
  location?: LocationContext | null;
  categories?: { id: string; name: string }[];
  payees?: { id: string; name: string; categoryId?: string | null }[];
}

export interface EnrichedCandidate {
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
  notes: string | null;
  userNote: string;
}

export async function enrichSms(
  config: AppConfig,
  req: SmsEnrichRequest,
): Promise<EnrichedCandidate> {
  const today = ymd(new Date(req.receivedAt));
  const userPrompt = [
    `<today>: ${today}`,
    `<categories>: ${formatRows(req.categories)}`,
    `<known_payees>: ${formatPayees(req.payees, req.categories)}`,
    "",
    "<current_candidate>:",
    `  amount_cents: ${req.currentCandidate.amountCents}`,
    `  is_income: ${req.currentCandidate.isIncome}`,
    `  payee: ${req.currentCandidate.payee ?? "(none)"}`,
    `  account_hint: ${req.currentCandidate.accountHint ?? "(none)"}`,
    `  category_hint: ${req.currentCandidate.categoryHint ?? "(none)"}`,
    `  date: ${req.currentCandidate.date ?? today}`,
    "",
    `<raw_sms>: ${req.smsBody}`,
    "",
    `<user_note>: ${req.userNote}`,
    req.location
      ? `<location>: lat=${req.location.lat ?? "?"} lng=${req.location.lng ?? "?"} place=${req.location.placeName ?? "(unknown)"}`
      : "<location>: (none)",
  ].join("\n");

  const raw = await chatJson<unknown>(config, {
    system: SYSTEM,
    user: userPrompt,
    temperature: 0,
  });
  const parsed = llmResponse.parse(raw);

  const amount = Math.trunc(
    parsed.amount_cents ?? req.currentCandidate.amountCents,
  );
  const isIncome = parsed.is_income ?? req.currentCandidate.isIncome;
  const dateStr = isYmd(parsed.date)
    ? parsed.date!
    : (req.currentCandidate.date ?? today);

  // Same fallback as the other pipelines: built-in rules table catches
  // common merchants that the LLM left as null. The note itself is also
  // a valid signal source if the LLM didn't extract a clean payee.
  const categoryHint =
    trimOrNull(parsed.category_hint) ??
    staticCategoryForPayee(trimOrNull(parsed.payee) ?? req.userNote);
  const categoryId = matchByName(categoryHint, req.categories ?? []);

  return {
    amountCents: amount,
    isIncome,
    currency: "INR",
    payee: trimOrNull(parsed.payee),
    accountHint: trimOrNull(parsed.account_hint),
    categoryHint,
    categoryId,
    date: dateStr,
    bankRef: null,
    confidence: clampConfidence(parsed.confidence),
    parserVersion: 4,
    notes: trimOrNull(parsed.notes),
    userNote: req.userNote,
  };
}

function formatRows(rows: { name: string }[] | undefined): string {
  return rows?.map((r) => r.name).join(", ") || "(none)";
}

function formatPayees(
  payees: { name: string; categoryId?: string | null }[] | undefined,
  categories: { id: string; name: string }[] | undefined,
): string {
  if (!payees?.length) return "(none)";
  const byId = new Map((categories ?? []).map((c) => [c.id, c.name]));
  return payees
    .slice(0, 300)
    .map(
      (p) =>
        `${p.name}${p.categoryId ? `→${byId.get(p.categoryId) ?? p.categoryId}` : ""}`,
    )
    .join(", ");
}

function matchByName(
  raw: string | null,
  rows: { id: string; name: string }[],
): string | null {
  if (!raw || rows.length === 0) return null;
  const h = raw.trim().toLowerCase();
  if (!h) return null;
  for (const r of rows) {
    if (r.name.toLowerCase() === h) return r.id;
  }
  for (const r of rows) {
    const n = r.name.toLowerCase();
    if (n.includes(h) || h.includes(n)) return r.id;
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

function clampConfidence(v: unknown): number {
  const n = typeof v === "number" ? v : 0.5;
  if (Number.isNaN(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}
