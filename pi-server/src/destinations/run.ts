import type { AppConfig } from "../config.ts";
import type { Db } from "../db/index.ts";
import { sheetsEnabled, syncExpensesToSheet } from "../sheets/sync.ts";

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

  // "actual" is wired in when the Actual Budget adapter ships (task 48).

  return results;
}
