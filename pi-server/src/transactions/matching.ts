// Import-dedupe / transaction matcher (#38).
//
// A port of Actual's loot-core `matchTransactions` 3-pass algorithm, adapted to
// Gullak's integer-minor-unit money and YYYY-MM-DD dates. Pure functions with no
// db access: callers load a candidate window and hand it to `matchTransactions`
// (single incoming row) or `reconcileTransactions` (a batch, e.g. a CSV import).
//
// The point is to stop double-counting the same spend when it arrives via more
// than one path — an SMS auto-capture, a manual entry, and (future) a statement
// import can all describe one purchase. Matching lets the later arrival ENRICH
// the row that's already there instead of creating a duplicate.

/** A transaction we're trying to place (SMS candidate, CSV row, …). */
export interface MatchInput {
  accountId: string;
  /** Signed integer minor units. Negative = outflow/expense, positive = inflow. */
  amountCents: number;
  /** YYYY-MM-DD. */
  date: string;
  /** Stable per-source id (SMS stableSmsId, CSV FITID). Drives the exact pass. */
  importedId?: string | null;
  payeeName?: string | null;
}

/** An existing row we might claim. Extra fields are ignored by the matcher. */
export interface ExistingTxn {
  id: string;
  accountId: string;
  amountCents: number;
  date: string;
  importedId?: string | null;
  payeeName?: string | null;
}

export type MatchType = "exact" | "fuzzy-amount" | "fuzzy-date";

export interface MatchResult {
  matched: boolean;
  matchType: MatchType | null;
  matchedId: string | null;
}

/** Fuzzy passes only consider existing rows within this many days of the input. */
export const MATCH_WINDOW_DAYS = 7;

const MISS: MatchResult = { matched: false, matchType: null, matchedId: null };

/**
 * Place a single incoming transaction against the existing set.
 *
 * Three passes, in order; the first that claims a row wins:
 *   1. exact       — same account AND equal non-empty importedId.
 *   2. fuzzy-amount— same account, exact amountCents, date within ±window;
 *                    prefer a candidate whose payee also matches, else nearest date.
 *   3. fuzzy-date  — same account, any amount, date within ±window; nearest date.
 *
 * `claimed` is a shared Set of existing ids already taken by an earlier incoming
 * row, so two incoming rows can't both claim the same existing row. Callers that
 * match one row can omit it; `reconcileTransactions` threads one Set through a batch.
 *
 * strictIdChecking: an existing row that already carries a non-empty importedId
 * is NOT eligible for a FUZZY claim — a manual/other entry can't steal a bank
 * row's slot. It can still be claimed by an EXACT importedId match.
 */
export function matchTransactions(
  incoming: MatchInput,
  existing: ExistingTxn[],
  claimed: Set<string> = new Set<string>(),
): MatchResult {
  // Pass 1 — exact importedId. No date window: a stable id is globally unique
  // per source, so proximity is irrelevant.
  const inImp = norm(incoming.importedId);
  if (inImp) {
    for (const e of existing) {
      if (claimed.has(e.id)) continue;
      if (e.accountId !== incoming.accountId) continue;
      if (norm(e.importedId) === inImp) {
        claimed.add(e.id);
        return { matched: true, matchType: "exact", matchedId: e.id };
      }
    }
  }

  // Fuzzy-eligible set: same account, unclaimed, within the date window, and —
  // per strictIdChecking — not already carrying an importedId.
  const eligible = existing.filter(
    (e) =>
      !claimed.has(e.id) &&
      e.accountId === incoming.accountId &&
      norm(e.importedId) === "" &&
      Math.abs(dayDiff(e.date, incoming.date)) <= MATCH_WINDOW_DAYS,
  );
  if (eligible.length === 0) return MISS;

  // Pass 2 — fuzzy amount (exact amountCents). Prefer a payee match; among the
  // chosen pool take the nearest by date.
  const amountMatches = eligible.filter((e) => e.amountCents === incoming.amountCents);
  if (amountMatches.length > 0) {
    const payeeMatches = amountMatches.filter((e) =>
      samePayee(e.payeeName, incoming.payeeName),
    );
    const pool = payeeMatches.length > 0 ? payeeMatches : amountMatches;
    const picked = nearestByDate(pool, incoming.date);
    claimed.add(picked.id);
    return { matched: true, matchType: "fuzzy-amount", matchedId: picked.id };
  }

  // Pass 3 — fuzzy date. No exact-amount candidate remained; take the nearest by
  // date from the in-window set.
  const picked = nearestByDate(eligible, incoming.date);
  claimed.add(picked.id);
  return { matched: true, matchType: "fuzzy-date", matchedId: picked.id };
}

export interface ReconcileResult {
  /** Incoming rows that matched nothing — the importer should create these. */
  added: MatchInput[];
  /** Incoming rows that landed on an existing row — the importer should enrich these. */
  matched: { incoming: MatchInput; matchedId: string }[];
}

/**
 * Reconcile a batch of incoming rows against the existing set, Actual-style.
 * Threads one `claimed` Set through the batch so no existing row is claimed
 * twice. The {added, matched} partition lets a CSV importer or UI report e.g.
 * "12 added, 2 merged". Incoming order is preserved and drives determinism.
 */
export function reconcileTransactions(
  incoming: MatchInput[],
  existing: ExistingTxn[],
): ReconcileResult {
  const claimed = new Set<string>();
  const added: MatchInput[] = [];
  const matched: { incoming: MatchInput; matchedId: string }[] = [];
  for (const inc of incoming) {
    const r = matchTransactions(inc, existing, claimed);
    if (r.matched && r.matchedId) {
      matched.push({ incoming: inc, matchedId: r.matchedId });
    } else {
      added.push(inc);
    }
  }
  return { added, matched };
}

// --- helpers ----------------------------------------------------------------

function norm(v: string | null | undefined): string {
  return v == null ? "" : v.trim();
}

function samePayee(a: string | null | undefined, b: string | null | undefined): boolean {
  const an = norm(a).toLowerCase();
  const bn = norm(b).toLowerCase();
  return an !== "" && an === bn;
}

/** Nearest by absolute day distance to `date`; ties broken by id for determinism. */
function nearestByDate<T extends { id: string; date: string }>(
  rows: T[],
  date: string,
): T {
  return [...rows].sort((a, b) => {
    const da = Math.abs(dayDiff(a.date, date));
    const dbb = Math.abs(dayDiff(b.date, date));
    if (da !== dbb) return da - dbb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0]!;
}

const MS_PER_DAY = 86_400_000;

function toEpochDay(ymd: string): number {
  const [y, m, d] = ymd.split("-").map((n) => Number(n));
  return Math.round(Date.UTC(y!, m! - 1, d!) / MS_PER_DAY);
}

/** Signed day difference a - b between two YYYY-MM-DD strings. */
export function dayDiff(a: string, b: string): number {
  return toEpochDay(a) - toEpochDay(b);
}

/** Shift a YYYY-MM-DD date by n days (n may be negative), returned as YYYY-MM-DD. */
export function shiftYmd(ymd: string, days: number): string {
  const d = new Date(toEpochDay(ymd) * MS_PER_DAY + days * MS_PER_DAY);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
