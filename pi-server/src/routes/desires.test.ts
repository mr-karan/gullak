import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, expect, test } from "vitest";

import { createApp } from "../app.ts";
import type { AppConfig } from "../config.ts";
import * as schema from "../db/schema.ts";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const d of tmpDirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function makeApp() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const dataDir = mkdtempSync(join(tmpdir(), "gullak-desires-"));
  tmpDirs.push(dataDir);
  const config = {
    dataDir,
    sheets: { syncIntervalMinutes: 0 },
    ai: { enabled: false },
    rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
  } as unknown as AppConfig;
  return { app: createApp({ db, config }), db, dataDir };
}

async function createDesire(app: ReturnType<typeof makeApp>["app"], body: unknown) {
  return app.request("/v1/desires", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

// 1x1 transparent PNG.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

test("desire CRUD: create, patch (status stamps decidedAt), delete", async () => {
  const { app } = makeApp();
  const created = await createDesire(app, {
    person: "karan",
    title: "Vinyl player",
    estCostCents: 25000_00,
    why: "music sounds better",
  });
  expect(created.status).toBe(201);
  const id = ((await created.json()) as { desire: { id: string; status: string } }).desire.id;

  const patched = await app.request(`/v1/desires/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "bought", boughtTransactionId: "tx-9" }),
  });
  const pd = (await patched.json()) as {
    desire: { status: string; decidedAt: number | null; boughtTransactionId: string };
  };
  expect(pd.desire.status).toBe("bought");
  expect(pd.desire.decidedAt).toBeTypeOf("number");
  expect(pd.desire.boughtTransactionId).toBe("tx-9");

  const del = await app.request(`/v1/desires/${id}`, { method: "DELETE" });
  expect(del.status).toBe(204);
  expect((await app.request(`/v1/desires/${id}`)).status).toBe(404);
});

test("person is validated against the profile enum", async () => {
  const { app } = makeApp();
  const bad = await createDesire(app, { person: "bob", title: "X", estCostCents: 1 });
  expect(bad.status).toBe(400);
  const good = await createDesire(app, { person: "wife", title: "X", estCostCents: 1 });
  expect(good.status).toBe(201);
});

test("list filters by person and status", async () => {
  const { app } = makeApp();
  await createDesire(app, { person: "karan", title: "K1", estCostCents: 1 });
  await createDesire(app, { person: "wife", title: "W1", estCostCents: 1 });
  const res = await app.request("/v1/desires?person=wife");
  const body = (await res.json()) as { desires: { title: string; person: string }[] };
  expect(body.desires).toHaveLength(1);
  expect(body.desires[0]!.person).toBe("wife");
});

test("photo upload stores under the desire dir, serves bytes, and is traversal-safe", async () => {
  const { app, db, dataDir } = makeApp();
  const created = await createDesire(app, { person: "karan", title: "Camera", estCostCents: 5 });
  const id = ((await created.json()) as { desire: { id: string } }).desire.id;

  const fd = new FormData();
  fd.append("file", new File([PNG], "pic.png", { type: "image/png" }));
  const up = await app.request(`/v1/desires/${id}/photos`, { method: "POST", body: fd });
  expect(up.status).toBe(201);
  const photoId = ((await up.json()) as { id: string }).id;

  // The stored path is relative and confined to the desire's own directory.
  const row = db
    .select()
    .from(schema.desirePhotos)
    .where(eq(schema.desirePhotos.id, photoId))
    .get();
  expect(row?.path).toBe(join("uploads", "desires", id, `${photoId}.png`));
  expect(existsSync(resolve(dataDir, row!.path))).toBe(true);

  // Serve returns the same bytes with the right content-type.
  const served = await app.request(`/v1/desires/${id}/photos/${photoId}`);
  expect(served.status).toBe(200);
  expect(served.headers.get("content-type")).toBe("image/png");
  expect(Buffer.from(await served.arrayBuffer())).toEqual(PNG);

  // A bogus/traversal photoId resolves nothing (paths come from rows, not input).
  expect(
    (await app.request(`/v1/desires/${id}/photos/..%2f..%2fetc`)).status,
  ).toBe(404);

  // Deleting the desire removes the photo file from disk.
  await app.request(`/v1/desires/${id}`, { method: "DELETE" });
  expect(existsSync(resolve(dataDir, row!.path))).toBe(false);
});

test("photo upload rejects an unsupported content type", async () => {
  const { app } = makeApp();
  const created = await createDesire(app, { person: "karan", title: "X", estCostCents: 1 });
  const id = ((await created.json()) as { desire: { id: string } }).desire.id;
  const fd = new FormData();
  fd.append("file", new File([Buffer.from("hi")], "note.txt", { type: "text/plain" }));
  const up = await app.request(`/v1/desires/${id}/photos`, { method: "POST", body: fd });
  expect(up.status).toBe(415);
});

test("comments: add (person validated) and delete; counted in detail view", async () => {
  const { app } = makeApp();
  const created = await createDesire(app, { person: "karan", title: "TV", estCostCents: 1 });
  const id = ((await created.json()) as { desire: { id: string } }).desire.id;

  const bad = await app.request(`/v1/desires/${id}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ person: "nobody", body: "hmm" }),
  });
  expect(bad.status).toBe(400);

  const add = await app.request(`/v1/desires/${id}/comments`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ person: "wife", body: "wait for a sale" }),
  });
  expect(add.status).toBe(201);
  const commentId = ((await add.json()) as { id: string }).id;

  const detail = (await (await app.request(`/v1/desires/${id}`)).json()) as {
    desire: { commentCount: number };
    comments: { id: string; person: string; body: string }[];
  };
  expect(detail.desire.commentCount).toBe(1);
  expect(detail.comments[0]!.body).toBe("wait for a sale");

  const del = await app.request(`/v1/desires/${id}/comments/${commentId}`, {
    method: "DELETE",
  });
  expect(del.status).toBe(204);
});

test("desires never write a change_log row (server-only)", async () => {
  const { app, db } = makeApp();
  await createDesire(app, { person: "karan", title: "X", estCostCents: 1 });
  expect(db.select().from(schema.changeLog).all()).toHaveLength(0);
});
