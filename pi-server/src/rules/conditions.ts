// Rules engine — condition evaluation.
//
// A rule's trigger is a set of typed conditions over a transaction-like object.
// Conditions are pure and total: they NEVER throw. A malformed value or an
// unknown op is treated as "no match" so a single bad rule can't wedge the
// engine or crash the ingest path. Money is integer minor units throughout;
// dates are "YYYY-MM-DD" text.

/** The subset of a transaction the engine reads and writes. Callers pass a
    partial — SMS drafts, for instance, have no accountId yet. */
export interface TxnLike {
  accountId?: string | null;
  categoryId?: string | null;
  payeeId?: string | null;
  payeeName?: string | null;
  amountCents?: number | null;
  date?: string | null;
  notes?: string | null;
  smsBody?: string | null;
}

export type MatchMode = "all" | "any";
export type Stage = "pre" | "main" | "post";

export interface Condition {
  field: string;
  op: string;
  value?: unknown;
}

/** The JSON stored in the `rules.trigger_payload` text column. Stage/priority
    ordering metadata are first-class columns; this envelope holds only the
    match mode and the conditions. */
export interface TriggerPayload {
  match?: MatchMode;
  conditions: Condition[];
}

// ── helpers ────────────────────────────────────────────────────────────────

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null;
}

// ── per-field evaluators ─────────────────────────────────────────────────────

function evalPayee(op: string, value: unknown, txn: TxnLike): boolean {
  // Case-insensitive throughout. A null payee is treated as the empty string
  // so `isNot`/`matches` stay well-defined instead of silently short-circuiting.
  const name = (txn.payeeName ?? "").toLowerCase();
  switch (op) {
    case "is": {
      const v = asString(value);
      return v !== null && name === v.toLowerCase();
    }
    case "isNot": {
      const v = asString(value);
      return v === null || name !== v.toLowerCase();
    }
    case "contains": {
      const v = asString(value);
      return v !== null && name.includes(v.toLowerCase());
    }
    case "oneOf": {
      const arr = asArray(value);
      if (!arr) return false;
      return arr.some((x) => {
        const s = asString(x);
        return s !== null && name === s.toLowerCase();
      });
    }
    case "matches": {
      const v = asString(value);
      if (v === null) return false;
      // Invalid regex must never throw — treat it as no-match.
      try {
        return new RegExp(v, "i").test(txn.payeeName ?? "");
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

function evalText(op: string, value: unknown, actual: string | null | undefined): boolean {
  const text = actual ?? "";
  const lower = text.toLowerCase();
  switch (op) {
    case "is":
      return typeof value === "string" && lower === value.toLowerCase();
    case "isNot":
      return typeof value === "string" && lower !== value.toLowerCase();
    case "contains":
      return typeof value === "string" && lower.includes(value.toLowerCase());
    case "oneOf":
      return Array.isArray(value) && value.some((item) => typeof item === "string" && lower === item.toLowerCase());
    case "matches":
      if (typeof value !== "string") return false;
      try {
        return new RegExp(value, "i").test(text);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function evalAmount(op: string, value: unknown, txn: TxnLike): boolean {
  const amt = asNumber(txn.amountCents);
  if (amt === null) return false;
  switch (op) {
    case "inflow":
      return amt > 0;
    case "outflow":
      return amt < 0;
    case "is": {
      const v = asNumber(value);
      return v !== null && amt === v;
    }
    case "gt": {
      const v = asNumber(value);
      return v !== null && amt > v;
    }
    case "lt": {
      const v = asNumber(value);
      return v !== null && amt < v;
    }
    case "isapprox": {
      // Within ±7.5% of the target magnitude (boundary inclusive).
      const v = asNumber(value);
      if (v === null) return false;
      const tolerance = Math.abs(v) * 0.075;
      return Math.abs(amt - v) <= tolerance;
    }
    case "between": {
      const arr = asArray(value);
      if (!arr || arr.length < 2) return false;
      const lo = asNumber(arr[0]);
      const hi = asNumber(arr[1]);
      if (lo === null || hi === null) return false;
      return amt >= lo && amt <= hi;
    }
    default:
      return false;
  }
}

function evalDate(op: string, value: unknown, txn: TxnLike): boolean {
  const date = asString(txn.date);
  if (date === null || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  switch (op) {
    case "is": {
      const v = asString(value);
      return v !== null && date === v;
    }
    case "month": {
      const v = asNumber(value);
      return v !== null && Number(date.slice(5, 7)) === v;
    }
    case "year": {
      const v = asNumber(value);
      return v !== null && Number(date.slice(0, 4)) === v;
    }
    default:
      return false;
  }
}

// account / category / payeeId are id fields: exact (case-sensitive) match.
function evalId(field: string, op: string, value: unknown, txn: TxnLike): boolean {
  const actual =
    field === "account"
      ? txn.accountId
      : field === "category"
        ? txn.categoryId
        : txn.payeeId;
  if (actual == null) return false;
  switch (op) {
    case "is": {
      const v = asString(value);
      return v !== null && actual === v;
    }
    case "oneOf": {
      const arr = asArray(value);
      if (!arr) return false;
      return arr.some((x) => asString(x) === actual);
    }
    default:
      return false;
  }
}

/** Evaluate a single condition. Total and side-effect free; never throws. */
export function evalCondition(cond: Condition, txn: TxnLike): boolean {
  if (!cond || typeof cond.field !== "string" || typeof cond.op !== "string") {
    return false;
  }
  switch (cond.field) {
    case "payee":
      return evalPayee(cond.op, cond.value, txn);
    case "smsBody":
      return evalText(cond.op, cond.value, txn.smsBody);
    case "amount":
      return evalAmount(cond.op, cond.value, txn);
    case "date":
      return evalDate(cond.op, cond.value, txn);
    case "account":
    case "category":
    case "payeeId":
      return evalId(cond.field, cond.op, cond.value, txn);
    default:
      return false;
  }
}

/** Evaluate a trigger payload against a txn. `match=all` (default) requires
    every condition; `match=any` requires at least one. An empty condition list
    matches (vacuously true) under "all" and does not match under "any". */
export function matchesConditions(trigger: TriggerPayload, txn: TxnLike): boolean {
  const conditions = Array.isArray(trigger?.conditions) ? trigger.conditions : [];
  if (trigger?.match === "any") {
    return conditions.some((c) => evalCondition(c, txn));
  }
  return conditions.every((c) => evalCondition(c, txn));
}
