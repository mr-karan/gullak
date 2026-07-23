import { Hono } from "hono";

import type { AppEnv } from "../app.ts";

export interface RegisteredRoute {
  method: string;
  path: string;
}

interface ParameterSpec {
  name: string;
  in: "path" | "query" | "header";
  required?: boolean;
  description?: string;
  schema: { type: "string" | "integer" | "boolean"; format?: string; minimum?: number; maximum?: number };
}

interface OperationSpec {
  tags: string[];
  summary: string;
  operationId: string;
  parameters?: ParameterSpec[];
  requestBody?: Record<string, unknown>;
  responses: Record<string, unknown>;
  security: Array<Record<string, never[]>>;
}

interface OpenApiDocument {
  openapi: string;
  info: { title: string; version: string; description: string };
  servers: Array<{ url: string; description: string }>;
  tags: Array<{ name: string }>;
  paths: Record<string, Partial<Record<"get" | "post" | "put" | "patch" | "delete", OperationSpec>>>;
  components: Record<string, unknown>;
}

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const PUBLIC_PATHS = new Set(["/v1/health", "/v1/whatsapp/webhook"]);

const SPECIAL_SUMMARIES: Record<string, string> = {
  "GET /v1/health": "Inspect server health and capabilities",
  "POST /v1/accounts/{id}/reconcile": "Reconcile an account to a known balance",
  "GET /v1/budget/plan": "Read the monthly envelope plan",
  "POST /v1/budget/assign": "Assign money to a budget envelope",
  "GET /v1/budget/age-of-money": "Calculate age of money",
  "POST /v1/holdings/import": "Import a broker holdings workbook",
  "POST /v1/transactions/group": "Group related transactions",
  "POST /v1/transactions/ungroup/{parentId}": "Ungroup related transactions",
  "POST /v1/messages/stream": "Stream an assistant response",
  "POST /v1/messages/action": "Apply a reviewed assistant action",
  "POST /v1/messages/threads/delete": "Delete selected assistant conversations",
  "POST /v1/ai/sms/parse": "Parse a bank SMS into a transaction draft",
  "POST /v1/ai/sms/enrich": "Enrich an SMS transaction draft",
  "POST /v1/ai/quick-entry/parse": "Parse text or a receipt into an expense draft",
  "GET /v1/sync/v2/capabilities": "Discover the active sync protocol and epoch",
  "POST /v1/sync/v2/register": "Register a new sync replica",
  "POST /v1/sync/v2/push": "Merge immutable CRDT events",
  "GET /v1/sync/v2/changes": "Pull ordered CRDT events after a cursor",
  "GET /v1/sync/v2/bootstrap": "Fetch a verified checkpoint for a replica",
  "POST /v1/sync/v2/ack": "Acknowledge a cursor and causal frontier",
};

const QUERY_PARAMETERS: Record<string, ParameterSpec[]> = {
  "/v1/transactions": [
    query("startDate", "First transaction date, inclusive.", "string", "date"),
    query("endDate", "Last transaction date, inclusive.", "string", "date"),
    query("accountId", "Limit results to one account."),
    query("limit", "Maximum rows to return, up to 1000.", "integer"),
  ],
  "/v1/summary": [
    query("startDate", "First summary date, inclusive.", "string", "date"),
    query("endDate", "Last summary date, inclusive.", "string", "date"),
    query("accountId", "Limit the summary to one account."),
  ],
  "/v1/calendar": [
    query("startDate", "First calendar date, inclusive.", "string", "date", true),
    query("endDate", "Last calendar date, inclusive.", "string", "date", true),
    query("accountId", "Limit calendar activity to one account."),
  ],
  "/v1/insights/net-worth-history": [query("months", "Number of months, from 1 to 36.", "integer")],
  "/v1/insights/cash-flow": [query("months", "Number of months, from 1 to 36.", "integer")],
  "/v1/insights/top-spends": [
    query("startDate", "First date, inclusive.", "string", "date", true),
    query("endDate", "Last date, inclusive.", "string", "date", true),
    query("accountId", "Limit results to one account."),
    query("limit", "Maximum rows, from 1 to 50.", "integer"),
  ],
  "/v1/insights/new-payees": [
    query("startDate", "First date, inclusive.", "string", "date", true),
    query("endDate", "Last date, inclusive.", "string", "date", true),
  ],
  "/v1/sync/v2/changes": [
    query("epoch", "Active sync epoch.", "string", undefined, true),
    query("actorId", "Registered replica actor id.", "string", undefined, true),
    query("after", "Exclusive transport cursor.", "integer"),
    query("limit", "Maximum events, up to 1000.", "integer"),
  ],
  "/v1/sync/v2/bootstrap": [query("actorId", "Registered replica actor id.", "string", undefined, true)],
};

function query(
  name: string,
  description: string,
  type: "string" | "integer" | "boolean" = "string",
  format?: string,
  required = false,
): ParameterSpec {
  return { name, in: "query", required, description, schema: { type, format } };
}

