import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

import { and, desc, eq, gt, lte, sql } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { z } from "zod";

import type { AppEnv } from "../app.ts";
import type { ChangeEnvelope } from "../sync/crdt.ts";
import {
  syncChanges,
  syncCheckpoints,
  syncClients,
  changeLog,
  syncFrontiers,
  syncLegacyClients,
  syncLocalClocks,
  syncQuarantine,
} from "../db/schema.ts";
import type { ApplyChangeResult } from "../sync/store.ts";
import { applySyncChange } from "../sync/store.ts";
import {
  ProjectionValidationError,
  isSyncedResource,
  legacySnapshotForEntity,
  materializeChangeTargets,
} from "../sync/resources.ts";
import {
  SyncEpochConfigurationError,
  configuredWritableEpoch,
} from "../sync/epoch.ts";
import { observeLegacyClient } from "../sync/legacy.ts";

export const syncV2Router = new Hono<AppEnv>();

const actorIdSchema = z.string().trim().min(1).max(128);
const clientSchema = z.object({
  actorId: actorIdSchema,
  appVersion: z.string().trim().min(1).max(128).optional(),
  platform: z.string().trim().min(1).max(64).optional(),
});

const registerSchema = clientSchema.extend({
  legacyClientId: z.string().trim().min(1).max(128).optional(),
});

const pushSchema = clientSchema.extend({
  epoch: z.string().min(1),
  changes: z.array(z.unknown()).min(1).max(200),
});

const ackSchema = clientSchema.extend({
  epoch: z.string().min(1),
  cursor: z.number().int().nonnegative(),
  frontier: z.record(z.string(), z.number().int().nonnegative()),
  checkpointId: z.string().min(1).optional(),
});

const legacyDrainSchema = clientSchema.extend({
  epoch: z.string().min(1),
  legacyClientId: z.string().trim().min(1).max(128),
  v1Cursor: z.number().int().nonnegative(),
  pendingOutboxCount: z.literal(0),
});

type WireResult =
  | ApplyChangeResult
  | {
      status: "rejected";
      code: "actor_mismatch" | "projection_invalid" | "constraint_violation";
      reason: string;
      transportCursor: null;
      conflicts: [];
    };

syncV2Router.use("*", async (c, next) => {
  const mode = c.get("config").syncV2Mode;
  if (mode === "disabled") {
    return c.json(
      {
        error: "sync_v2_not_active",
        mode,
      },
      409,
    );
  }
  try {
    configuredWritableEpoch(c.get("db"), mode);
  } catch (error) {
    if (!(error instanceof SyncEpochConfigurationError)) throw error;
    return c.json(
      {
        error: "sync_v2_rollout_misconfigured",
        mode,
        reason: error.message,
      },
      503,
    );
  }
  return next();
});

/**
 * Claims a never-before-seen actor id. The credential is returned exactly
 * once: losing it requires a new actor id, never an authentication bypass or
 * server-side token recovery.
 */
