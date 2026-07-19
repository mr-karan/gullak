import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import ExcelJS from "exceljs";
import { expect, test } from "vitest";

import { createApp } from "../app.ts";
import type { AppConfig } from "../config.ts";
import * as schema from "../db/schema.ts";

function makeApp() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const config = {
    dataDir: "/tmp/gullak-test-unused",
    sheets: { syncIntervalMinutes: 0 },
    ai: { enabled: false },
    rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
  } as unknown as AppConfig;
  return { app: createApp({ db, config }), db };
}

const HEADERS = [
  "Symbol",
  "ISIN",
  "Sector",
  "Instrument Type",
  "Quantity Available",
  "Quantity Discrepant",
  "Quantity Long Term",
  "Quantity Pledged (Margin)",
  "Quantity Pledged (Loan)",
  "Average Price",
  "Previous Closing Price",
  "Unrealized P&L",
  "Unrealize P&L Pct.", // real-export typo — matched loosely (we don't use it)
];

type Row = {
  symbol: string;
  isin: string;
  sector: string;
  type: string;
  avail: number;
  pledgeMargin: number;
  pledgeLoan: number;
  avg: number;
  prevClose: number;
};

/// Build a workbook shaped like the Kite/Coin export: Equity + Mutual Funds
/// decoy sheets, and a Combined sheet with ~22 preamble rows, a Summary block,
/// then the table header (found by scanning for "ISIN") and data rows.
async function buildWorkbook(rows: Row[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Equity").addRow(["decoy"]);
  wb.addWorksheet("Mutual Funds").addRow(["decoy"]);
  const ws = wb.addWorksheet("Combined");
  // Preamble junk: Client ID + Summary block, ~22 rows before the header.
  ws.addRow(["Holdings"]);
  ws.addRow(["Client ID", "ZV3952"]);
  ws.addRow(["Summary"]);
  ws.addRow(["Invested", 999999]);
  ws.addRow(["Present Value", 1234567]);
  for (let i = 0; i < 17; i++) ws.addRow([]); // pad to ~row 22
  ws.addRow(HEADERS); // header lands around row 23
  for (const r of rows) {
    ws.addRow([
      r.symbol,
      r.isin,
      r.sector,
      r.type,
      r.avail,
      0,
      0,
      r.pledgeMargin,
      r.pledgeLoan,
      r.avg,
      r.prevClose,
      0,
      0,
    ]);
  }
  ws.addRow([]); // trailing spacer row (must be ignored)
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}

const SAMPLE: Row[] = [
  {
    symbol: "TATAPOWER",
    isin: "INE245A01021",
    sector: "Power",
    type: "Equity",
    avail: 100,
    pledgeMargin: 10, // quantity = 100 + 10 + 0 = 110
    pledgeLoan: 0,
    avg: 200,
    prevClose: 250,
  },
  {
    symbol: "RELIANCE",
    isin: "INE002A01018",
    sector: "Energy",
    type: "Equity",
    avail: 5,
    pledgeMargin: 0,
    pledgeLoan: 0,
    avg: 1000,
    prevClose: 1200,
  },
  {
    symbol: "PPFAS",
    isin: "INF879O01027", // INF prefix → mutual_fund
    sector: "",
    type: "Mutual Fund",
    avail: 500.5,
    pledgeMargin: 0,
    pledgeLoan: 0,
    avg: 50,
    prevClose: 55,
  },
];

async function importFile(app: ReturnType<typeof makeApp>["app"], rows: Row[]) {
  const buf = await buildWorkbook(rows);
  const fd = new FormData();
  fd.append(
    "file",
    new File([buf], "holdings.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  return app.request("/v1/holdings/import", { method: "POST", body: fd });
}

test("schema round-trip: a holding row persists and reads back", () => {
  const { db } = makeApp();
  const now = Date.now();
  db.insert(schema.holdings)
    .values({
      id: "h1",
      isin: "INE245A01021",
      symbol: "TATAPOWER",
      kind: "equity",
      quantity: 110,
      avgPrice: 200,
      lastPrice: 250,
      investedCents: 2_200_000,
      currentCents: 2_750_000,
      importedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
  const row = db
    .select()
    .from(schema.holdings)
    .where(eq(schema.holdings.isin, "INE245A01021"))
    .get();
  expect(row?.currentCents).toBe(2_750_000);
  expect(row?.stale).toBe(false);
  expect(row?.goalId).toBeNull();
});

test("import parses the Combined sheet by scanning for the ISIN header", async () => {
  const { app, db } = makeApp();
  const res = await importFile(app, SAMPLE);
  expect(res.status).toBe(200);
  const body = (await res.json()) as { updated: number; added: number; missing: unknown[] };
  expect(body.added).toBe(3);
  expect(body.updated).toBe(0);
  expect(body.missing).toHaveLength(0);

  const tata = db
    .select()
    .from(schema.holdings)
    .where(eq(schema.holdings.isin, "INE245A01021"))
    .get();
  // quantity = available(100) + pledged margin(10) + pledged loan(0) = 110
  expect(tata?.quantity).toBe(110);
  expect(tata?.kind).toBe("equity");
  expect(tata?.sector).toBe("Power");
  expect(tata?.investedCents).toBe(110 * 200 * 100);
  expect(tata?.currentCents).toBe(110 * 250 * 100);

  const mf = db
    .select()
    .from(schema.holdings)
    .where(eq(schema.holdings.isin, "INF879O01027"))
    .get();
  expect(mf?.kind).toBe("mutual_fund"); // INF prefix
  expect(mf?.sector).toBeNull(); // MF rows carry no sector
  expect(mf?.investedCents).toBe(Math.round(500.5 * 50 * 100));
});

test("re-import is idempotent except importedAt (no dupes, counts as updated)", async () => {
  const { app, db } = makeApp();
  await importFile(app, SAMPLE);
  const res = await importFile(app, SAMPLE);
  const body = (await res.json()) as { updated: number; added: number };
  expect(body.added).toBe(0);
  expect(body.updated).toBe(3);
  expect(db.select().from(schema.holdings).all()).toHaveLength(3);
});

test("re-import preserves a holding's goal mapping", async () => {
  const { app, db } = makeApp();
  await importFile(app, SAMPLE);
  const now = Date.now();
  db.insert(schema.goals)
    .values({ id: "g1", name: "Retire early", targetCents: 100, createdAt: now, updatedAt: now })
    .run();
  const tata = db
    .select()
    .from(schema.holdings)
    .where(eq(schema.holdings.isin, "INE245A01021"))
    .get()!;
  db.update(schema.holdings)
    .set({ goalId: "g1" })
    .where(eq(schema.holdings.id, tata.id))
    .run();

  await importFile(app, SAMPLE); // re-import must not clobber goalId
  const after = db
    .select()
    .from(schema.holdings)
    .where(eq(schema.holdings.id, tata.id))
    .get();
  expect(after?.goalId).toBe("g1");
});

test("a holding absent from a later import is marked stale and reported missing", async () => {
  const { app, db } = makeApp();
  await importFile(app, SAMPLE);
  // Second file drops RELIANCE.
  const res = await importFile(app, [SAMPLE[0]!, SAMPLE[2]!]);
  const body = (await res.json()) as { missing: { isin: string; symbol: string }[] };
  expect(body.missing).toEqual([{ isin: "INE002A01018", symbol: "RELIANCE" }]);
  const reliance = db
    .select()
    .from(schema.holdings)
    .where(eq(schema.holdings.isin, "INE002A01018"))
    .get();
  expect(reliance?.stale).toBe(true);

  // Reappearing clears the stale flag.
  await importFile(app, SAMPLE);
  const back = db
    .select()
    .from(schema.holdings)
    .where(eq(schema.holdings.isin, "INE002A01018"))
    .get();
  expect(back?.stale).toBe(false);
});

test("GET /v1/holdings summary counts non-stale rows only", async () => {
  const { app } = makeApp();
  await importFile(app, SAMPLE);
  await importFile(app, [SAMPLE[0]!, SAMPLE[2]!]); // RELIANCE now stale
  const res = await app.request("/v1/holdings");
  const body = (await res.json()) as {
    holdings: unknown[];
    summary: { count: number; investedCents: number; currentCents: number; pnlCents: number };
  };
  expect(body.holdings).toHaveLength(3); // stale row still listed
  expect(body.summary.count).toBe(2); // but excluded from summary
  // TATAPOWER + PPFAS current value.
  const expected = 110 * 250 * 100 + Math.round(500.5 * 55 * 100);
  expect(body.summary.currentCents).toBe(expected);
  expect(body.summary.pnlCents).toBe(
    body.summary.currentCents - body.summary.investedCents,
  );
});

test("PATCH /v1/holdings/:id rejects a non-existent goalId", async () => {
  const { app, db } = makeApp();
  await importFile(app, SAMPLE);
  const h = db.select().from(schema.holdings).all()[0]!;
  const bad = await app.request(`/v1/holdings/${h.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ goalId: "nope" }),
  });
  expect(bad.status).toBe(400);

  const ok = await app.request(`/v1/holdings/${h.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "My Tata bet" }),
  });
  expect(ok.status).toBe(200);
  expect(((await ok.json()) as { holding: { name: string } }).holding.name).toBe(
    "My Tata bet",
  );
});

test("import never writes a change_log row (holdings are server-only)", async () => {
  const { app, db } = makeApp();
  await importFile(app, SAMPLE);
  expect(db.select().from(schema.changeLog).all()).toHaveLength(0);
});

test("GET /v1/net-worth blends cash and non-stale holdings", async () => {
  const { app, db } = makeApp();
  const now = Date.now();
  db.insert(schema.accounts)
    .values({ id: "a1", name: "HDFC", openingBalanceCents: 100_00, createdAt: now, updatedAt: now })
    .run();
  db.insert(schema.transactions)
    .values({ id: "t1", accountId: "a1", amountCents: 50_00, date: "2026-06-01", createdAt: now, updatedAt: now })
    .run();
  await importFile(app, SAMPLE);
  await importFile(app, [SAMPLE[0]!, SAMPLE[2]!]); // RELIANCE stale — excluded

  const res = await app.request("/v1/net-worth");
  const nw = (await res.json()) as {
    cashCents: number;
    investedCurrentCents: number;
    totalCents: number;
  };
  expect(nw.cashCents).toBe(150_00); // 100 opening + 50 activity
  const invested = 110 * 250 * 100 + Math.round(500.5 * 55 * 100);
  expect(nw.investedCurrentCents).toBe(invested);
  expect(nw.totalCents).toBe(150_00 + invested);
});

test("an import with zero valid rows is rejected and mutates nothing", async () => {
  const { app } = makeApp();
  await importFile(app, [
    { symbol: "TATA", isin: "INE155A01022", sector: "AUTO", type: "-",
      avail: 10, pledgeMargin: 0, pledgeLoan: 0, avg: 400, prevClose: 450 },
  ]);
  // Header-only file (structurally valid, no usable rows) must 400 and leave
  // the existing holding untouched — not zero it or mark it stale.
  const emptyBuf = await buildWorkbook([]);
  const form = new FormData();
  form.append("file", new File([new Uint8Array(emptyBuf)], "h.xlsx"));
  const res = await app.request("/v1/holdings/import", { method: "POST", body: form });
  expect(res.status).toBe(400);
  const list = (await (await app.request("/v1/holdings")).json()) as { holdings: { isin: string; stale: boolean; quantity: number; currentCents: number; investedCents: number }[] };
  expect(list.holdings).toHaveLength(1);
  expect(list.holdings[0]!.stale).toBe(false);
  expect(list.holdings[0]!.quantity).toBe(10);
});

test("rows with unparseable/zero quantity or price are skipped, not zeroed", async () => {
  const { app } = makeApp();
  await importFile(app, [
    { symbol: "TATA", isin: "INE155A01022", sector: "AUTO", type: "-",
      avail: 10, pledgeMargin: 0, pledgeLoan: 0, avg: 400, prevClose: 450 },
  ]);
  // Same ISIN again but with garbage numerics (0 qty / 0 price): the row must
  // be skipped, so the holding keeps its real numbers (it DOES go stale, since
  // no valid row for it appeared — that's honest, not destructive).
  await importFile(app, [
    { symbol: "TATA", isin: "INE155A01022", sector: "AUTO", type: "-",
      avail: 0, pledgeMargin: 0, pledgeLoan: 0, avg: 0, prevClose: 0 },
    { symbol: "OK", isin: "INE002A01018", sector: "ENERGY", type: "-",
      avail: 5, pledgeMargin: 0, pledgeLoan: 0, avg: 100, prevClose: 120 },
  ]);
  const list = (await (await app.request("/v1/holdings")).json()) as { holdings: { isin: string; stale: boolean; quantity: number; currentCents: number; investedCents: number }[] };
  const tata = list.holdings.find((h) => h.isin === "INE155A01022")!;
  expect(tata.quantity).toBe(10);
  expect(tata.currentCents).toBe(450 * 10 * 100);
});

test("duplicate ISIN rows in one file merge quantities with weighted avg", async () => {
  const { app } = makeApp();
  await importFile(app, [
    { symbol: "TATA", isin: "INE155A01022", sector: "AUTO", type: "-",
      avail: 10, pledgeMargin: 0, pledgeLoan: 0, avg: 100, prevClose: 200 },
    { symbol: "TATA", isin: "INE155A01022", sector: "AUTO", type: "-",
      avail: 5, pledgeMargin: 0, pledgeLoan: 0, avg: 400, prevClose: 200 },
  ]);
  const list = (await (await app.request("/v1/holdings")).json()) as { holdings: { isin: string; stale: boolean; quantity: number; currentCents: number; investedCents: number }[] };
  expect(list.holdings).toHaveLength(1);
  const h = list.holdings[0]!;
  expect(h.quantity).toBe(15);
  // Weighted avg: (100*10 + 400*5) / 15 = 200 → invested 15*200*100.
  expect(h.investedCents).toBe(15 * 200 * 100);
});

test("net worth excludes split children (no double counting)", async () => {
  const { app, db } = makeApp();
  const at = Date.now();
  db.insert(schema.accounts).values({
    id: "acc1", name: "HDFC", kind: "checking", openingBalanceCents: 0,
    onBudget: true, archived: false, sortOrder: 0, createdAt: at, updatedAt: at,
  }).run();
  const base = {
    accountId: "acc1", categoryId: null, payeeId: null, payeeName: null,
    date: "2026-07-01", notes: null, latitude: null, longitude: null,
    locationName: null, cleared: false, origin: "manual", originRef: null,
    transferAccountId: null, transferGroupId: null, splitTotalCents: null,
    createdAt: at, updatedAt: at,
  };
  db.insert(schema.transactions).values([
    { ...base, id: "t-parent", amountCents: -10000, parentId: null },
    { ...base, id: "t-child1", amountCents: -6000, parentId: "t-parent" },
    { ...base, id: "t-child2", amountCents: -4000, parentId: "t-parent" },
  ]).run();
  const nw = (await (await app.request("/v1/net-worth")).json()) as {
    cashCents: number;
  };
  expect(nw.cashCents).toBe(-10000);
});
