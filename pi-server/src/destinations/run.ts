import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import { sheetsEnabled, syncExpensesToSheet } from "../sheets/sync.ts";
import { ActualDestination } from "./actual.ts";
import { collectExpenses } from "./collect.ts";
import {
  advanceExportCursor,
  markExportFailure,
  markExportSuccess,
  readExportState,
} from "./state.ts";

export interface ExportRunResult {
  destination: string;
  enabled: boolean;
  total?: number;
  sent?: number;
  skipped?: number;
  cursor?: number;
  error?: string;
}

/** Known destination names, for `?target=` validation. */
export const DESTINATIONS = ["sheets", "actual"] as const;

/**
 * Run the export for every enabled destination (or just `opts.target`). Each
 * destination owns its own durable cursor + failure isolation, so one being
 * down or back-filling never stalls another. Returns a per-destination result;
 * a destination that throws is recorded with `error` rather than failing the
 * whole run.
 *
 * `sheets` runs through the proven {@link syncExpensesToSheet} path (which owns
 * `sheets_sync_state`). `actual` plugs in here once its adapter ships
 * (per-destination state lives in the `export_state` table).
 */
export async function runExport(
  db: Db,
  config: AppConfig,
  opts: { target?: string; replace?: boolean } = {},
): Promise<ExportRunResult[]> {
  const replace = opts.replace === true;
  const wants = (name: string) => !opts.target || opts.target === name;
  const results: ExportRunResult[] = [];

  if (wants("sheets")) {
    if (!sheetsEnabled(config)) {
      results.push({ destination: "sheets", enabled: false });
    } else {
      try {
        const r = await syncExpensesToSheet(db, config, { replace });
        results.push({ destination: "sheets", enabled: true, ...r });
      } catch (e) {
        results.push({
          destination: "sheets",
          enabled: true,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  if (wants("actual")) {
    const dest = new ActualDestination(config);
    if (!dest.isEnabled()) {
      results.push({ destination: "actual", enabled: false });
    } else {
      const state = readExportState(db, "actual");
      const since = replace ? 0 : state.cursor;
      const { rows, scanned, maxUpdatedAt } = collectExpenses(
        db,
        since,
        state.cursor,
      );
      if (rows.length === 0 && !replace) {
        if (scanned > 0 && maxUpdatedAt > state.cursor) {
          advanceExportCursor(db, "actual", maxUpdatedAt);
        }
        results.push({
          destination: "actual",
          enabled: true,
          total: scanned,
          sent: 0,
          skipped: scanned,
          cursor: maxUpdatedAt,
        });
      } else {
        const attemptAt = Date.now();
        try {
          const { sent } = await dest.export(rows, { replace });
          markExportSuccess(db, "actual", maxUpdatedAt, attemptAt);
          results.push({
            destination: "actual",
            enabled: true,
            total: scanned,
            sent,
            skipped: scanned - sent,
            cursor: maxUpdatedAt,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          markExportFailure(db, "actual", attemptAt, message);
          results.push({
            destination: "actual",
            enabled: true,
            total: scanned,
            sent: 0,
            skipped: scanned,
            cursor: state.cursor,
            error: message,
          });
        }
      }
    }
  }

  return results;
}
