import { and, desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";

import type { AppConfig } from "../config.ts";
import type { AppEnv } from "../app.ts";
import { PROFILE_IDS } from "../config.ts";
import { desireComments, desirePhotos, desires } from "../db/schema.ts";
import { newId, nowMs } from "../repos/changelog.ts";

// Desires are server-only: NO recordChange (see M5 epic). `person` is
// attribution, validated against the hard profile enum. Photo bytes live on
// the mounted data volume; the DB stores only a relative path. photoIds are
// server-generated uuids and we NEVER build filesystem paths from client
// strings — that's what keeps the serve/delete endpoints traversal-safe.

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS_PER_DESIRE = 6;
const STATUSES = ["dreaming", "yes", "nah", "bought"] as const;
const DECIDED_STATUSES = new Set(["yes", "nah", "bought"]);

const CONTENT_TYPE_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** Magic-byte check: do the actual bytes match the declared image MIME? */
function sniffedTypeMatches(bytes: Buffer, declared: string): boolean {
  if (declared === "image/jpeg") {
    return bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (declared === "image/png") {
    return (
      bytes.length > 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
    );
  }
  if (declared === "image/webp") {
    return (
      bytes.length > 12 &&
      bytes.toString("ascii", 0, 4) === "RIFF" &&
      bytes.toString("ascii", 8, 12) === "WEBP"
    );
  }
  return false;
}

const personEnum = z.enum(PROFILE_IDS);

export const desiresRouter = new Hono<AppEnv>();

function uploadsRoot(config: AppConfig): string {
  return resolve(config.dataDir, "uploads", "desires");
}

function relPhotoPath(desireId: string, photoId: string, ext: string): string {
  return join("uploads", "desires", desireId, `${photoId}.${ext}`);
}

function photoIdsFor(db: AppEnv["Variables"]["db"], desireId: string): string[] {
  return db
    .select({ id: desirePhotos.id })
    .from(desirePhotos)
    .where(eq(desirePhotos.desireId, desireId))
    .orderBy(desirePhotos.createdAt)
    .all()
    .map((r) => r.id);
}

function serializeDesire(d: typeof desires.$inferSelect, extra: { photoIds: string[]; commentCount: number }) {
  return {
    id: d.id,
    person: d.person,
    title: d.title,
    estCostCents: d.estCostCents,
    why: d.why,
    status: d.status,
    decidedAt: d.decidedAt,
    boughtTransactionId: d.boughtTransactionId,
    photoIds: extra.photoIds,
    commentCount: extra.commentCount,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

// ── List / detail ─────────────────────────────────────────────────────────

const listQuery = z.object({
  person: personEnum.optional(),
  status: z.enum(STATUSES).optional(),
});

desiresRouter.get("/", (c) => {
  const db = c.get("db");
  const q = listQuery.parse(
    Object.fromEntries(new URL(c.req.url).searchParams),
  );
  const conditions = [];
  if (q.person) conditions.push(eq(desires.person, q.person));
  if (q.status) conditions.push(eq(desires.status, q.status));
  const rows = db
    .select()
    .from(desires)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(desires.createdAt))
    .all();

  const out = rows.map((d) => {
    const commentCount =
      db
        .select({ count: sql<number>`COUNT(*)` })
        .from(desireComments)
        .where(eq(desireComments.desireId, d.id))
        .get()?.count ?? 0;
    return serializeDesire(d, { photoIds: photoIdsFor(db, d.id), commentCount });
  });
  return c.json({ desires: out });
});

desiresRouter.get("/:id", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const d = db.select().from(desires).where(eq(desires.id, id)).get();
  if (!d) return c.json({ error: "Not found" }, 404);
  const photos = db
    .select({ id: desirePhotos.id, createdAt: desirePhotos.createdAt })
    .from(desirePhotos)
    .where(eq(desirePhotos.desireId, id))
    .orderBy(desirePhotos.createdAt)
    .all();
  const comments = db
    .select({
      id: desireComments.id,
      person: desireComments.person,
      body: desireComments.body,
      createdAt: desireComments.createdAt,
    })
    .from(desireComments)
    .where(eq(desireComments.desireId, id))
    .orderBy(desireComments.createdAt)
    .all();
  return c.json({
    desire: serializeDesire(d, {
      photoIds: photos.map((p) => p.id),
      commentCount: comments.length,
    }),
    photos,
    comments,
  });
});

// ── Create / update / delete ───────────────────────────────────────────────

const createSchema = z.object({
  person: personEnum,
  title: z.string().min(1).max(200),
  estCostCents: z.number().int(),
  why: z.string().max(2000).nullish(),
});

desiresRouter.post("/", async (c) => {
  const db = c.get("db");
  const body = createSchema.parse(await c.req.json());
  const id = newId();
  const at = nowMs();
  const row = {
    id,
    person: body.person,
    title: body.title,
    estCostCents: body.estCostCents,
    why: body.why ?? null,
    status: "dreaming",
    decidedAt: null,
    boughtTransactionId: null,
    createdAt: at,
    updatedAt: at,
  };
  db.insert(desires).values(row).run();
  return c.json(
    { desire: serializeDesire(row, { photoIds: [], commentCount: 0 }) },
    201,
  );
});

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  why: z.string().max(2000).nullish(),
  estCostCents: z.number().int().optional(),
  status: z.enum(STATUSES).optional(),
  boughtTransactionId: z.string().max(200).nullish(),
});