syncV2Router.post("/register", async (c) => {
  const db = c.get("db");
  const body = registerSchema.parse(await c.req.json());
  const activeEpoch = routeEpochId(c);

  const existing = db
    .select({ status: syncClients.status })
    .from(syncClients)
    .where(eq(syncClients.actorId, body.actorId))
    .get();
  if (existing !== undefined) {
    if (existing.status === "retired") {
      return c.json({ error: "actor_retired" }, 410);
    }
    return c.json({ error: "actor_already_registered" }, 409);
  }
  const reserved =
    db
      .select({ actorId: syncLocalClocks.actorId })
      .from(syncLocalClocks)
      .where(eq(syncLocalClocks.actorId, body.actorId))
      .get() !== undefined ||
    db
      .select({ actorId: syncFrontiers.actorId })
      .from(syncFrontiers)
      .where(eq(syncFrontiers.actorId, body.actorId))
      .get() !== undefined ||
    db
      .select({ actorId: syncChanges.actorId })
      .from(syncChanges)
      .where(eq(syncChanges.actorId, body.actorId))
      .get() !== undefined;
  if (reserved) {
    return c.json({ error: "actor_id_reserved" }, 409);
  }
  if (body.legacyClientId !== undefined) {
    const observed = observeLegacyClient(db, body.legacyClientId);
    if (!observed.accepted) {
      return c.json({ error: "legacy_inventory_sealed" }, 409);
    }
    const legacy = db
      .select()
      .from(syncLegacyClients)
      .where(eq(syncLegacyClients.clientId, body.legacyClientId))
      .get();
    if (
      legacy?.migratedActorId !== null &&
      legacy?.migratedActorId !== undefined &&
      legacy.migratedActorId !== body.actorId
    ) {
      return c.json({ error: "legacy_client_already_migrated" }, 409);
    }
  }

  const actorToken = randomBytes(32).toString("base64url");
  const now = Date.now();
  db.insert(syncClients)
    .values({
      actorId: body.actorId,
      actorTokenHash: hashActorToken(actorToken),
      protocolVersion: 2,
      epoch: activeEpoch,
      status: "active",
      appVersion: body.appVersion,
      platform: body.platform,
      acknowledgedCursor: 0,
      acknowledgedFrontierJson: "{}",
      lastSeenAt: now,
      activatedAt: now,
    })
    .run();
  console.info(
    JSON.stringify({
      event: "sync_v2_actor_registered",
      epoch: activeEpoch,
      actorId: body.actorId,
      appVersion: body.appVersion,
      platform: body.platform,
    }),
  );
  return c.json(
    {
      protocol: 2,
      epoch: activeEpoch,
      actorId: body.actorId,
      actorToken,
    },
    201,
  );
});

syncV2Router.post("/legacy-drain", async (c) => {
  const db = c.get("db");
  const body = legacyDrainSchema.parse(await c.req.json());
  const auth = authenticateClient(
    db,
    body.actorId,
    c.req.header("x-sync-actor-token"),
  );
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);
  const activeEpoch = routeEpochId(c);
  if (body.epoch !== activeEpoch) {
    return c.json(
      { error: "reset_required", activeEpoch, receivedEpoch: body.epoch },
      409,
    );
  }
  const legacy = db
    .select()
    .from(syncLegacyClients)
    .where(eq(syncLegacyClients.clientId, body.legacyClientId))
    .get();
  if (
    legacy === undefined ||
    (legacy.migratedActorId !== null &&
      legacy.migratedActorId !== body.actorId)
  ) {
    return c.json({ error: "legacy_client_actor_mismatch" }, 409);
  }
  if (legacy.status === "retired") {
    return c.json({ error: "legacy_client_retired" }, 410);
  }
  const head =
    db
      .select({ cursor: sql<number>`coalesce(max(${changeLog.id}), 0)` })
      .from(changeLog)
      .get()?.cursor ?? 0;
  if (body.v1Cursor !== head || legacy.lastPullCursor !== head) {
    return c.json(
      {
        error: "legacy_head_mismatch",
        expected: head,
        received: body.v1Cursor,
        observedPullCursor: legacy.lastPullCursor,
      },
      409,
    );
  }
  const now = Date.now();
  db.update(syncLegacyClients)
    .set({
      status: "drained",
      migratedActorId: body.actorId,
      drainedV1Head: head,
      drainedAt: now,
      lastSeenAt: now,
    })
    .where(eq(syncLegacyClients.clientId, body.legacyClientId))
    .run();
  console.info(
    JSON.stringify({
      event: "sync_v1_client_drained",
      epoch: activeEpoch,
      legacyClientId: body.legacyClientId,
      actorId: body.actorId,
      v1Head: head,
    }),
  );
  return c.json({ drained: true, legacyClientId: body.legacyClientId, head });
});

