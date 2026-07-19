import { eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { goals, holdings } from "../db/schema.ts";
import {
  HoldingsImportError,
  parseHoldingsWorkbook,
  toCents,
} from "../holdings/import.ts";
import { newId, nowMs } from "../repos/changelog.ts";

// Holdings are server-only: NO recordChange (see M5 epic). Per-unit prices are
// REAL; every aggregation is over the integer cents columns.

// A real export is ~50 KB; 2 MB is a 40x ceiling that still stops an abusive
// upload without touching the global 15 MB body limit.
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export const holdingsRouter = new Hono<AppEnv>();

function serialize(h: typeof holdings.$inferSelect) {
  return {
    id: h.id,
    isin: h.isin,
    symbol: h.symbol,
    name: h.name,
    kind: h.kind,
    sector: h.sector,
    quantity: h.quantity,
    avgPrice: h.avgPrice,
    lastPrice: h.lastPrice,
    investedCents: h.investedCents,
    currentCents: h.currentCents,
    goalId: h.goalId,
    stale: h.stale,
    importedAt: h.importedAt,
    createdAt: h.createdAt,
    updatedAt: h.updatedAt,
  };
}

holdingsRouter.get("/", (c) => {
  const db = c.get("db");
  const rows = db
    .select()
    .from(holdings)
    .orderBy(sql`${holdings.currentCents} DESC`)
    .all();

  // Summary is computed over non-stale rows only.
  const summary = db
    .select({
      investedCents: sql<number>`COALESCE(SUM(${holdings.investedCents}), 0)`,
      currentCents: sql<number>`COALESCE(SUM(${holdings.currentCents}), 0)`,
      count: sql<number>`COUNT(*)`,
      lastImportAt: sql<number | null>`MAX(${holdings.importedAt})`,
    })
    .from(holdings)
    .where(eq(holdings.stale, false))
    .get() ?? { investedCents: 0, currentCents: 0, count: 0, lastImportAt: null };

  return c.json({
    holdings: rows.map(serialize),
    summary: {
      investedCents: summary.investedCents,
      currentCents: summary.currentCents,
      pnlCents: summary.currentCents - summary.investedCents,
      count: summary.count,
      lastImportAt: summary.lastImportAt,
    },
  });
});

holdingsRouter.post("/import", async (c) => {
  const db = c.get("db");
  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File)) {
    return c.json({ error: "Expected a multipart 'file' field." }, 400);
  }
  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength > MAX_IMPORT_BYTES) {
    return c.json({ error: "File too large (max 2 MB)." }, 413);
  }

  let parsed;
  try {
    parsed = await parseHoldingsWorkbook(buf);
  } catch (err) {
    if (err instanceof HoldingsImportError) {
      return c.json({ error: err.message }, 400);
    }
    throw err;
  }
  // A structurally-valid workbook with zero usable rows must not touch the
  // portfolio: applying it would mark every existing holding stale, and a
  // malformed file is far likelier than a genuinely empty demat account.
  if (parsed.length === 0) {
    return c.json(
      {
        error:
          "No valid holdings rows found in the file — refusing to modify holdings.",
      },
      400,
    );
  }

  const at = nowMs();
  const existing = db.select().from(holdings).all();
  const byIsin = new Map(existing.map((h) => [h.isin, h]));
  const importedIsins = new Set(parsed.map((p) => p.isin));

  let updated = 0;
  let added = 0;

  db.transaction((tx) => {
    for (const p of parsed) {
      const prev = byIsin.get(p.isin);
      const investedCents = toCents(p.quantity, p.avgPrice);
      const currentCents = toCents(p.quantity, p.lastPrice);
      if (prev) {
        // Upsert: refresh import-owned fields. NEVER touch goalId or name
        // (user data) or createdAt. Reappearing rows clear the stale flag.
        tx.update(holdings)
          .set({
            symbol: p.symbol,
            kind: p.kind,
            sector: p.sector,
            quantity: p.quantity,
            avgPrice: p.avgPrice,
            lastPrice: p.lastPrice,
            investedCents,
            currentCents,
            stale: false,
            importedAt: at,
            updatedAt: at,
          })
          .where(eq(holdings.id, prev.id))
          .run();
        updated++;
      } else {
        tx.insert(holdings)
          .values({
            id: newId(),
            isin: p.isin,
            symbol: p.symbol,
            name: null,
            kind: p.kind,
            sector: p.sector,
            quantity: p.quantity,
            avgPrice: p.avgPrice,
            lastPrice: p.lastPrice,
            investedCents,
            currentCents,
            goalId: null,
            stale: false,
            importedAt: at,
            createdAt: at,
            updatedAt: at,
          })
          .run();
        added++;
      }
    }

    // Rows in DB but absent from this file → mark stale (never delete: a sold
    // holding vanishing without trace would break goal history).
    for (const h of existing) {
      if (!importedIsins.has(h.isin) && !h.stale) {
        tx.update(holdings)
          .set({ stale: true, updatedAt: at })
          .where(eq(holdings.id, h.id))
          .run();
      }
    }
  });

  const missing = existing
    .filter((h) => !importedIsins.has(h.isin))
    .map((h) => ({ isin: h.isin, symbol: h.symbol }));

  return c.json({ updated, added, missing });
});

const patchSchema = z.object({
  goalId: z.string().min(1).nullish(),
  name: z.string().max(200).nullish(),
  // The web's missing-rows panel lets the user explicitly mark a holding
  // stale (or revive it) without waiting for the next import.
  stale: z.boolean().optional(),
});

holdingsRouter.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const body = patchSchema.parse(await c.req.json());
  const existing = db.select().from(holdings).where(eq(holdings.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const patch: Partial<typeof holdings.$inferSelect> = {};
  if (body.goalId !== undefined) {
    if (body.goalId !== null) {
      const goal = db.select().from(goals).where(eq(goals.id, body.goalId)).get();
      if (!goal) return c.json({ error: "Goal not found" }, 400);
    }
    patch.goalId = body.goalId ?? null;
  }
  if (body.name !== undefined) {
    patch.name = body.name ?? null;
  }
  if (body.stale !== undefined) {
    patch.stale = body.stale;
  }
  const next = { ...existing, ...patch, updatedAt: nowMs() };
  db.update(holdings).set(next).where(eq(holdings.id, id)).run();
  return c.json({ holding: serialize(next) });
});

holdingsRouter.delete("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const rows = db.delete(holdings).where(eq(holdings.id, id)).returning().all();
  if (rows.length === 0) return c.json({ error: "Not found" }, 404);
  return c.body(null, 204);
});
