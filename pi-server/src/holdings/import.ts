import ExcelJS from "exceljs";

/// Parser for the Zerodha Kite/Coin console holdings XLSX export.
///
/// The file has three sheets (Equity, Mutual Funds, Combined); we parse
/// `Combined` only — it carries both equity and MF rows plus an
/// `Instrument Type` column. Above the table sit ~22 preamble rows (Client ID,
/// a Summary block). We do NOT hardcode the header row: we scan for the first
/// row containing a cell equal to "ISIN" and map columns from there. The last
/// P&L-pct header has a typo in real exports ("Unrealize P&L Pct."), so it is
/// matched loosely — but we don't need that column anyway.

export interface ParsedHolding {
  isin: string;
  symbol: string;
  kind: "equity" | "mutual_fund";
  sector: string | null;
  quantity: number;
  avgPrice: number;
  lastPrice: number;
}

const COMBINED_SHEET = "Combined";

/** Normalize a header cell for comparison: collapse whitespace, lowercase. */
function norm(v: unknown): string {
  return cellText(v).replace(/\s+/g, " ").trim().toLowerCase();
}

/** Best-effort plain text from an exceljs cell value (handles rich text). */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    // Rich text: { richText: [{text}, ...] }
    if (Array.isArray(o.richText)) {
      return o.richText.map((r) => cellText((r as { text?: unknown }).text)).join("");
    }
    if ("text" in o) return cellText(o.text);
    if ("result" in o) return cellText(o.result); // formula cell
  }
  return String(v);
}

