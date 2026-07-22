// Rules engine — action application.
//
// Actions mutate a transaction-like object. `applyActions` is PURE: it returns
// a new object and never mutates its input, so the engine can thread the txn
// through a list of rules without aliasing surprises. Unknown action types are
// ignored (pass-through) rather than throwing.

import type { TxnLike } from "./conditions.ts";

export type NotesMode = "replace" | "append" | "prepend";

export interface SetNotesValue {
  mode: NotesMode;
  text: string;
}

export interface Action {
  type: string;
  value?: unknown;
}

/** The JSON stored in the `rules.action_payload` text column. */
export interface ActionPayload {
  actions: Action[];
}

function applyNotes(existing: string | null | undefined, value: unknown): string | null {
  if (typeof value !== "object" || value === null) return existing ?? null;
  const { mode, text } = value as Partial<SetNotesValue>;
  if (typeof text !== "string") return existing ?? null;
  const cur = existing ?? "";
  switch (mode) {
    case "replace":
      return text;
    // Newline-separate only when there's existing text, so an append/prepend
    // onto empty notes produces just the new text (no stray leading newline).
    case "append":
      return cur ? `${cur}\n${text}` : text;
    case "prepend":
      return cur ? `${text}\n${cur}` : text;
    default:
      return existing ?? null;
  }
}

/** Apply a rule's actions to a txn, returning a new object. */
export function applyActions(actionPayload: ActionPayload, txn: TxnLike): TxnLike {
  const actions = Array.isArray(actionPayload?.actions) ? actionPayload.actions : [];
  let next: TxnLike = { ...txn };
  for (const action of actions) {
    if (!action || typeof action.type !== "string") continue;
    switch (action.type) {
      case "set_account":
        if (typeof action.value === "string") next = { ...next, accountId: action.value };
        break;
      case "set_payee":
        if (typeof action.value === "string") next = { ...next, payeeName: action.value };
        break;
      case "set_category":
        if (typeof action.value === "string") next = { ...next, categoryId: action.value };
        break;
      case "set_notes":
        next = { ...next, notes: applyNotes(next.notes, action.value) };
        break;
      default:
        // Unknown action type — ignore, keep the txn unchanged.
        break;
    }
  }
  return next;
}
