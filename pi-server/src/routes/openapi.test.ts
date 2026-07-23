import { describe, expect, test } from "vitest";

import { createApp } from "../app.ts";
import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import { buildOpenApiDocument } from "./openapi.ts";

describe("OpenAPI route registry", () => {
  test("normalises Hono parameters, deduplicates routes, and excludes docs internals", () => {
    const document = buildOpenApiDocument(
      [
        { method: "GET", path: "/v1/accounts/" },
        { method: "GET", path: "/v1/accounts/:id" },
        { method: "GET", path: "/v1/accounts/:id" },
        { method: "PATCH", path: "/v1/accounts/:id" },
        { method: "GET", path: "/v1/openapi.json" },
        { method: "GET", path: "/docs" },
        { method: "ALL", path: "/v1/*" },
      ],
      "test",
    );

    expect(document.info.version).toBe("test");
    expect(Object.keys(document.paths)).toEqual(["/v1/accounts", "/v1/accounts/{id}"]);
    const accountRoute = document.paths["/v1/accounts/{id}"];
    expect(accountRoute?.get).toBeDefined();
    expect(accountRoute?.patch).toBeDefined();
    expect(accountRoute?.get?.parameters).toContainEqual(
      expect.objectContaining({ name: "id", in: "path", required: true }),
    );
  });

  test("documents sync replica authentication separately from the server API key", () => {
    const document = buildOpenApiDocument(
      [{ method: "GET", path: "/v1/sync/v2/changes" }],
      "test",
    );
    expect(document.paths["/v1/sync/v2/changes"]?.get?.parameters).toContainEqual(
      expect.objectContaining({ name: "x-sync-actor-token", in: "header", required: true }),
    );
  });

  test("serves the mounted application surface and interactive reference without authentication", async () => {
    const app = createApp({
      db: {} as Db,
      config: {
        version: "integration-test",
        httpApiKey: "secret",
        trustProxy: false,
        ai: { enabled: false },
        rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
        sheets: { syncIntervalMinutes: 0 },
      } as unknown as AppConfig,
    });

    const specResponse = await app.request("/v1/openapi.json");
    expect(specResponse.status).toBe(200);
    const spec = (await specResponse.json()) as ReturnType<typeof buildOpenApiDocument>;
    expect(spec.info.version).toBe("integration-test");
    expect(Object.keys(spec.paths).length).toBeGreaterThan(50);
    expect(spec.paths["/v1/accounts"]?.get).toBeDefined();
    expect(spec.paths["/v1/messages/threads/{threadId}"]?.get).toBeDefined();
    expect(spec.paths["/v1/sync/v2/push"]?.post).toBeDefined();

    const docsResponse = await app.request("/v1/docs");
    expect(docsResponse.status).toBe(200);
    expect(await docsResponse.text()).toContain("/v1/openapi.json");
  });
});
