import { Hono } from "hono";
import { z } from "zod";

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
