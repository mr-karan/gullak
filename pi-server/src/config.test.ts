import { afterEach, beforeEach, expect, test } from "vitest";

import { loadConfig, summarizeConfig } from "./config.ts";

// loadConfig reads process.env; snapshot and restore the keys we touch so tests
// don't leak into each other.
const KEYS = [
  "GULLAK_PORT",
  "GULLAK_HOST",
  "GULLAK_HTTP_API_KEY",
  "GULLAK_REQUIRE_AUTH",
  "GULLAK_SHEETS_WEBAPP_URL",
  "GULLAK_SHEETS_SECRET",
  "GULLAK_SHEETS_SYNC_INTERVAL_MIN",
  "GULLAK_ALLOW_AMBIENT_MODEL_KEYS",
  "GULLAK_MODEL_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
];
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});
afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

test("defaults load without any env", () => {
  const c = loadConfig();
  expect(c.port).toBe(8787);
  expect(c.ai.enabled).toBe(false); // no key
  expect(c.sheets.syncIntervalMinutes).toBe(0);
  expect(summarizeConfig(c).auth).toBe("OPEN (no key)");
});

test("a malformed port fails fast", () => {
  process.env.GULLAK_PORT = "not-a-number";
  expect(() => loadConfig()).toThrow(/GULLAK_PORT must be an integer/);
});

test("port out of range fails fast", () => {
  process.env.GULLAK_PORT = "99999";
  expect(() => loadConfig()).toThrow(/port/);
});

test("requireAuth without a key refuses to start", () => {
  process.env.GULLAK_REQUIRE_AUTH = "true";
  expect(() => loadConfig()).toThrow(/refusing to start an unauthenticated/);
  process.env.GULLAK_HTTP_API_KEY = "k";
  expect(() => loadConfig()).not.toThrow();
});

test("ambient model keys are only read when explicitly allowed", () => {
  process.env.OPENROUTER_API_KEY = "or-key";
  // flag off → ambient key ignored, AI disabled
  expect(loadConfig().ai.enabled).toBe(false);
  // flag on → ambient key used, AI enabled
  process.env.GULLAK_ALLOW_AMBIENT_MODEL_KEYS = "true";
  expect(loadConfig().ai.enabled).toBe(true);
});

test("explicit model key enables AI regardless of ambient flag", () => {
  process.env.GULLAK_MODEL_API_KEY = "explicit";
  expect(loadConfig().ai.enabled).toBe(true);
});

test("sheets enabled only with both url and secret; summary redacts", () => {
  process.env.GULLAK_SHEETS_WEBAPP_URL = "https://x/exec";
  expect(summarizeConfig(loadConfig()).sheets).toEqual({ enabled: false });
  process.env.GULLAK_SHEETS_SECRET = "shh";
  expect(summarizeConfig(loadConfig()).sheets).toEqual({
    enabled: true,
    intervalMin: 0,
  });
});
