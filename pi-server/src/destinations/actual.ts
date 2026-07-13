import { mkdirSync } from "node:fs";

import type { AppConfig } from "../config.ts";
import type {
  CanonicalExpense,
  Destination,
  DestinationExportResult,
} from "./types.ts";

/**
 * Actual Budget export destination. Pushes expenses into a self-hosted Actual
 * server via the official `@actual-app/api` (init → downloadBudget → import →
 * sync), keyed on `imported_id = sourceId` so re-runs upsert rather than
 * duplicate.
 *
 * `@actual-app/api` is a heavy, optional dependency (it pulls native
 * `better-sqlite3`), so it is NOT a hard dependency of the server — it's
 * imported lazily and only when this destination is actually invoked. To enable
 * Actual: `bun add @actual-app/api` on a runtime that supports better-sqlite3
 * (or run it in a small Node sidecar), then set CHAVANNI_ACTUAL_SERVER_URL /
 * _PASSWORD / _SYNC_ID. See docs/destinations.md (repo root).
 */
/**
 * Only one Actual export may run at a time: `@actual-app/api` downloads the
 * budget into a single on-disk cache dir and syncs from it, so two overlapping
 * runs would race on that SQLite cache. The post-push hook is fire-and-forget,
 * so concurrent pushes are possible — a busy run throws (rather than returning
 * sent:0, which would wrongly advance the cursor), so `runExport` records a
 * failure and the next push retries the still-pending rows.
 */
let exportInFlight = false;

export class ActualDestination implements Destination {
  readonly name = "actual";

  constructor(private readonly config: AppConfig) {}

  isEnabled(): boolean {
    const a = this.config.actual;
    return Boolean(a?.serverUrl && a?.password && a?.syncId);
  }

  async export(
    rows: CanonicalExpense[],
    _opts: { replace: boolean },
  ): Promise<DestinationExportResult> {
    const a = this.config.actual;
    if (!a?.serverUrl || !a?.password || !a?.syncId) {
      throw new Error("actual destination not configured");
    }
    if (exportInFlight) {
      throw new Error("actual export already in progress; retrying next push");
    }

    // Lazy, optional import: a variable specifier keeps tsc from requiring the
    // (heavy, native) package at build time; it's only needed when Actual runs.
    const moduleId = "@actual-app/api";
    let api: any; // eslint-disable-line @typescript-eslint/no-explicit-any
    try {
      api = await import(moduleId);
    } catch {
      throw new Error(
        "Actual export requires @actual-app/api (bun add @actual-app/api) on a runtime that supports better-sqlite3",
      );
    }

    // @actual-app/api scandir's this cache dir on init; create it up front so a
    // fresh deploy (empty volume) doesn't crash with ENOENT.
    mkdirSync(a.dataDir, { recursive: true });

    exportInFlight = true;
    try {
      await api.init({
        dataDir: a.dataDir,
        serverURL: a.serverUrl,
        password: a.password,
      });
      try {
        await api.downloadBudget(a.syncId);

        const accountId =
          a.accountId ?? (await api.getAccounts())?.[0]?.id;
        if (!accountId) {
          throw new Error("no Actual account to import into (set CHAVANNI_ACTUAL_ACCOUNT_ID)");
        }

        // Best-effort category mapping by name; unmatched → uncategorised in Actual.
        const catByName = new Map<string, string>();
        for (const cat of (await api.getCategories()) ?? []) {
          if (cat?.name) catByName.set(String(cat.name).toLowerCase(), cat.id);
        }

        const txns = rows.map((r) => ({
          date: r.date,
          // Actual amounts are integer minor units, negative = outflow.
          amount: r.isOutflow ? -r.amountMinor : r.amountMinor,
          payee_name: r.description,
          notes: r.notes ?? undefined,
          imported_id: r.sourceId, // idempotency key
          category: r.category
            ? catByName.get(r.category.toLowerCase())
            : undefined,
          cleared: true,
        }));

        await api.importTransactions(accountId, txns);
        await api.sync();
        return { sent: txns.length, skipped: 0 };
      } finally {
        await api.shutdown();
      }
    } finally {
      exportInFlight = false;
    }
  }
}