desiresRouter.patch("/:id", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const body = patchSchema.parse(await c.req.json());
  const existing = db.select().from(desires).where(eq(desires.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const next = { ...existing, updatedAt: nowMs() };
  if (body.title !== undefined) next.title = body.title;
  if (body.why !== undefined) next.why = body.why ?? null;
  if (body.estCostCents !== undefined) next.estCostCents = body.estCostCents;
  if (body.boughtTransactionId !== undefined) {
    next.boughtTransactionId = body.boughtTransactionId ?? null;
  }
  if (body.status !== undefined) {
    next.status = body.status;
    // Moving into a decided state stamps decidedAt (first time); moving back to
    // 'dreaming' clears it — life happens, and pace math shouldn't lie.
    if (DECIDED_STATUSES.has(body.status)) {
      next.decidedAt = existing.decidedAt ?? nowMs();
    } else {
      next.decidedAt = null;
    }
  }
  db.update(desires).set(next).where(eq(desires.id, id)).run();
  const photoIds = photoIdsFor(db, id);
  const commentCount =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(desireComments)
      .where(eq(desireComments.desireId, id))
      .get()?.count ?? 0;
  return c.json({ desire: serializeDesire(next, { photoIds, commentCount }) });
});

desiresRouter.delete("/:id", (c) => {
  const db = c.get("db");
  const config = c.get("config");
  const id = c.req.param("id");
  const existing = db.select().from(desires).where(eq(desires.id, id)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  db.transaction((tx) => {
    tx.delete(desirePhotos).where(eq(desirePhotos.desireId, id)).run();
    tx.delete(desireComments).where(eq(desireComments.desireId, id)).run();
    tx.delete(desires).where(eq(desires.id, id)).run();
  });
  // Remove the whole per-desire photo directory from disk.
  const dir = join(uploadsRoot(config), id);
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  return c.body(null, 204);
});

// ── Photos ──────────────────────────────────────────────────────────────────

desiresRouter.post("/:id/photos", async (c) => {
  const db = c.get("db");
  const config = c.get("config");
  const id = c.req.param("id");
  const desire = db.select().from(desires).where(eq(desires.id, id)).get();
  if (!desire) return c.json({ error: "Not found" }, 404);

  const count =
    db
      .select({ count: sql<number>`COUNT(*)` })
      .from(desirePhotos)
      .where(eq(desirePhotos.desireId, id))
      .get()?.count ?? 0;
  if (count >= MAX_PHOTOS_PER_DESIRE) {
    return c.json(
      { error: `Photo limit reached (max ${MAX_PHOTOS_PER_DESIRE}).` },
      409,
    );
  }

  const form = await c.req.parseBody();
  const file = form["file"];
  if (!(file instanceof File)) {
    return c.json({ error: "Expected a multipart 'file' field." }, 400);
  }
  const ext = CONTENT_TYPE_EXT[file.type];
  if (!ext) {
    return c.json({ error: "Unsupported image type (use jpeg, png, or webp)." }, 415);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.byteLength > MAX_PHOTO_BYTES) {
    return c.json({ error: "Image too large (max 5 MB)." }, 413);
  }
  // Verify the bytes actually ARE the declared image type: the client-sent
  // MIME string is attacker-controlled, and we serve these bytes back under
  // that content-type later (an HTML payload labelled image/png must die here).
  if (!sniffedTypeMatches(bytes, file.type)) {
    return c.json({ error: "File content does not match its image type." }, 415);
  }
  // The multipart read above is async: re-confirm the desire still exists so a
  // concurrent DELETE can't be resurrected as an orphan photo row + directory.
  if (!db.select().from(desires).where(eq(desires.id, id)).get()) {
    return c.json({ error: "Not found" }, 404);
  }

  const photoId = newId();
  const rel = relPhotoPath(id, photoId, ext);
  const abs = resolve(config.dataDir, rel);
  mkdirSync(join(uploadsRoot(config), id), { recursive: true });
  writeFileSync(abs, bytes);

  const at = nowMs();
  db.insert(desirePhotos)
    .values({ id: photoId, desireId: id, path: rel, contentType: file.type, createdAt: at })
    .run();
  return c.json({ id: photoId }, 201);
});

desiresRouter.get("/:id/photos/:photoId", (c) => {
  const db = c.get("db");
  const config = c.get("config");
  const id = c.req.param("id");
  const photoId = c.req.param("photoId");
  // Resolve by row, not by client path — traversal-safe by construction.
  const row = db
    .select()
    .from(desirePhotos)
    .where(and(eq(desirePhotos.id, photoId), eq(desirePhotos.desireId, id)))
    .get();
  if (!row) return c.json({ error: "Not found" }, 404);
  const abs = resolve(config.dataDir, row.path);
  if (!existsSync(abs)) return c.json({ error: "Not found" }, 404);
  const bytes = readFileSync(abs);
  return c.body(bytes, 200, { "content-type": row.contentType });
});

desiresRouter.delete("/:id/photos/:photoId", (c) => {
  const db = c.get("db");
  const config = c.get("config");
  const id = c.req.param("id");
  const photoId = c.req.param("photoId");
  const row = db
    .select()
    .from(desirePhotos)
    .where(and(eq(desirePhotos.id, photoId), eq(desirePhotos.desireId, id)))
    .get();
  if (!row) return c.json({ error: "Not found" }, 404);
  db.delete(desirePhotos).where(eq(desirePhotos.id, photoId)).run();
  const abs = resolve(config.dataDir, row.path);
  if (existsSync(abs)) rmSync(abs, { force: true });
  return c.body(null, 204);
});

// ── Comments ─────────────────────────────────────────────────────────────────

const commentSchema = z.object({
  person: personEnum,
  body: z.string().min(1).max(2000),
});

desiresRouter.post("/:id/comments", async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const desire = db.select().from(desires).where(eq(desires.id, id)).get();
  if (!desire) return c.json({ error: "Not found" }, 404);
  const body = commentSchema.parse(await c.req.json());
  const commentId = newId();
  const at = nowMs();
  const row = { id: commentId, desireId: id, person: body.person, body: body.body, createdAt: at };
  db.insert(desireComments).values(row).run();
  return c.json(
    { id: commentId, person: row.person, body: row.body, createdAt: at },
    201,
  );
});

desiresRouter.delete("/:id/comments/:commentId", (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const commentId = c.req.param("commentId");
  const rows = db
    .delete(desireComments)
    .where(and(eq(desireComments.id, commentId), eq(desireComments.desireId, id)))
    .returning()
    .all();
  if (rows.length === 0) return c.json({ error: "Not found" }, 404);
  return c.body(null, 204);
});
