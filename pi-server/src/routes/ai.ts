import { Hono } from "hono";
import { z } from "zod";

import { enrichSms } from "../ai/sms_enricher.ts";
import { parseSms } from "../ai/sms_parser.ts";
import {
  parseQuickEntry,
  quickEntryRequest,
} from "../ai/quick_entry_parser.ts";
import type { AppEnv } from "../app.ts";
import { recordParseFailure } from "../repos/feedback.ts";

export const aiRouter = new Hono<AppEnv>();

const smsBody = z.object({
  sender: z.string().min(1).max(64),
  body: z.string().min(1).max(2000),
  receivedAt: z.number().int().nonnegative(),
  categories: z.array(z.object({ id: z.string(), name: z.string() })).max(500).optional(),
  payees: z.array(z.object({
    id: z.string(),
    name: z.string(),
    categoryId: z.string().nullable().optional(),
  })).max(2000).optional(),
});

aiRouter.post("/sms/parse", async (c) => {
  const config = c.get("config");
  const db = c.get("db");
  const parsed = smsBody.parse(await c.req.json());
  try {
    const result = await parseSms(config, parsed);
    if (result.status === "parse_failed") {
      // Terminal content failure — auto-capture so it's diagnosable without a
      // manual "Send feedback" tap.
      recordParseFailure(db, {
        sender: parsed.sender,
        body: parsed.body,
        error: result.error ?? "parse_failed",
        operational: false,
      });
    }
    return c.json(result);
  } catch (e) {
    // Operational failure (LLM 402/5xx, timeout, network). Auto-capture it and
    // reply 503 so the phone keeps the SMS queued and retries — the model never
    // judged it, so it must NOT be recorded as a bad message.
    const error = e instanceof Error ? e.message : String(e);
    recordParseFailure(db, {
      sender: parsed.sender,
      body: parsed.body,
      error,
      operational: true,
    });
    return c.json({ status: "unavailable", error, retryable: true }, 503);
  }
});

aiRouter.post("/quick-entry/parse", async (c) => {
  const config = c.get("config");
  const parsed = quickEntryRequest.parse(await c.req.json());
  const result = await parseQuickEntry(config, parsed);
  return c.json(result);
});

const enrichBody = z.object({
  smsBody: z.string().min(1).max(2000),
  receivedAt: z.number().int().nonnegative(),
  currentCandidate: z.object({
    amountCents: z.number().int(),
    isIncome: z.boolean(),
    payee: z.string().nullable().optional(),
    accountHint: z.string().nullable().optional(),
    categoryHint: z.string().nullable().optional(),
    date: z.string().nullable().optional(),
  }),
  userNote: z.string().min(1).max(500),
  location: z
    .object({
      lat: z.number().nullable().optional(),
      lng: z.number().nullable().optional(),
      accuracyMeters: z.number().nullable().optional(),
      capturedAt: z.number().nullable().optional(),
      placeName: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
  categories: z
    .array(z.object({ id: z.string(), name: z.string() }))
    .max(500)
    .optional(),
  payees: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        categoryId: z.string().nullable().optional(),
      }),
    )
    .max(2000)
    .optional(),
});

aiRouter.post("/sms/enrich", async (c) => {
  const config = c.get("config");
  const parsed = enrichBody.parse(await c.req.json());
  const candidate = await enrichSms(config, parsed);
  return c.json({ candidate });
});
