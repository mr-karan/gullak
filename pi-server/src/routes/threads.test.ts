import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
  const dataDir = mkdtempSync(join(tmpdir(), "gullak-threads-"));
  tmpDirs.push(dataDir);
  const config = {
    dataDir,
    sheets: { syncIntervalMinutes: 0 },
    ai: { enabled: false },
    rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
  } as unknown as AppConfig;
  return { app: createApp({ db, config }), db };
}

function seedTurn(
  db: ReturnType<typeof makeApp>["db"],
  threadId: string,
  role: "user" | "assistant",
  content: string,
  at: number,
) {
  db.insert(schema.agentTurns).values({ threadId, role, content, at }).run();
}

test("GET /v1/messages/threads lists threads newest-first with title, count, source", async () => {
  const { app, db } = makeApp();
  seedTurn(db, "web:aaaa1111", "user", "Where can I cut back?", 1_000);
  seedTurn(db, "web:aaaa1111", "assistant", "Dining is the lever.", 2_000);
  seedTurn(db, "whatsapp:+9199", "user", "spent 480 groceries", 5_000);
  seedTurn(db, "whatsapp:+9199", "assistant", "Logged ₹480 ✓", 6_000);

  const res = await app.request("/v1/messages/threads");
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    threads: { threadId: string; title: string; lastAt: number; turnCount: number; source: string }[];
  };
  expect(body.threads).toHaveLength(2);
  // Newest activity first.
  expect(body.threads[0]).toMatchObject({
    threadId: "whatsapp:+9199",
    title: "spent 480 groceries",
    lastAt: 6_000,
    turnCount: 2,
    source: "whatsapp",
  });
  expect(body.threads[1]).toMatchObject({
    threadId: "web:aaaa1111",
    title: "Where can I cut back?",
    source: "web",
  });
});

test("thread titles are the FIRST user turn, whitespace-collapsed and truncated", async () => {
  const { app, db } = makeApp();
  const long = `hey\n\n  ${"x".repeat(120)}`;
  seedTurn(db, "web:bbbb2222", "assistant", "canned greeting reply", 1_000);
  seedTurn(db, "web:bbbb2222", "user", long, 2_000);

  const res = await app.request("/v1/messages/threads");
  const body = (await res.json()) as { threads: { title: string }[] };
  expect(body.threads[0]!.title.startsWith("hey x")).toBe(true);
  expect(body.threads[0]!.title.endsWith("…")).toBe(true);
  expect(body.threads[0]!.title.length).toBeLessThanOrEqual(81); // 80 + ellipsis
});

test("GET /v1/messages/threads/:threadId returns turns ascending; unknown id 404s", async () => {
  const { app, db } = makeApp();
  seedTurn(db, "web:cccc3333", "user", "What's my net worth?", 1_000);
  seedTurn(db, "web:cccc3333", "assistant", "₹2.55Cr as of the last import.", 2_000);

  const res = await app.request("/v1/messages/threads/web%3Acccc3333");
  expect(res.status).toBe(200);
  const body = (await res.json()) as {
    turns: { id: number; role: string; content: string; at: number }[];
  };
  expect(body.turns.map((t) => t.role)).toEqual(["user", "assistant"]);
  expect(body.turns[0]!.content).toBe("What's my net worth?");

  const missing = await app.request("/v1/messages/threads/web%3Anope");
  expect(missing.status).toBe(404);
});
