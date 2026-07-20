import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, expect, test, vi } from "vitest";

// Stub the model seam. We DRIVE the supplied runTool ourselves so the real
// write_tools run against a seeded in-memory DB — proving selected ids reach the
// tools and that writes actually mutate + change-log.
vi.mock("../llm/client.ts", async () => {
  const actual =
    await vi.importActual<typeof import("../llm/client.ts")>("../llm/client.ts");
  return { ...actual, chatJson: vi.fn(), chatTools: vi.fn() };
});

import type { AppConfig } from "../config.ts";
import * as schema from "../db/schema.ts";
import { chatJson, chatTools } from "../llm/client.ts";
import { handleMessage } from "./agent.ts";
import { WRITE_TOOL_NAMES } from "./write_tools.ts";

const mockChatTools = vi.mocked(chatTools);
const mockChatJson = vi.mocked(chatJson);
const at = 1_700_000_000_000;

function seed() {
  const sqlite = new Database(":memory:");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  db.insert(schema.accounts)
    .values({ id: "a1", name: "HDFC", openingBalanceCents: 0, createdAt: at, updatedAt: at })
    .run();
  db.insert(schema.categories)
    .values({ id: "c-food", name: "Food", groupId: "g1", updatedAt: at })
    .run();
  db.insert(schema.transactions)
    .values({ id: "t1", accountId: "a1", amountCents: -500_00, date: "2026-07-01", payeeName: "Swiggy", createdAt: at, updatedAt: at })
    .run();
  db.insert(schema.transactions)
    .values({ id: "t2", accountId: "a1", amountCents: -300_00, date: "2026-07-02", payeeName: "Zomato", createdAt: at, updatedAt: at })
    .run();
  return db;
}

const config = { ai: { enabled: true }, defaultCurrency: "INR" } as unknown as AppConfig;

beforeEach(() => {
  mockChatTools.mockReset();
  mockChatJson.mockReset();
  mockChatJson.mockResolvedValue({ mode: "edit_or_delete", confidence: 0.9 });
});

test("selection: selected ids are rendered into the turn and drive a categorize", async () => {
  const db = seed();
  let seenUser = "";
  // The model 'decides' to categorize the selected rows to Food.
  mockChatTools.mockImplementation(async (_c, opts) => {
    seenUser = opts.user;
    const out = await opts.runTool({
      id: "call1",
      name: "categorize_transactions",
      arguments: JSON.stringify({ transactionIds: ["t1", "t2"], categoryName: "Food" }),
    });
    void out;
    return "Done — recategorized 2 to Food.";
  });

  const res = await handleMessage(db, config, {
    text: "recategorize these to Food",
    source: "web",
    selection: { transactionIds: ["t1", "t2"] },
  });

  // Selection reached the model turn as concrete, actionable context.
  expect(seenUser).toContain("The user has selected these 2 transactions");
  expect(seenUser).toContain("id=t1");
  expect(seenUser).toContain("id=t2");

  // Both BOTH registries were offered on the write path.
  const toolNames = mockChatTools.mock.calls[0]![1].tools.map((t) => t.name);
  expect(toolNames).toContain("categorize_transactions");
  expect(toolNames).toContain("summary"); // a read tool

  // The write actually happened.
  expect(db.select().from(schema.transactions).where(eq(schema.transactions.id, "t1")).get()!.categoryId).toBe("c-food");
  expect(db.select().from(schema.transactions).where(eq(schema.transactions.id, "t2")).get()!.categoryId).toBe("c-food");

  // The structured action sidecar is returned for the UI (with Undo).
  expect(res.actions).toHaveLength(1);
  expect(res.actions![0]!.kind).toBe("write_result");
  expect(res.actions![0]!.affectedIds.sort()).toEqual(["t1", "t2"]);
  expect(res.actions![0]!.undo?.tool).toBe("restore_categories");
});

test("read/write separation: an ask-style question never offers write tools", async () => {
  const db = seed();
  // "what's my net worth?" classifies as ask deterministically.
  mockChatTools.mockImplementation(async (_c, opts) => {
    // If the model tried to call a write tool here, it wouldn't even be offered.
    return opts.runTool({ id: "c", name: "net_worth", arguments: "{}" });
  });

  const res = await handleMessage(db, config, { text: "what's my net worth?", source: "web" });

  const toolNames = mockChatTools.mock.calls[0]![1].tools.map((t) => t.name);
  for (const w of WRITE_TOOL_NAMES) {
    expect(toolNames).not.toContain(w);
  }
  // No writes leaked.
  expect(res.actions).toBeUndefined();
  expect(db.select().from(schema.transactions).where(eq(schema.transactions.id, "t1")).get()!.categoryId).toBeNull();
});

test("write path surfaces an edit action with an undo", async () => {
  const db = seed();
  mockChatTools.mockImplementation(async (_c, opts) => {
    await opts.runTool({
      id: "c",
      name: "edit_transaction",
      arguments: JSON.stringify({ id: "t1", amountCents: 156_000 }),
    });
    return "Changed it.";
  });

  const res = await handleMessage(db, config, {
    text: "change the Swiggy one to 1560",
    source: "web",
  });

  expect(db.select().from(schema.transactions).where(eq(schema.transactions.id, "t1")).get()!.amountCents).toBe(-156_000);
  expect(res.actions).toHaveLength(1);
  expect(res.actions![0]!.tool).toBe("edit_transaction");
  expect(res.actions![0]!.summary).toContain("₹1,560.00");
  expect(res.actions![0]!.undo?.tool).toBe("edit_transaction");
});
