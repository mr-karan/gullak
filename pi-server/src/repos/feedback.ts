import { lt } from "drizzle-orm";

import { feedbackEvents } from "../db/schema.ts";
import type { DbOrTx } from "./changelog.ts";

// Diagnostics are transient — keep 30 days so recurring issues are visible
// across a few weeks of use, then let them age out so the table stays bounded.
export const FEEDBACK_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function pruneOldFeedback(db: DbOrTx): void {
  db.delete(feedbackEvents)
    .where(lt(feedbackEvents.createdAt, Date.now() - FEEDBACK_TTL_MS))
    .run();
}

/// Append an append-only diagnostic event (not part of financial sync). Prunes
/// expired rows first so every write keeps the table trimmed to the TTL.
export function recordFeedback(
  db: DbOrTx,
  args: {
    kind: string;
    message?: string | null;
    payload?: unknown;
    clientId?: string | null;
  },
): number {
  pruneOldFeedback(db);
  const inserted = db
    .insert(feedbackEvents)
    .values({
      kind: args.kind,
      message: args.message?.trim() || null,
      clientId: args.clientId?.trim() || null,
      payload: JSON.stringify(args.payload ?? {}),
    })
    .returning({ id: feedbackEvents.id })
    .get();
  console.warn(
    "feedback_event",
    JSON.stringify({ id: inserted.id, kind: args.kind, message: args.message ?? null }),
  );
  return inserted.id;
}

/// Auto-capture a server-side SMS parse failure so it's diagnosable without the
/// user manually tapping "Send feedback". Body is truncated — enough to see the
/// format that tripped the parser, without bloating the row.
export function recordParseFailure(
  db: DbOrTx,
  args: { sender: string; body: string; error: string; operational: boolean },
): void {
  recordFeedback(db, {
    kind: "sms_parse_failure",
    message: args.operational
      ? "LLM/service error — SMS not judged, will retry"
      : "SMS parser produced no candidate for a transactional row",
    payload: {
      auto: true,
      operational: args.operational,
      sender: args.sender,
      body: args.body.slice(0, 300),
      error: args.error,
    },
  });
}
