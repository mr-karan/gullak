import { Hono } from "hono";
import { z } from "zod";

import { enrichSms } from "../ai/sms_enricher.ts";
import { parseSms } from "../ai/sms_parser.ts";
import {
  parseQuickEntry,
  quickEntryRequest,
} from "../ai/quick_entry_parser.ts";
import type { AppEnv } from "../app.ts";

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
  const parsed = smsBody.parse(await c.req.json());
  const result = await parseSms(config, parsed);
  return c.json(result);
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
