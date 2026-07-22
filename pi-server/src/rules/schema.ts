import { z } from "zod";

const stringValue = z.string().min(1).max(2000);
const idValue = z.string().min(1).max(200);

const textCondition = (field: "payee" | "smsBody") =>
  z.discriminatedUnion("op", [
    z.object({ field: z.literal(field), op: z.enum(["is", "isNot", "contains", "matches"]), value: stringValue }),
    z.object({ field: z.literal(field), op: z.literal("oneOf"), value: z.array(stringValue).min(1) }),
  ]);

const idCondition = (field: "account" | "category" | "payeeId") =>
  z.discriminatedUnion("op", [
    z.object({ field: z.literal(field), op: z.literal("is"), value: idValue }),
    z.object({ field: z.literal(field), op: z.literal("oneOf"), value: z.array(idValue).min(1) }),
  ]);

export const ruleConditionSchema = z.union([
  textCondition("payee"),
  textCondition("smsBody"),
  z.discriminatedUnion("op", [
    z.object({ field: z.literal("amount"), op: z.enum(["inflow", "outflow"]) }),
    z.object({ field: z.literal("amount"), op: z.enum(["is", "gt", "lt", "isapprox"]), value: z.number().finite() }),
    z.object({ field: z.literal("amount"), op: z.literal("between"), value: z.tuple([z.number().finite(), z.number().finite()]) }),
  ]),
  z.discriminatedUnion("op", [
    z.object({ field: z.literal("date"), op: z.literal("is"), value: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
    z.object({ field: z.literal("date"), op: z.literal("month"), value: z.number().int().min(1).max(12) }),
    z.object({ field: z.literal("date"), op: z.literal("year"), value: z.number().int().min(1970).max(9999) }),
  ]),
  idCondition("account"),
  idCondition("category"),
  idCondition("payeeId"),
]);

export const ruleTriggerSchema = z.object({
  match: z.enum(["all", "any"]).default("all"),
  // Empty + `all` is an intentional global rule. It remains safe because an
  // action envelope is required and legacy shapes fail structural validation.
  conditions: z.array(ruleConditionSchema),
});

const setNotesValue = z.object({
  mode: z.enum(["replace", "append", "prepend"]),
  text: z.string().min(1).max(2000),
});

export const ruleActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_account"), value: idValue }),
  z.object({ type: z.literal("set_payee"), value: z.string().min(1).max(200) }),
  z.object({ type: z.literal("set_category"), value: idValue }),
  z.object({ type: z.literal("set_notes"), value: setNotesValue }),
]);

export const ruleActionsSchema = z.object({
  actions: z.array(ruleActionSchema).min(1, "a rule needs at least one action"),
});

export type RuleTriggerPayload = z.infer<typeof ruleTriggerSchema>;
export type RuleActionPayload = z.infer<typeof ruleActionsSchema>;