syncV2Router.post("/push", async (c) => {
  const db = c.get("db");
  const body = pushSchema.parse(await c.req.json());
  const auth = authenticateClient(
    db,
    body.actorId,
    c.req.header("x-sync-actor-token"),
  );
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);
  const activeEpoch = routeEpochId(c);
  if (body.epoch !== activeEpoch) {
    return c.json(
      { error: "reset_required", activeEpoch, receivedEpoch: body.epoch },
      409,
    );
  }

  touchClient(db, body, activeEpoch);
  const results: Array<{ changeId: string | null; result: WireResult }> = [];
  let accepted = 0;
  let duplicates = 0;
  let retryable = 0;
  let rejected = 0;

  for (const raw of body.changes) {
    const identity = partialIdentity(raw);
    auditWallClockSkew(raw, activeEpoch, body.actorId, identity.changeId);
    let result: WireResult;
    if (identity.actorId !== null && identity.actorId !== body.actorId) {
      result = {
        status: "rejected",
        code: "actor_mismatch",
        reason: `envelope actor ${identity.actorId} does not match authenticated batch actor ${body.actorId}`,
        transportCursor: null,
        conflicts: [],
      };
    } else {
      try {
        result = db.transaction((tx) => {
          const applied = applySyncChange(tx, raw, {
            source: `client:${body.actorId}`,
          });
          if (applied.status === "accepted") {
            const envelope = raw as ChangeEnvelope;
            materializeChangeTargets(tx, envelope.epoch, envelope.ops, {
              protectReconciled: true,
              ops: envelope.ops,
            });
            if (c.get("config").syncV2Mode === "preparing") {
              bridgeAcceptedChangeToV1(tx, envelope);
            }
          }
          return applied;
        });
      } catch (error) {
        if (
          !(error instanceof ProjectionValidationError) &&
          !isSqliteConstraintError(error)
        ) {
          throw error;
        }
        const reason = safeReason(error);
        result = {
          status: "rejected",
          code:
            error instanceof ProjectionValidationError
              ? "projection_invalid"
              : "constraint_violation",
          reason,
          transportCursor: null,
          conflicts: [],
        };
      }
    }

    if (result.status === "accepted") accepted += 1;
    else if (result.status === "duplicate") duplicates += 1;
    else if (result.status === "gap" || result.status === "dependency_gap") {
      retryable += 1;
    } else {
      rejected += 1;
      quarantine(db, raw, result.code, result.reason, body.actorId);
      console.warn(
        JSON.stringify({
          event: "sync_v2_change_rejected",
          epoch: activeEpoch,
          actorId: body.actorId,
          changeId: identity.changeId,
          code: result.code,
          reason: result.reason,
        }),
      );
    }
    results.push({ changeId: identity.changeId, result });
  }

  const conflicts = results.flatMap(({ changeId, result }) =>
    result.conflicts.map((conflict) => ({
      changeId,
      resource: conflict.resource,
      entityId: conflict.entityId,
      field: conflict.field,
      candidates: conflict.candidateCount,
    })),
  );
  console.info(
    JSON.stringify({
      event: "sync_v2_push",
      epoch: activeEpoch,
      actorId: body.actorId,
      received: body.changes.length,
      accepted,
      duplicates,
      retryable,
      rejected,
      conflicts,
    }),
  );

  return c.json({
    epoch: activeEpoch,
    accepted,
    duplicates,
    retryable,
    rejected,
    results,
  });
});

syncV2Router.get("/changes", (c) => {
  const db = c.get("db");
  const epoch = c.req.query("epoch") ?? "";
  const afterRaw = Number(c.req.query("after") ?? "0");
  const limitRaw = Number(c.req.query("limit") ?? "500");
  const actorId = actorIdSchema.parse(c.req.query("actorId"));
  const auth = authenticateClient(
    db,
    actorId,
    c.req.header("x-sync-actor-token"),
  );
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);
  if (!Number.isSafeInteger(afterRaw) || afterRaw < 0) {
    return c.json({ error: "after must be a non-negative integer" }, 400);
  }
  if (!Number.isSafeInteger(limitRaw) || limitRaw < 1) {
    return c.json({ error: "limit must be a positive integer" }, 400);
  }
  const activeEpoch = routeEpochId(c);
  if (epoch !== activeEpoch) {
    return c.json({ error: "reset_required", activeEpoch }, 409);
  }
  const head =
    db
      .select({
        cursor: sql<number>`coalesce(max(${syncChanges.transportCursor}), 0)`,
      })
      .from(syncChanges)
      .where(eq(syncChanges.epoch, activeEpoch))
      .get()?.cursor ?? 0;
  if (afterRaw > head) {
    return c.json(
      {
        error: "reset_required",
        reason: "cursor_ahead_of_server",
        activeEpoch,
        head,
        received: afterRaw,
      },
      409,
    );
  }
  touchClient(db, { actorId }, activeEpoch);
  const limit = Math.min(limitRaw, 1000);
  const rows = db
    .select({
      cursor: syncChanges.transportCursor,
      envelopeJson: syncChanges.envelopeJson,
      contentHash: syncChanges.contentHash,
    })
    .from(syncChanges)
    .where(
      and(
        eq(syncChanges.epoch, epoch),
        gt(syncChanges.transportCursor, afterRaw),
      ),
    )
    .orderBy(syncChanges.transportCursor)
    .limit(limit + 1)
    .all();
  const page = rows.slice(0, limit);
  const cursor = page.at(-1)?.cursor ?? afterRaw;
  console.info(
    JSON.stringify({
      event: "sync_v2_pull",
      epoch,
      actorId,
      after: afterRaw,
      cursor,
      returned: page.length,
      hasMore: rows.length > limit,
    }),
  );
  return c.json({
    epoch,
    after: afterRaw,
    cursor,
    hasMore: rows.length > limit,
    changes: page.map((row) => ({
      cursor: row.cursor,
      contentHash: row.contentHash,
      envelope: JSON.parse(row.envelopeJson) as unknown,
    })),
  });
});

