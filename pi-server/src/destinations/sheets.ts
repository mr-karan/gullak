import type { AppConfig } from "../config.ts";
import { mapCategory, paymentModeForKind } from "../sheets/mapping.ts";
import type {
  CanonicalExpense,
  Destination,
  DestinationExportResult,
} from "./types.ts";

/**
 * Google Sheets export via the sheet's bound Apps Script web app (no service
 * account, no Sheets API). Maps each {@link CanonicalExpense} onto the sheet's
 * columns and POSTs them for the Apps Script to upsert by chavanni_id.
 *
 * Columns: A Date, B Description, C Category, D Amount, E Payment Mode,
 * F Type, G Notes, H chavanni_id (hidden upsert key), I Tags.
 *
 * Opt-in: enabled only when both CHAVANNI_SHEETS_WEBAPP_URL and
 * CHAVANNI_SHEETS_SECRET are set.
 */
export class SheetsDestination implements Destination {
  readonly name = "sheets";

  constructor(private readonly config: AppConfig) {}

  isEnabled(): boolean {
    return Boolean(this.config.sheets.webAppUrl && this.config.sheets.secret);
  }

  async export(
    rows: CanonicalExpense[],
    opts: { replace: boolean },
  ): Promise<DestinationExportResult> {
    const { webAppUrl, secret } = this.config.sheets;
    if (!webAppUrl || !secret) {
      throw new Error(
        "sheets destination not configured (CHAVANNI_SHEETS_WEBAPP_URL + CHAVANNI_SHEETS_SECRET)",
      );
    }

    const out = rows.map((r) => {
      // Each destination maps the raw Chavanni category onto its own taxonomy.
      // null/unknown → blank Category for the user to fill in-sheet (never dropped).
      const mapped = mapCategory(r.category);
      return [
        r.date,
        r.description,
        mapped?.category ?? "",
        // minor units → rupees, preserving paise (298713 → 2987.13)
        Number((r.amountMinor / 100).toFixed(2)),
        paymentModeForKind(r.accountKind),
        mapped?.type ?? "",
        r.notes ?? "",
        r.sourceId,
        r.tags.join(", "),
      ];
    });

    const res = await fetch(webAppUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, rows: out, replace: opts.replace }),
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`sheets POST ${res.status}: ${text}`);
    }
    // Apps Script signals failures (bad secret, missing tab, script throw) with
    // an {error} body on HTTP 200 — a status check alone would treat a rejected
    // payload as success. Inspect the body and fail loudly.
    let parsed: { error?: unknown } | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`sheets POST returned non-JSON: ${text.slice(0, 200)}`);
    }
    if (parsed?.error) {
      throw new Error(`sheets script error: ${String(parsed.error)}`);
    }
    return { sent: out.length, skipped: 0 };
  }
}
