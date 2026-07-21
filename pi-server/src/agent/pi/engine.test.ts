import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { beforeEach, expect, test, vi } from "vitest";

import {
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
  type Model,
} from "@earendil-works/pi-ai";

// The legacy log path (handleLog → parseWhatsappExpenses) still reaches the model
// through llm/client's chatJson. Stub that single seam so the cheap-path test can
// book a transaction without a real model. The pi engine itself talks to a faux
// pi-ai provider, not this module.
vi.mock("../../llm/client.ts", async () => {
  const actual =
    await vi.importActual<typeof import("../../llm/client.ts")>("../../llm/client.ts");
  return { ...actual, chatJson: vi.fn(), chatTools: vi.fn() };
});

import type { AppConfig } from "../../config.ts";
import * as schema from "../../db/schema.ts";
import { chatJson } from "../../llm/client.ts";
import { dispatchMessage } from "../agent.ts";
import type { PiModelDeps } from "./provider.ts";
import { handlePiMessage, streamPiMessage, type PiUiEvent } from "./engine.ts";

const mockChatJson = vi.mocked(chatJson);
const at = 1_700_000_000_000;

const config = {
  ai: { enabled: true },
  defaultCurrency: "INR",
  agentEngine: "pi",
} as unknown as AppConfig;

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
  db.insert(schema.categories)
    .values({ id: "c-gro", name: "Groceries", groupId: "g1", updatedAt: at })
    .run();
  db.insert(schema.transactions)
    .values({ id: "t1", accountId: "a1", amountCents: -500_00, date: "2026-07-01", payeeName: "Swiggy", createdAt: at, updatedAt: at })
    .run();
  db.insert(schema.transactions)
    .values({ id: "t2", accountId: "a1", amountCents: -300_00, date: "2026-07-02", payeeName: "Zomato", createdAt: at, updatedAt: at })
    .run();
  return db;
}

/// A faux pi-ai provider + a Models collection wrapping it, ready to inject as
/// the engine's `deps`. `setResponses` scripts the assistant turns.
function makeDeps() {
  const faux = fauxProvider();
  const models = createModels();
  models.setProvider(faux.provider);
  const model = faux.getModel() as Model<"openai-completions">;
  const deps: PiModelDeps = { models, model };
  return { faux, deps };
}

beforeEach(() => {
  mockChatJson.mockReset();
});

test("ask flow: model calls summary, reply is the sanitized text, nothing mutated", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("summary", {})]),
    fauxAssistantMessage("You spent ₹800 this month."),
  ]);

  const res = await handlePiMessage(
    db,
    config,
    { text: "how much did I spend this month?", source: "web" },
    deps,
  );

  expect(res.reply).toBe("You spent ₹800 this month.");
  expect(res.tool).toBe("summary");
  expect(res.actions).toBeUndefined();

  // No rows mutated by a read tool.
  expect(db.select().from(schema.transactions).where(eq(schema.transactions.id, "t1")).get()!.categoryId).toBeNull();
  expect(db.select().from(schema.transactions).all()).toHaveLength(2);
});

test("advisory flow: 'Where can I cut back?' routes through pi, not the canned noop", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  const answer = "Your Swiggy and Zomato orders are the bulk this month.";
  faux.setResponses([fauxAssistantMessage(answer)]);

  const res = await dispatchMessage(
    db,
    config,
    { text: "Where can I cut back?", source: "web" },
    deps,
  );

  expect(res.reply).toBe(answer);
  // Not the deterministic greeting/noop ack.
  expect(res.reply).not.toContain("Send an amount like");
});

test("write flow: categorize_transactions actually recategorizes + change-logs + returns an action", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  faux.setResponses([
    fauxAssistantMessage([
      fauxToolCall("categorize_transactions", {
        transactionIds: ["t1", "t2"],
        categoryName: "Food",
      }),
    ]),
    fauxAssistantMessage("Done — recategorized 2 to Food."),
  ]);

  const res = await handlePiMessage(
    db,
    config,
    {
      text: "recategorize these to Food",
      source: "web",
      selection: { transactionIds: ["t1", "t2"] },
    },
    deps,
  );

  // Rows actually changed.
  expect(db.select().from(schema.transactions).where(eq(schema.transactions.id, "t1")).get()!.categoryId).toBe("c-food");
  expect(db.select().from(schema.transactions).where(eq(schema.transactions.id, "t2")).get()!.categoryId).toBe("c-food");

  // Change-log rows written so other clients pull the updates.
  const upserts = db
    .select()
    .from(schema.changeLog)
    .where(eq(schema.changeLog.op, "upsert"))
    .all();
  expect(upserts.some((c) => c.resourceId === "t1")).toBe(true);
  expect(upserts.some((c) => c.resourceId === "t2")).toBe(true);

  // Structured action sidecar for the UI (with Undo).
  expect(res.tool).toBe("categorize_transactions");
  expect(res.actions).toHaveLength(1);
  expect(res.actions![0]!.kind).toBe("write_result");
  expect(res.actions![0]!.affectedIds.sort()).toEqual(["t1", "t2"]);
  expect(res.actions![0]!.undo?.tool).toBe("restore_categories");
});