syncV2Router.get("/bootstrap", (c) => {
  const db = c.get("db");
  const actorId = actorIdSchema.parse(c.req.query("actorId"));
  const auth = authenticateClient(
    db,
    actorId,
    c.req.header("x-sync-actor-token"),
  );
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);
  const activeEpoch = routeEpochId(c);
  const checkpoint = db
    .select()
    .from(syncCheckpoints)
    .where(
      and(
        eq(syncCheckpoints.epoch, activeEpoch),
        sql`${syncCheckpoints.verifiedAt} IS NOT NULL`,
      ),
    )
    .orderBy(desc(syncCheckpoints.creationCursor))
    .limit(1)
    .get();
  if (checkpoint === undefined) {
    return c.json({ error: "checkpoint_unavailable" }, 503);
  }
  touchClient(db, { actorId }, activeEpoch);
  const changesThroughCheckpoint = db
    .select({
      cursor: syncChanges.transportCursor,
      contentHash: syncChanges.contentHash,
      envelopeJson: syncChanges.envelopeJson,
    })
    .from(syncChanges)
    .where(
      and(
        eq(syncChanges.epoch, activeEpoch),
        lte(syncChanges.transportCursor, checkpoint.creationCursor),
      ),
    )
    .orderBy(syncChanges.transportCursor)
    .all();
  const prefixEndsAtCheckpoint =
    changesThroughCheckpoint.at(-1)?.cursor === checkpoint.creationCursor;
  if (
    changesThroughCheckpoint.length !== checkpoint.eventCount ||
    (checkpoint.eventCount === 0
      ? checkpoint.creationCursor !== 0
      : !prefixEndsAtCheckpoint)
  ) {
    console.error(
      JSON.stringify({
        event: "sync_v2_checkpoint_incomplete",
        epoch: activeEpoch,
        checkpointId: checkpoint.id,
        checkpointCursor: checkpoint.creationCursor,
        expectedEvents: checkpoint.eventCount,
        availableEvents: changesThroughCheckpoint.length,
        lastAvailableCursor: changesThroughCheckpoint.at(-1)?.cursor ?? null,
      }),
    );
    return c.json(
      { error: "checkpoint_incomplete", checkpointId: checkpoint.id },
      503,
    );
  }
  return c.json({
    protocol: 2,
    epoch: activeEpoch,
    checkpoint: {
      id: checkpoint.id,
      epoch: checkpoint.epoch,
      schemaVersion: checkpoint.schemaVersion,
      frontier: JSON.parse(checkpoint.frontierJson) as unknown,
      registers: JSON.parse(checkpoint.registersJson) as unknown,
      projectionHash: checkpoint.projectionHash,
      contentHash: checkpoint.contentHash,
      cursor: checkpoint.creationCursor,
      eventCount: checkpoint.eventCount,
      isGenesis: checkpoint.isGenesis,
      createdAt: checkpoint.createdAt,
    },
    changesThroughCheckpoint: changesThroughCheckpoint.map((row) => ({
      cursor: row.cursor,
      contentHash: row.contentHash,
      envelope: JSON.parse(row.envelopeJson) as unknown,
    })),
  });
});

