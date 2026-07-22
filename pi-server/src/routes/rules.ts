import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import { rules, type Rule } from "../db/schema.ts";
import { newId, nowMs } from "../repos/changelog.ts";
import { ruleActionsSchema, ruleTriggerSchema } from "../rules/schema.ts";

// Rules are SERVER-ONLY config (like M5 holdings/goals): NO recordChange, never
// synced to the phone. The web app is their only editor.
//
// The trigger/action envelopes are stored as JSON text in trigger_payload /
// action_payload; `stage` is a first-class column. The API validates the
// envelopes with zod, stringifies them into the text columns, and parses them
// back on read so callers always see objects — never JSON strings.

const createSchema = z.object({
  name: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  stage: z.enum(["pre", "main", "post"]).default("main"),
  priority: z.number().int().default(100),
  triggerType: z.enum(["user", "learned"]).default("user"),
  triggerPayload: ruleTriggerSchema,
  actionPayload: ruleActionsSchema,
});

const patchSchema = createSchema.partial();

/** Row → API shape. Parses the JSON envelopes back into objects and lifts
    `stage` to the top level for convenient rendering (badge/ordering). */
function serialize(row: Rule) {
  let triggerPayload: z.infer<typeof ruleTriggerSchema> = {
    match: "all",
    conditions: [{ field: "payee", op: "is", value: "invalid" }],
  };
  let actionPayload: z.infer<typeof ruleActionsSchema> = {
    actions: [{ type: "set_notes", value: { mode: "replace", text: "invalid" } }],
  };
  const validationErrors: string[] = [];
  try {
    const parsed = ruleTriggerSchema.safeParse(JSON.parse(row.triggerPayload));
    if (parsed.success) triggerPayload = parsed.data;
    else validationErrors.push(`trigger: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  } catch {
    validationErrors.push("trigger: invalid JSON");
  }
  try {
    const parsed = ruleActionsSchema.safeParse(JSON.parse(row.actionPayload));
    if (parsed.success) actionPayload = parsed.data;
    else validationErrors.push(`actions: ${parsed.error.issues.map((issue) => issue.message).join(", ")}`);
  } catch {
    validationErrors.push("actions: invalid JSON");
  }
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled,
    stage: row.stage,
    priority: row.priority,
    triggerType: row.triggerType,
    triggerPayload,
    actionPayload,
    valid: validationErrors.length === 0,
    validationErrors,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const STAGE_RANK: Record<string, number> = { pre: 0, main: 1, post: 2 };

export const rulesRouter = new Hono<AppEnv>();

rulesRouter.get("/", (c) => {
  const db = c.get("db");
  // Stage isn't a column, so order by priority in SQL then stable-sort by stage
  // in JS to get the pre → main → post, priority-asc order the engine uses.
  const rows = db.select().from(rules).orderBy(rules.priority, rules.createdAt).all();
  const out = rows
    .map(serialize)
    .sort(
      (a, b) =>
        (STAGE_RANK[a.stage] ?? 1) - (STAGE_RANK[b.stage] ?? 1) ||
        a.priority - b.priority,
    );
  return c.json({ rules: out });
});

rulesRouter.get("/:id", (c) => {
  const db = c.get("db");
  const row = db.select().from(rules).where(eq(rules.id, c.req.param("id"))).get();
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json({ rule: serialize(row) });
});

rulesRouter.post("/", async (c) => {
  const db = c.get("db");
  const body = createSchema.parse(await c.req.json());
  const id = newId();
  const at = nowMs();
  const row = {
    id,
    name: body.name,
    enabled: body.enabled,
    stage: body.stage,
    priority: body.priority,
    triggerType: body.triggerType,
    triggerPayload: JSON.stringify(body.triggerPayload),
    actionPayload: JSON.stringify(body.actionPayload),
    createdAt: at,
    updatedAt: at,
  };
  // No recordChange: rules are server-only config, not part of financial sync.
  db.insert(rules).values(row).run();
  return c.json({ rule: serialize(row) }, 201);
});

rulesRouter.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const body = patchSchema.parse(await c.req.json());
  const existing = db.select().from(rules).where(eq(rules.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  const next = {
    ...existing,
    ...(body.name !== undefined ? { name: body.name } : {}),
    ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    ...(body.stage !== undefined ? { stage: body.stage } : {}),
    ...(body.priority !== undefined ? { priority: body.priority } : {}),
    ...(body.triggerType !== undefined ? { triggerType: body.triggerType } : {}),
    ...(body.triggerPayload !== undefined
      ? { triggerPayload: JSON.stringify(body.triggerPayload) }
      : {}),
    ...(body.actionPayload !== undefined
      ? { actionPayload: JSON.stringify(body.actionPayload) }
      : {}),
    updatedAt: nowMs(),
  };
  db.update(rules).set(next).where(eq(rules.id, id)).run();
  return c.json({ rule: serialize(next) });
});

rulesRouter.delete("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const existing = db.select().from(rules).where(eq(rules.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  db.delete(rules).where(eq(rules.id, id)).run();
  return c.body(null, 204);
});
