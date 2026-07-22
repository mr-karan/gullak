import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { expect, test } from "vitest";

import { createApp } from "../app.ts";
import type { AppConfig } from "../config.ts";
import * as schema from "../db/schema.ts";

function makeApp() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  const config = {
    sheets: { syncIntervalMinutes: 0 },
    ai: { enabled: false },
    rateLimit: { aiPerMinute: 0, webhookPerMinute: 0 },
  } as unknown as AppConfig;
  return { app: createApp({ db, config }), db };
}

function holding(
  db: ReturnType<typeof makeApp>["db"],
  o: { id: string; goalId?: string | null; currentCents: number; investedCents: number; stale?: boolean },
) {
  const now = Date.now();
  db.insert(schema.holdings)
    .values({
      id: o.id,
      isin: o.id,
      symbol: o.id,
      kind: "equity",
      quantity: 1,
      avgPrice: 1,
      lastPrice: 1,
      investedCents: o.investedCents,
      currentCents: o.currentCents,
      goalId: o.goalId ?? null,
      stale: o.stale ?? false,
      importedAt: now,
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

async function createGoal(app: ReturnType<typeof makeApp>["app"], body: unknown) {
  return app.request("/v1/goals", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("progress sums mapped non-stale holdings; excludes unmapped and stale", async () => {
  const { app, db } = makeApp();
  const res = await createGoal(app, { name: "BMW", targetCents: 1000_00, emoji: "🚗" });
  const goalId = ((await res.json()) as { goal: { id: string } }).goal.id;

  holding(db, { id: "mapped1", goalId, currentCents: 200_00, investedCents: 150_00 });
  holding(db, { id: "mapped2", goalId, currentCents: 300_00, investedCents: 250_00 });
  holding(db, { id: "staleMapped", goalId, currentCents: 999_00, investedCents: 999_00, stale: true });
  holding(db, { id: "unmapped", goalId: null, currentCents: 400_00, investedCents: 400_00 });

  const list = (await (await app.request("/v1/goals")).json()) as {
    goals: { id: string; currentCents: number; investedCents: number; holdingCount: number; pct: number }[];
    unmappedCents: number;
  };
  const g = list.goals.find((x) => x.id === goalId)!;
  expect(g.currentCents).toBe(500_00); // 200 + 300, stale excluded
  expect(g.investedCents).toBe(400_00); // 150 + 250
  expect(g.holdingCount).toBe(2);
  expect(g.pct).toBe(50); // 500 / 1000
  expect(list.unmappedCents).toBe(400_00); // the unmapped holding
});

test("DELETE goal is blocked with 409 while holdings are mapped", async () => {
  const { app, db } = makeApp();
  const res = await createGoal(app, { name: "Retire", targetCents: 500_00 });
  const goalId = ((await res.json()) as { goal: { id: string } }).goal.id;
  holding(db, { id: "h1", goalId, currentCents: 10_00, investedCents: 10_00 });

  const blocked = await app.request(`/v1/goals/${goalId}`, { method: "DELETE" });
  expect(blocked.status).toBe(409);
  expect(((await blocked.json()) as { error: string }).error).toMatch(/mapped/i);

  // Unmap, then delete succeeds with 204.
  db.update(schema.holdings).set({ goalId: null }).run();
  const ok = await app.request(`/v1/goals/${goalId}`, { method: "DELETE" });
  expect(ok.status).toBe(204);
  expect(db.select().from(schema.goals).all()).toHaveLength(0);
});

test("goals never write a sync event (server-only)", async () => {
  const { app, db } = makeApp();
  await createGoal(app, { name: "X", targetCents: 1 });
  expect(db.select().from(schema.syncChanges).all()).toHaveLength(0);
});
