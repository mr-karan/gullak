import type { Db } from "../db/index.ts";
import { changeLog } from "../db/schema.ts";

export type ChangeOp = "upsert" | "delete";

/// Append-only mutation log so sync clients can pull deltas after a
/// cursor. Every successful write goes through here.
export function recordChange(
  db: Db,
  resource: string,
  resourceId: string,
  op: ChangeOp,
  payload: unknown,
  clientId?: string,
): void {
  db.insert(changeLog)
    .values({
      resource,
      resourceId,
      op,
      payload: payload === undefined ? null : JSON.stringify(payload),
      clientId: clientId ?? null,
    })
    .run();
}

export function nowMs(): number {
  return Date.now();
}

export function newId(): string {
  return crypto.randomUUID();
}
