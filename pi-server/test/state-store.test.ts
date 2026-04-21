import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { Message } from "@mariozechner/pi-ai";

import { StateStore } from "../src/state/store.js";

async function createStateStore(): Promise<StateStore> {
  const dir = await mkdtemp(join(tmpdir(), "gullak-state-test-"));
  return new StateStore(join(dir, "pi-state.json"));
}

test("saveThread preserves reply contexts for a thread", async () => {
  const store = await createStateStore();

  await store.saveReplyContext("thread-1", "wa-msg-1", {
    transactionIds: ["txn-1"],
    recentTransactionIds: ["txn-1"],
    createdAt: "2026-04-21T10:00:00.000Z",
  });

  await store.saveThread(
    "thread-1",
    [{
      role: "user",
      content: "this",
      timestamp: 1,
    } satisfies Message] as Message[],
    "txn-1",
  );

  const replyContext = await store.getReplyContext("thread-1", "wa-msg-1");
  assert.deepEqual(replyContext?.transactionIds, ["txn-1"]);
  assert.deepEqual(replyContext?.recentTransactionIds, ["txn-1"]);
});

test("forgetTransactionId scrubs removed ids from stored reply contexts", async () => {
  const store = await createStateStore();

  await store.pushRecentTransactionId("thread-1", "txn-2");
  await store.pushRecentTransactionId("thread-1", "txn-1");
  await store.saveReplyContext("thread-1", "wa-msg-1", {
    transactionIds: ["txn-1", "txn-2"],
    recentTransactionIds: ["txn-1", "txn-2"],
    createdAt: "2026-04-21T10:00:00.000Z",
  });

  await store.forgetTransactionId("thread-1", "txn-1");

  const replyContext = await store.getReplyContext("thread-1", "wa-msg-1");
  assert.deepEqual(replyContext?.transactionIds, ["txn-2"]);
  assert.deepEqual(replyContext?.recentTransactionIds, ["txn-2"]);
});
