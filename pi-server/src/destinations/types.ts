import type { AppConfig } from "../config.ts";

/**
 * The neutral, destination-agnostic shape of one exportable expense. The sync
 * server builds these from transactions once; each {@link Destination} maps a
 * CanonicalExpense onto its own schema/taxonomy (sheet columns, Actual Budget
 * transactions, …). Keeping this layer dumb and target-free is what lets new
 * destinations be added without touching the collection/query code.
 */
export interface CanonicalExpense {
  /** YYYY-MM-DD (local). */
  date: string;
  /** Human-readable merchant/description; bank-alert boilerplate already stripped. */
  description: string;
  /**
   * Raw Chavanni category name, or null when uncategorised. Destinations map this
   * onto their own categories. Nothing is dropped here — an unknown/null
   * category is passed through (a destination decides how to surface it), never
   * silently swallowed.
   */
  category: string | null;
  /** Positive magnitude in minor units (paise). Direction is in {@link isOutflow}. */
  amountMinor: number;
  /** True for spend. (Only debits are collected today.) */
  isOutflow: boolean;
  /** Chavanni account kind ("credit_card" | "cash" | "checking" | …). */
  accountKind: string | null;
  /** A real, human-written note, or null. */
  notes: string | null;
  /** Tag names attached to the transaction. */
  tags: string[];
  /**
   * Chavanni transaction id — the stable idempotency key every destination
   * upserts on (the sheet's hidden chavanni_id column, Actual's imported_id, …),
   * so re-exporting a row updates rather than duplicates it.
   */
  sourceId: string;
}

export interface DestinationExportResult {
  /** Rows accepted by the target. */
  sent: number;
  /** Rows the target itself declined (target-specific; structural skips happen upstream). */
  skipped: number;
}

/**
 * A write-only export target the sync server mirrors expenses into — Google
 * Sheets, Actual Budget, and so on. Each is opt-in: {@link isEnabled} gates it
 * on its own config, and a destination that isn't configured is simply never
 * called. Construct with the {@link AppConfig} so the instance carries its own
 * settings.
 */
export interface Destination {
  /** Stable identifier, also the cursor/state key: "sheets" | "actual". */
  readonly name: string;
  /** True when this destination is configured and should run. */
  isEnabled(): boolean;
  /**
   * Push the given rows. `replace: true` is a full re-export (the target should
   * clear and rewrite). Must throw on failure so the caller leaves the cursor
   * unadvanced and records the error — never silently lose rows.
   */
  export(
    rows: CanonicalExpense[],
    opts: { replace: boolean },
  ): Promise<DestinationExportResult>;
}

export type DestinationFactory = (config: AppConfig) => Destination;