test("guardrail: delete_transactions with 51 ids is blocked, rows untouched", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  const ids = Array.from({ length: 51 }, (_, i) => `t1`); // duplicates dedupe to t1, but 51 raw ids trip the cap
  faux.setResponses([
    fauxAssistantMessage([fauxToolCall("delete_transactions", { transactionIds: ids })]),
    fauxAssistantMessage("I can't delete that many at once."),
  ]);

  const res = await handlePiMessage(
    db,
    config,
    { text: "delete everything", source: "web" },
    deps,
  );

  // Nothing was deleted and no write action was produced.
  expect(db.select().from(schema.transactions).all()).toHaveLength(2);
  expect(res.actions).toBeUndefined();
  const deletes = db
    .select()
    .from(schema.changeLog)
    .where(eq(schema.changeLog.op, "delete"))
    .all();
  expect(deletes).toHaveLength(0);
});

test("cheap path: 'spent 480 groceries' books via handleLog, bypassing pi (engine=pi)", async () => {
  const db = seed();
  const { deps } = makeDeps();
  mockChatJson.mockResolvedValueOnce({
    items: [
      {
        amount_cents: 48000,
        is_income: false,
        payee: "Blinkit",
        category_hint: "Groceries",
        text: "spent 480 groceries",
      },
    ],
  });

  const res = await dispatchMessage(
    db,
    config,
    { text: "spent 480 groceries", source: "web" },
    deps,
  );

  expect(res.queued).toBe(1);
  const booked = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.categoryId, "c-gro"))
    .all();
  expect(booked).toHaveLength(1);
  expect(booked[0]!.amountCents).toBe(-48000);
});

test("cheap path: undo-last hits the deterministic undo, bypassing pi (engine=pi)", async () => {
  const db = seed();
  const { deps } = makeDeps();
  // A fresh chat-booked expense the undo can remove.
  db.insert(schema.transactions)
    .values({
      id: "fresh",
      accountId: "a1",
      amountCents: -100_00,
      date: "2026-07-03",
      payeeName: "Coffee",
      origin: "whatsapp",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    .run();

  const res = await dispatchMessage(
    db,
    config,
    { text: "ok delete the last one", source: "web" },
    deps,
  );

  expect(res.reply.toLowerCase()).toContain("deleted");
  expect(db.select().from(schema.transactions).where(eq(schema.transactions.id, "fresh")).get()).toBeUndefined();
});

test("streamPiMessage yields delta events and a final AgentResponse", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  faux.setResponses([fauxAssistantMessage("Streaming reply here.")]);

  const gen = streamPiMessage(
    db,
    config,
    { text: "say hello", source: "web" },
    deps,
  );

  const events: PiUiEvent[] = [];
  let result;
  while (true) {
    const next = await gen.next();
    if (next.done) {
      result = next.value;
      break;
    }
    events.push(next.value);
  }

  expect(events.some((e) => e.type === "delta")).toBe(true);
  const streamedText = events
    .filter((e): e is Extract<PiUiEvent, { type: "delta" }> => e.type === "delta")
    .map((e) => e.text)
    .join("");
  expect(streamedText).toContain("Streaming reply");
  expect(result!.reply).toBe("Streaming reply here.");
});

test("a committed write is never re-run via legacy fallback when the run dies afterwards", async () => {
  const db = seed();
  const { faux, deps } = makeDeps();
  // Script ONLY the write tool call. The follow-up LLM call (after the tool
  // result) finds no scripted response, so the faux provider rejects — the
  // exact "write committed, then the run died" shape. dispatchMessage must NOT
  // fall back to the legacy flow (which could book the expense a second time).
  faux.setResponses([
    fauxAssistantMessage([
      fauxToolCall("log_transaction", {
        amountCents: 45000,
        payeeName: "Blinkit",
        categoryName: "Food",
        accountName: "HDFC",
      }),
    ]),
  ]);

  const before = db.select().from(schema.transactions).all().length;
  const res = await dispatchMessage(
    db,
    config,
    { text: "add a 450 groceries expense", source: "web" },
    deps,
  );
  const after = db.select().from(schema.transactions).all();

  // Exactly ONE row was booked — no legacy re-run, no duplicate.
  expect(after.length).toBe(before + 1);
  // The degraded-but-honest reply, with the committed action still attached.
  expect(res.reply).toContain("check the register");
  expect(res.actions?.length).toBe(1);
});