syncV2Router.post("/ack", async (c) => {
  const db = c.get("db");
  const body = ackSchema.parse(await c.req.json());
  const auth = authenticateClient(
    db,
    body.actorId,
    c.req.header("x-sync-actor-token"),
  );
  if (!auth.ok) return c.json({ error: auth.error }, auth.status);
  const activeEpoch = routeEpochId(c);
  if (body.epoch !== activeEpoch) {
    return c.json({ error: "reset_required", activeEpoch }, 409);
  }
  const head =
    db
      .select({
        cursor: sql<number>`coalesce(max(${syncChanges.transportCursor}), 0)`,
      })
      .from(syncChanges)
      .where(eq(syncChanges.epoch, activeEpoch))
      .get()?.cursor ?? 0;
  if (body.cursor > head) {
    return c.json({ error: "cursor_ahead_of_server", head }, 400);
  }
  const existingClient = auth.client;
  if (body.cursor < existingClient.acknowledgedCursor) {
    return c.json(
      {
        error: "cursor_regression",
        acknowledged: existingClient.acknowledgedCursor,
        received: body.cursor,
      },
      409,
    );
  }

  const checkpointId =
    body.checkpointId ?? existingClient.bootstrapCheckpointId ?? undefined;
  let checkpoint:
    | {
        id: string;
        creationCursor: number;
        frontierJson: string;
      }
    | undefined;
  if (checkpointId !== undefined) {
    checkpoint = db
      .select({
        id: syncCheckpoints.id,
        creationCursor: syncCheckpoints.creationCursor,
        frontierJson: syncCheckpoints.frontierJson,
      })
      .from(syncCheckpoints)
      .where(
        and(
          eq(syncCheckpoints.id, checkpointId),
          eq(syncCheckpoints.epoch, activeEpoch),
          sql`${syncCheckpoints.verifiedAt} IS NOT NULL`,
        ),
      )
      .get();
    if (checkpoint === undefined) {
      return c.json({ error: "invalid_checkpoint", checkpointId }, 400);
    }
    if (body.cursor < checkpoint.creationCursor) {
      return c.json(
        {
          error: "cursor_before_checkpoint",
          checkpointId,
          checkpointCursor: checkpoint.creationCursor,
          received: body.cursor,
        },
        400,
      );
    }
    if (
      existingClient.bootstrapCheckpointId !== null &&
      body.checkpointId !== undefined &&
      body.checkpointId !== existingClient.bootstrapCheckpointId
    ) {
      const previous = db
        .select({ creationCursor: syncCheckpoints.creationCursor })
        .from(syncCheckpoints)
        .where(eq(syncCheckpoints.id, existingClient.bootstrapCheckpointId))
        .get();
      if (
        previous !== undefined &&
        checkpoint.creationCursor < previous.creationCursor
      ) {
        return c.json(
          {
            error: "checkpoint_regression",
            checkpointId,
            checkpointCursor: checkpoint.creationCursor,
            acknowledgedCheckpointId: existingClient.bootstrapCheckpointId,
            acknowledgedCheckpointCursor: previous.creationCursor,
          },
          409,
        );
      }
    }
  }

  const expectedFrontier = frontierAtCursor(
    db,
    activeEpoch,
    body.cursor,
    checkpoint,
  );
  const receivedFrontier = normalizeFrontier(body.frontier);
  if (!frontiersEqual(expectedFrontier, receivedFrontier)) {
    return c.json(
      {
        error: "frontier_mismatch",
        cursor: body.cursor,
        expected: expectedFrontier,
        received: receivedFrontier,
      },
      400,
    );
  }

  touchClient(db, body, activeEpoch, {
    cursor: body.cursor,
    frontier: expectedFrontier,
    checkpointId,
  });
  console.info(
    JSON.stringify({
      event: "sync_v2_ack",
      epoch: activeEpoch,
      actorId: body.actorId,
      cursor: body.cursor,
      head,
    }),
  );
  return c.json({
    acknowledged: body.cursor,
    frontier: expectedFrontier,
    head,
  });
});