function normalisePath(path: string): string {
  const trimmed = path.length > 1 ? path.replace(/\/$/, "") : path;
  return trimmed.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function tagFor(path: string): string {
  const segment = path.split("/").filter(Boolean)[1] ?? "system";
  const names: Record<string, string> = {
    ai: "AI drafts",
    budget: "Budget plan",
    budgets: "Budgets",
    "category-groups": "Categories",
    categories: "Categories",
    "net-worth": "Wealth",
    sync: "Sync",
    messages: "Assistant",
    whatsapp: "WhatsApp",
    "whatsapp-inbox-candidates": "WhatsApp",
  };
  return names[segment] ?? humanise(segment);
}

function humanise(value: string): string {
  return value
    .replace(/[{}]/g, "")
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resourceName(path: string): string {
  const segments = path.split("/").filter(Boolean).slice(1);
  const meaningful = segments.filter((segment) => !segment.startsWith("{") && segment !== "v2");
  return humanise(meaningful.at(-1) ?? "resource").toLowerCase();
}

function summaryFor(method: string, path: string): string {
  const special = SPECIAL_SUMMARIES[`${method} ${path}`];
  if (special) return special;
  const name = resourceName(path);
  const isItem = /\{[^}]+\}$/.test(path);
  if (method === "GET") return isItem ? `Get ${name}` : `List ${name}`;
  if (method === "POST") return `Create or run ${name}`;
  if (method === "PUT") return `Replace ${name}`;
  if (method === "PATCH") return `Update ${name}`;
  return `Delete ${name}`;
}

function operationId(method: string, path: string): string {
  const suffix = path
    .replace(/^\/v1\/?/, "")
    .replace(/[{}]/g, "")
    .split(/[\/-]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
  return method.toLowerCase() + suffix;
}

function pathParameters(path: string): ParameterSpec[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => {
    const name = match[1] ?? "id";
    return {
      name,
      in: "path",
      required: true,
      description: `The ${humanise(name).toLowerCase()}.`,
      schema: { type: "string" },
    };
  });
}

function requestBody(method: string, path: string) {
  if (!new Set(["POST", "PUT", "PATCH"]).has(method)) return undefined;
  if (path === "/v1/holdings/import" || path.includes("/photos")) {
    return {
      required: true,
      content: {
        "multipart/form-data": {
          schema: { type: "object", additionalProperties: true },
        },
      },
    };
  }
  return {
    required: true,
    content: {
      "application/json": {
        schema: { type: "object", additionalProperties: true },
      },
    },
  };
}

function responsesFor(method: string) {
  if (method === "DELETE") {
    return {
      "204": { description: "Deleted" },
      "400": { $ref: "#/components/responses/BadRequest" },
      "401": { $ref: "#/components/responses/Unauthorized" },
      "404": { $ref: "#/components/responses/NotFound" },
    };
  }
  return {
    "200": { description: "Success", content: { "application/json": { schema: {} } } },
    ...(method === "POST" ? { "201": { description: "Created", content: { "application/json": { schema: {} } } } } : {}),
    "400": { $ref: "#/components/responses/BadRequest" },
    "401": { $ref: "#/components/responses/Unauthorized" },
    "404": { $ref: "#/components/responses/NotFound" },
    "409": { description: "Conflict", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
    "500": { description: "Internal server error", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
  };
}

export function buildOpenApiDocument(routes: RegisteredRoute[], version: string): OpenApiDocument {
  const paths: OpenApiDocument["paths"] = {};
  const seen = new Set<string>();

  for (const route of routes) {
    const method = route.method.toUpperCase();
    if (!METHODS.has(method) || !route.path.startsWith("/v1/")) continue;
    const path = normalisePath(route.path);
    if (path === "/v1/openapi.json" || path === "/v1/docs" || path.includes("*")) continue;
    const key = `${method} ${path}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const parameters = [...pathParameters(path), ...(QUERY_PARAMETERS[path] ?? [])];
    if (path.startsWith("/v1/sync/v2/") && path !== "/v1/sync/v2/capabilities" && path !== "/v1/sync/v2/register") {
      parameters.push({
        name: "x-sync-actor-token",
        in: "header",
        required: true,
        description: "Replica credential returned once by the register endpoint.",
        schema: { type: "string" },
      });
    }

    const body = requestBody(method, path);
    paths[path] ??= {};
    const operationMethod = method.toLowerCase() as "get" | "post" | "put" | "patch" | "delete";
    paths[path][operationMethod] = {
      tags: [tagFor(path)],
      summary: summaryFor(method, path),
      operationId: operationId(method, path),
      ...(parameters.length ? { parameters } : {}),
      ...(body ? { requestBody: body } : {}),
      responses: responsesFor(method),
      security: PUBLIC_PATHS.has(path) ? [] : [{ ApiKeyAuth: [] }],
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Gullak API",
      version,
      description:
        "The self-hosted API used by Gullak's phone, web application, optional AI features, and causal CRDT sync replicas. Money is always integer minor units.",
    },
    servers: [{ url: "/", description: "This Gullak server" }],
    tags: [...new Set(Object.values(paths).flatMap((path) => Object.values(path).flatMap((operation) => operation?.tags ?? [])))]
      .sort()
      .map((name) => ({ name })),
    paths,
    components: {
      securitySchemes: {
        ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
      },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: { type: "string" },
            issues: { type: "array", items: { type: "object", additionalProperties: true } },
          },
        },
      },
      responses: {
        BadRequest: { description: "Invalid request", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        Unauthorized: { description: "Missing or invalid API key", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
        NotFound: { description: "Resource not found", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
      },
    },
  };
}

export function createOpenApiRouter(getRoutes: () => RegisteredRoute[], version: string) {
  const router = new Hono<AppEnv>();
  router.get("/openapi.json", (c) => c.json(buildOpenApiDocument(getRoutes(), version)));
  router.get("/docs", (c) => c.html(apiReferenceHtml()));
  return router;
}

function apiReferenceHtml(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="description" content="Browsable reference for the Gullak self-hosted API." />
    <title>Gullak API reference</title>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.63.0/dist/style.css" />
  </head>
  <body>
    <script id="api-reference" data-url="/v1/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference@1.63.0/dist/browser/standalone.js"></script>
  </body>
</html>`;
}
