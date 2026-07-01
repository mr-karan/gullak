import Database from "better-sqlite3";
import { afterEach, expect, test, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

import type { AppConfig } from "../config.ts";
import * as schema from "../db/schema.ts";
import { runExport } from "./run.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function makeDb() {
  const d = drizzle(new Database(":memory:"), { schema });
  migrate(d, { migrationsFolder: "./drizzle" });
  return d;
}

const cfg = (sheets: boolean): AppConfig =>
  ({
    sheets: sheets
      ? { webAppUrl: "https://x/exec", secret: "s", syncIntervalMinutes: 0 }
      : { syncIntervalMinutes: 0 },
  }) as unknown as AppConfig;

test("sheets disabled → reported enabled:false, no network call", async () => {
  let called = false;
  globalThis.fetch = vi.fn(async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const rs = await runExport(makeDb(), cfg(false));
  expect(rs.find((r) => r.destination === "sheets")?.enabled).toBe(false);
  expect(called).toBe(false);
});

test("a debit is collected and POSTed to the sheets destination", async () => {
  const d = makeDb();
  d.insert(schema.transactions)
    .values({
      id: "t1",
      accountId: "a1",
      amountCents: -4500,
      date: "2026-06-30",
      createdAt: 1000,
      updatedAt: 1000,
    })
    .run();
  let posted = false;
  globalThis.fetch = vi.fn(async () => {
    posted = true;
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;
  const rs = await runExport(d, cfg(true), { replace: true });
  const sheets = rs.find((r) => r.destination === "sheets");
  expect(sheets?.enabled).toBe(true);
  expect(sheets?.sent).toBe(1);
  expect(posted).toBe(true);
});

test("target filter runs only the named destination", async () => {
  const rs = await runExport(makeDb(), cfg(false), { target: "actual" });
  expect(rs.some((r) => r.destination === "sheets")).toBe(false);
});