function routeEpochId(c: Context<AppEnv>): string {
  // The middleware already verified this exact config/database pair.
  const epoch = configuredWritableEpoch(
    c.get("db"),
    c.get("config").syncV2Mode,
  );
  if (epoch === null) throw new Error("sync v2 route reached while disabled");
  return epoch.id;
}

/**
 * During preparation, protocol-v1 clients still consume row snapshots. Emit
 * them from the already-materialized projection in the same transaction as
 * event admission. This inserts change_log directly so the compatibility
 * projection can never recursively author a second semantic v2 event.
 */
function bridgeAcceptedChangeToV1(
  tx: Parameters<Parameters<AppEnv["Variables"]["db"]["transaction"]>[0]>[0],
  envelope: ChangeEnvelope,
): void {
  const targets = new Map<string, { resource: string; entityId: string }>();
  for (const op of envelope.ops) {
    targets.set(`${op.resource}\u0000${op.entityId}`, {
      resource: op.resource,
      entityId: op.entityId,
    });
  }
  for (const target of targets.values()) {
    if (!isSyncedResource(target.resource)) continue;
    const snapshot = legacySnapshotForEntity(
      tx,
      target.resource,
      target.entityId,
    );
    tx.insert(changeLog)
      .values({
        at: Date.now(),
        clientId: null,
        clientChangeId: null,
        resource: target.resource,
        resourceId: target.entityId,
        op: snapshot.op,
        payload:
          snapshot.payload === null ? null : JSON.stringify(snapshot.payload),
      })
      .run();
  }
}

function touchClient(
  db: AppEnv["Variables"]["db"],
  client: { actorId: string; appVersion?: string; platform?: string },
  epoch: string,
  ack?: {
    cursor: number;
    frontier: Record<string, number>;
    checkpointId?: string;
  },
): void {
  const now = Date.now();
  db.update(syncClients)
    .set({
      protocolVersion: 2,
      epoch,
      ...(client.appVersion === undefined
        ? {}
        : { appVersion: client.appVersion }),
      ...(client.platform === undefined ? {} : { platform: client.platform }),
      lastSeenAt: now,
      ...(ack === undefined
        ? {}
        : {
            acknowledgedCursor: ack.cursor,
            acknowledgedFrontierJson: JSON.stringify(ack.frontier),
            bootstrapCheckpointId: ack.checkpointId,
          }),
    })
    .where(
      and(
        eq(syncClients.actorId, client.actorId),
        eq(syncClients.status, "active"),
      ),
    )
    .run();
}

type AuthenticatedClient = typeof syncClients.$inferSelect;

function authenticateClient(
  db: AppEnv["Variables"]["db"],
  actorId: string,
  token: string | undefined,
):
  | { ok: true; client: AuthenticatedClient }
  | {
      ok: false;
      error: "actor_token_required" | "actor_auth_failed" | "actor_retired";
      status: 401 | 410;
    } {
  if (token === undefined || token.length === 0) {
    return { ok: false, error: "actor_token_required", status: 401 };
  }
  // Tokens are 43 base64url characters. A generous cap avoids hashing an
  // attacker-controlled unbounded header while permitting future formats.
  if (token.length > 512) {
    return { ok: false, error: "actor_auth_failed", status: 401 };
  }
  const client = db
    .select()
    .from(syncClients)
    .where(eq(syncClients.actorId, actorId))
    .get();
  const suppliedHash = Buffer.from(hashActorToken(token), "hex");
  const storedHash =
    client !== undefined && /^[0-9a-f]{64}$/u.test(client.actorTokenHash)
      ? Buffer.from(client.actorTokenHash, "hex")
      : Buffer.alloc(32);
  const matches = timingSafeEqual(suppliedHash, storedHash);
  if (client === undefined || !matches) {
    return { ok: false, error: "actor_auth_failed", status: 401 };
  }
  if (client.status === "retired") {
    return { ok: false, error: "actor_retired", status: 410 };
  }
  if (client.status !== "active") {
    return { ok: false, error: "actor_auth_failed", status: 401 };
  }
  return { ok: true, client };
}

function hashActorToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function auditWallClockSkew(
  raw: unknown,
  epoch: string,
  actorId: string,
  changeId: string | null,
): void {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return;
  const wallTimeMs = (raw as Record<string, unknown>).wallTimeMs;
  if (typeof wallTimeMs !== "number" || !Number.isSafeInteger(wallTimeMs)) {
    return;
  }
  const skewMs = wallTimeMs - Date.now();
  if (Math.abs(skewMs) < 24 * 60 * 60 * 1000) return;
  // Audit-only: physical time never participates in CRDT ordering, so even a
  // wildly wrong clock cannot shadow a causal successor.
  console.warn(
    JSON.stringify({
      event: "sync_v2_wall_clock_skew",
      epoch,
      actorId,
      changeId,
      wallTimeMs,
      skewMs,
    }),
  );
}

function frontierAtCursor(
  db: AppEnv["Variables"]["db"],
  epoch: string,
  cursor: number,
  checkpoint: { creationCursor: number; frontierJson: string } | undefined,
): Record<string, number> {
  const frontier =
    checkpoint === undefined ? {} : parseFrontier(checkpoint.frontierJson);
  const after = checkpoint?.creationCursor ?? 0;
  const changes = db
    .select({
      actorId: syncChanges.actorId,
      sequence: syncChanges.sequence,
    })
    .from(syncChanges)
    .where(
      and(
        eq(syncChanges.epoch, epoch),
        gt(syncChanges.transportCursor, after),
        lte(syncChanges.transportCursor, cursor),
      ),
    )
    .orderBy(syncChanges.transportCursor)
    .all();
  for (const change of changes) {
    frontier[change.actorId] = Math.max(
      frontier[change.actorId] ?? 0,
      change.sequence,
    );
  }
  return normalizeFrontier(frontier);
}

function normalizeFrontier(
  frontier: Record<string, number>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(frontier)
      .filter(([, sequence]) => sequence > 0)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function frontiersEqual(
  left: Record<string, number>,
  right: Record<string, number>,
): boolean {
  return JSON.stringify(normalizeFrontier(left)) === JSON.stringify(right);
}

function partialIdentity(value: unknown): {
  changeId: string | null;
  actorId: string | null;
  sequence: number | null;
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { changeId: null, actorId: null, sequence: null };
  }
  const row = value as Record<string, unknown>;
  return {
    changeId: typeof row.changeId === "string" ? row.changeId : null,
    actorId: typeof row.actorId === "string" ? row.actorId : null,
    sequence: Number.isSafeInteger(row.sequence)
      ? (row.sequence as number)
      : null,
  };
}

function quarantine(
  db: AppEnv["Variables"]["db"],
  value: unknown,
  reasonCode: string,
  reason: string,
  sourceActor: string,
): void {
  const original = Buffer.from(JSON.stringify(value));
  const identity = partialIdentity(value);
  db.insert(syncQuarantine)
    .values({
      epoch:
        value !== null &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof (value as Record<string, unknown>).epoch === "string"
          ? ((value as Record<string, unknown>).epoch as string)
          : null,
      changeId: identity.changeId,
      actorId: identity.actorId,
      sequence: identity.sequence,
      source: `client:${sourceActor}`,
      reasonCode,
      reason,
      contentHash: createHash("sha256").update(original).digest("hex"),
      envelopeJson: isJsonObject(value) ? JSON.stringify(value) : null,
      originalBytes: original,
    })
    .run();
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function safeReason(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 500)
    : "unknown failure";
}

function isSqliteConstraintError(
  error: unknown,
): error is Error & { code: string } {
  return (
    error instanceof Error &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string" &&
    (error as { code: string }).code.startsWith("SQLITE_CONSTRAINT")
  );
}

function parseFrontier(value: string): Record<string, number> {
  const parsed = JSON.parse(value) as unknown;
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("stored client frontier is not an object");
  }
  const frontier: Record<string, number> = {};
  for (const [actorId, sequence] of Object.entries(parsed)) {
    if (!Number.isSafeInteger(sequence) || (sequence as number) < 0) {
      throw new Error("stored client frontier is invalid");
    }
    frontier[actorId] = sequence as number;
  }
  return frontier;
}
