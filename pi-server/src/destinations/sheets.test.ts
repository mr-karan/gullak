import { afterEach, expect, test, vi } from "vitest";

import type { AppConfig } from "../config.ts";
import { SheetsDestination } from "./sheets.ts";
import type { CanonicalExpense } from "./types.ts";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const cfg = (over: Partial<AppConfig["sheets"]> = {}): AppConfig =>
  ({
    sheets: {
      webAppUrl: "https://example.com/exec",
      secret: "s3cr3t",
      syncIntervalMinutes: 0,
      ...over,
    },
  }) as AppConfig;

const row = (o: Partial<CanonicalExpense> = {}): CanonicalExpense => ({
  date: "2026-06-30",
  description: "Blinkit",
  category: "Groceries",
  amountMinor: 45000,
  isOutflow: true,
  accountKind: "credit_card",
  notes: null,
  tags: [],
  sourceId: "txn-1",
  ...o,
});

test("isEnabled requires both url and secret", () => {
  expect(new SheetsDestination(cfg()).isEnabled()).toBe(true);
  expect(new SheetsDestination({ sheets: {} } as AppConfig).isEnabled()).toBe(
    false,
  );
});

test("maps canonical rows to sheet columns and POSTs with secret + replace", async () => {
  let body: { secret: string; replace: boolean; rows: unknown[][] } | null =
    null;
  globalThis.fetch = vi.fn(async (_url: string, init: { body: string }) => {
    body = JSON.parse(init.body);
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;

  const res = await new SheetsDestination(cfg()).export(
    [
      row(),
      // unknown category → blank Category/Type (pushed, never dropped); cash mode; tagged
      row({
        category: null,
        description: "Mystery",
        accountKind: "cash",
        tags: ["Ladakh Trip"],
        sourceId: "txn-2",
      }),
    ],
    { replace: true },
  );

  expect(res.sent).toBe(2);
  expect(body!.secret).toBe("s3cr3t");
  expect(body!.replace).toBe(true);
  // [Date, Description, Category, Amount, Payment Mode, Type, Notes, chavanni_id, Tags]
  expect(body!.rows[0]).toEqual([
    "2026-06-30",
    "Blinkit",
    "Groceries",
    450,
    "Credit Card",
    "Need",
    "",
    "txn-1",
    "",
  ]);
  expect(body!.rows[1]).toEqual([
    "2026-06-30",
    "Mystery",
    "",
    450,
    "Cash",
    "",
    "",
    "txn-2",
    "Ladakh Trip",
  ]);
});

test("throws on an {error} body even when HTTP 200 (Apps Script soft-fail)", async () => {
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ error: "bad secret" }), { status: 200 }),
  ) as unknown as typeof fetch;
  await expect(
    new SheetsDestination(cfg()).export([row()], { replace: false }),
  ).rejects.toThrow(/bad secret/);
});

test("throws on a non-ok HTTP status", async () => {
  globalThis.fetch = vi.fn(
    async () => new Response("nope", { status: 500 }),
  ) as unknown as typeof fetch;
  await expect(
    new SheetsDestination(cfg()).export([row()], { replace: false }),
  ).rejects.toThrow(/500/);
});