/** Numeric value from a cell; blank/garbage → 0. */
function cellNum(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = cellText(v).replace(/,/g, "").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** The ISIN prefix is authoritative: INE… = equity, INF… = mutual fund.
 *  The Combined sheet's "Instrument Type" column is a trap — for MFs it holds
 *  the fund CATEGORY ("Equity - Flexi Cap", "Hybrid - Arbitrage"), so matching
 *  on the word "equity" misclassifies equity-category MFs. Only fall back to
 *  the text when the prefix is neither INE nor INF. */
function kindFrom(instrumentType: string, isin: string): "equity" | "mutual_fund" {
  const prefix = isin.toUpperCase().slice(0, 3);
  if (prefix === "INE") return "equity";
  if (prefix === "INF") return "mutual_fund";
  const t = instrumentType.toLowerCase();
  if (t.includes("mutual") || t.includes("mf") || t.includes("fund")) {
    return "mutual_fund";
  }
  return "equity";
}

export class HoldingsImportError extends Error {}

/**
 * Parse the Combined sheet of a Kite/Coin holdings export.
 * Throws HoldingsImportError on a structurally unusable file.
 */
export async function parseHoldingsWorkbook(
  buffer: Buffer | ArrayBuffer,
): Promise<ParsedHolding[]> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer as ArrayBuffer);
  } catch {
    throw new HoldingsImportError("Could not read the file as an XLSX workbook.");
  }

  const sheet =
    wb.getWorksheet(COMBINED_SHEET) ??
    wb.worksheets.find((w) => norm(w.name) === "combined");
  if (!sheet) {
    throw new HoldingsImportError(
      "No 'Combined' sheet found — export the full holdings from the Kite console.",
    );
  }

  // 1) Find the header row (first row with a cell equal to "ISIN") and map
  //    every header we care about to its 1-based column index.
  let headerRowNumber = -1;
  const cols: Record<string, number> = {};
  sheet.eachRow((row, rowNumber) => {
    if (headerRowNumber !== -1) return;
    let hasIsin = false;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      if (norm(cell.value) === "isin") {
        hasIsin = true;
      }
      void colNumber;
    });
    if (hasIsin) {
      headerRowNumber = rowNumber;
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const key = norm(cell.value);
        if (key) cols[key] = colNumber;
      });
    }
  });

  if (headerRowNumber === -1) {
    throw new HoldingsImportError(
      "Couldn't find the holdings table (no 'ISIN' header) in the Combined sheet.",
    );
  }

  const col = (...names: string[]): number | undefined => {
    for (const n of names) {
      const c = cols[n];
      if (c !== undefined) return c;
    }
    return undefined;
  };

  const isinCol = col("isin");
  const symbolCol = col("symbol");
  const sectorCol = col("sector");
  const typeCol = col("instrument type");
  const availCol = col("quantity available");
  const pledgedMarginCol = col("quantity pledged (margin)", "quantity pledged margin");
  const pledgedLoanCol = col("quantity pledged (loan)", "quantity pledged loan");
  const avgCol = col("average price");
  const lastCol = col("previous closing price", "previous close price", "last price");

  if (isinCol === undefined || symbolCol === undefined) {
    throw new HoldingsImportError(
      "The Combined sheet is missing required Symbol/ISIN columns.",
    );
  }

  // 2) Read data rows below the header. Cap the scan so a crafted workbook
  //    with an enormous declared row count can't pin the CPU (a real export
  //    is < 100 rows).
  const out: ParsedHolding[] = [];
  const byIsin = new Map<string, ParsedHolding>();
  const lastRow = Math.min(sheet.rowCount, headerRowNumber + MAX_DATA_ROWS);
  for (let r = headerRowNumber + 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const isin = cellText(row.getCell(isinCol).value).trim().toUpperCase();
    // ISINs are 12 chars; anything else is a spacer/footer row — skip.
    if (!/^[A-Z0-9]{12}$/.test(isin)) continue;

    const symbol = cellText(row.getCell(symbolCol).value).trim() || isin;
    const instrumentType = typeCol ? cellText(row.getCell(typeCol).value) : "";
    const kind = kindFrom(instrumentType, isin);
    const sectorRaw = sectorCol ? cellText(row.getCell(sectorCol).value).trim() : "";
    const quantity =
      (availCol ? cellNum(row.getCell(availCol).value) : 0) +
      (pledgedMarginCol ? cellNum(row.getCell(pledgedMarginCol).value) : 0) +
      (pledgedLoanCol ? cellNum(row.getCell(pledgedLoanCol).value) : 0);
    const avgPrice = avgCol ? cellNum(row.getCell(avgCol).value) : 0;
    const lastPrice = lastCol ? cellNum(row.getCell(lastCol).value) : 0;

    // Guard the portfolio against malformed rows: a row whose numbers didn't
    // parse degrades to 0s, and upserting that would zero a real holding.
    // Quantity and last price must be positive; average price may be 0 (bonus
    // / corporate-action credits genuinely export that way).
    if (!(quantity > 0) || !(lastPrice > 0) || !(avgPrice >= 0)) continue;

    const dup = byIsin.get(isin);
    if (dup) {
      // Same ISIN twice in one file (e.g. partial lots): merge — total the
      // quantity, weight the average price, keep the shared last price.
      const totalQty = dup.quantity + quantity;
      dup.avgPrice =
        totalQty > 0
          ? (dup.avgPrice * dup.quantity + avgPrice * quantity) / totalQty
          : dup.avgPrice;
      dup.quantity = totalQty;
      continue;
    }

    const parsedRow: ParsedHolding = {
      isin,
      symbol,
      kind,
      sector: kind === "equity" && sectorRaw ? sectorRaw : null,
      quantity,
      avgPrice,
      lastPrice,
    };
    byIsin.set(isin, parsedRow);
    out.push(parsedRow);
  }

  return out;
}

/** Hard cap on data rows scanned below the header (real exports are tiny). */
const MAX_DATA_ROWS = 10_000;

/** round(quantity * price * 100) → integer minor units. The toPrecision(12)
 *  pass absorbs binary float error before rounding: 1 × 1.005 × 100 is
 *  100.49999999999999 in IEEE-754 and would round DOWN without it. */
export function toCents(quantity: number, price: number): number {
  return Math.round(Number((quantity * price * 100).toPrecision(12)));
}
