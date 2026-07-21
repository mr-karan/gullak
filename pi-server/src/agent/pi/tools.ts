import type { AgentTool } from "@earendil-works/pi-agent-core";
import { Type } from "@earendil-works/pi-ai";
import type { TSchema } from "@earendil-works/pi-ai";

import type { Db } from "../../db/index.ts";
import {
  ASK_TOOL_SCHEMAS,
  runAskTool,
  type AskToolName,
  type OpenAiToolSchema,
} from "../ask_tools.ts";
import {
  runWriteTool,
  WRITE_TOOL_SCHEMAS,
  type WriteAction,
  type WriteToolName,
} from "../write_tools.ts";

/// Wraps the existing ask/write tool registries as pi `AgentTool`s. The tool
/// bodies delegate to the SAME runAskTool / runWriteTool functions the legacy
/// engine uses (real synchronous SQL), so behaviour, coercion, and change-log
/// semantics are identical — pi just drives the loop instead of chatTools.

/// Per-request sink for write side effects the engine returns to the UI.
export interface WriteToolCollector {
  actions: WriteAction[];
  lastTool?: string;
}

/// Read-only tools. No mutation; each returns the formatted answer as text.
export function buildAskTools(db: Db): AgentTool[] {
  return ASK_TOOL_SCHEMAS.map((schema): AgentTool => ({
    name: schema.name,
    description: schema.description,
    label: schema.name,
    parameters: toTypeBox(schema),
    execute: async (_id, params) => {
      const args = asRecord(params);
      const result = runAskTool(db, {
        tool: schema.name as AskToolName,
        params: {
          month: toStr(args.month),
          startDate: toStr(args.startDate),
          endDate: toStr(args.endDate),
          accountId: toStr(args.accountId),
          accountName: toStr(args.accountName),
          categoryId: toStr(args.categoryId),
          categoryName: toStr(args.categoryName),
          payee: toStr(args.payee),
          query: toStr(args.query),
          limit: toNum(args.limit),
          goalName: toStr(args.goalName),
          person: toStr(args.person),
          status: toStr(args.status),
          amountCents: toNum(args.amountCents),
          desireName: toStr(args.desireName),
        },
      });
      return { content: [{ type: "text", text: result.formatted }], details: null };
    },
  }));
}

/// Write tools. On success each pushes its structured WriteAction (result card +
/// Undo) into the collector so the engine can return it, and records the tool
/// name. Only the four model-facing write tools are offered — the server-only
/// restore_* undo tools are deliberately not exposed.
export function buildWriteTools(db: Db, collector: WriteToolCollector): AgentTool[] {
  return WRITE_TOOL_SCHEMAS.map((schema): AgentTool => ({
    name: schema.name,
    description: schema.description,
    label: schema.name,
    parameters: toTypeBox(schema),
    execute: async (_id, params) => {
      const args = asRecord(params);
      const result = runWriteTool(db, {
        tool: schema.name as WriteToolName,
        params: {
          transactionIds: toStrArray(args.transactionIds),
          id: toStr(args.id),
          categoryId: args.categoryId === null ? null : toStr(args.categoryId),
          categoryName: toStr(args.categoryName),
          amountCents: toNum(args.amountCents),
          payeeName: toStr(args.payeeName),
          date: toStr(args.date),
          notes: toStr(args.notes),
          accountId: toStr(args.accountId),
          accountName: toStr(args.accountName),
          isIncome: typeof args.isIncome === "boolean" ? args.isIncome : undefined,
        },
      });
      if (result.action) collector.actions.push(result.action);
      collector.lastTool = schema.name;
      return { content: [{ type: "text", text: result.formatted }], details: null };
    },
  }));
}

// ── JSON-schema → TypeBox ────────────────────────────────────────────────────

/// Convert an OpenAI-style tool schema into a TypeBox object, preserving property
/// names, types, and descriptions. Every property is optional (as today: the
/// legacy loop coerces missing/extra args leniently rather than hard-validating).
function toTypeBox(schema: OpenAiToolSchema): TSchema {
  const properties =
    (schema.parameters as { properties?: Record<string, Record<string, unknown>> })
      .properties ?? {};
  const props: Record<string, TSchema> = {};
  for (const [name, def] of Object.entries(properties)) {
    props[name] = Type.Optional(jsonToType(def));
  }
  return Type.Object(props);
}

function jsonToType(def: Record<string, unknown>): TSchema {
  const opts =
    typeof def.description === "string" ? { description: def.description } : {};
  const t = def.type;
  if (Array.isArray(t)) {
    // e.g. ["string", "null"] → a nullable string.
    const members = t.map((x) =>
      x === "null" ? Type.Null() : primitive(String(x)),
    );
    return Type.Union(members, opts);
  }
  if (t === "array") {
    const items = (def.items as Record<string, unknown> | undefined) ?? {
      type: "string",
    };
    return Type.Array(primitive(String(items.type ?? "string")), opts);
  }
  return primitive(String(t), opts);
}

function primitive(t: string, opts: Record<string, unknown> = {}): TSchema {
  switch (t) {
    case "integer":
    case "number":
      return Type.Number(opts);
    case "boolean":
      return Type.Boolean(opts);
    case "string":
    default:
      return Type.String(opts);
  }
}

// ── arg coercion (mirrors agent.ts's runAskToolCall/runWriteToolCall) ─────────

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function toStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t.length === 0 ? undefined : t;
}

function toNum(v: unknown): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return v;
}

function toStrArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.filter(
    (x): x is string => typeof x === "string" && x.trim().length > 0,
  );
  return out.length > 0 ? out : undefined;
}
