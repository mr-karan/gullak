import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import type { AppConfig } from "../src/config.js";
import type { MessageRequest, MessageResponse } from "../src/agent/service.js";
import { StateStore } from "../src/state/store.js";
import type { ReceiptVisionInput, ReceiptVisionService } from "../src/whatsapp/media.js";
import {
  WhatsAppService,
  type BridgeClient,
  type BridgeSendTextResult,
  type MessageHandler,
  type WebhookEnvelope,
} from "../src/whatsapp/service.js";

function makeConfig(): AppConfig {
  return {
    version: "test",
    dataDir: "/tmp",
    ledgerPath: "/tmp/main.ledger",
    statePath: "/tmp/pi-state.json",
    recapDir: "/tmp/recaps",
    timezone: "Asia/Kolkata",
    defaultCurrency: "INR",
    ledgerCli: "ledger",
    validateWrites: false,
    host: "127.0.0.1",
    port: 8787,
    httpApiKey: undefined,
    modelBaseUrl: "https://openrouter.ai/api/v1",
    modelId: "google/gemini-2.5-flash",
    modelName: "Gemini 2.5 Flash",
    modelApiKey: "test-key",
    modelReasoning: false,
    modelThinkingLevel: "minimal",
    whatsappBridgeUrl: "http://localhost:3000",
    whatsappApiKey: undefined,
    whatsappAllowedNumbers: [],
    whatsappGroupRequireMention: false,
    recapWhatsappChatId: undefined,
  };
}

class FakeBridgeClient implements BridgeClient {
  public readonly calls: Array<{ method: string; args: unknown[] }> = [];
  public nextMessageId = "wa-out-1";

  async sendText(chatId: string, text: string): Promise<BridgeSendTextResult> {
    this.calls.push({ method: "sendText", args: [chatId, text] });
    return { messageId: this.nextMessageId };
  }

  async sendSeen(chatId: string): Promise<void> {
    this.calls.push({ method: "sendSeen", args: [chatId] });
  }

  async startTyping(chatId: string): Promise<void> {
    this.calls.push({ method: "startTyping", args: [chatId] });
  }

  async stopTyping(chatId: string): Promise<void> {
    this.calls.push({ method: "stopTyping", args: [chatId] });
  }
}

class FakeAgentService implements MessageHandler {
  public requests: MessageRequest[] = [];

  constructor(private readonly reply = "Saved it.") {}

  async handleMessage(request: MessageRequest): Promise<MessageResponse> {
    this.requests.push(request);
    return {
      threadId: request.threadId ?? "thread-1",
      reply: this.reply,
      needsClarification: false,
      action: "record_expense",
      transactionId: "txn-1",
    };
  }
}

class FakeReceiptVisionService implements ReceiptVisionService {
  public requests: ReceiptVisionInput[] = [];

  constructor(private readonly response: string | null) {}

  async describeReceipt(input: ReceiptVisionInput): Promise<string | null> {
    this.requests.push(input);
    return this.response;
  }
}

function makeEnvelope(overrides: Partial<WebhookEnvelope["payload"]> = {}): WebhookEnvelope {
  return {
    event: "message",
    payload: {
      id: "msg-1",
      from: "919650318721@s.whatsapp.net",
      author: "919650318721@s.whatsapp.net",
      authorPhone: "919650318721",
      body: "",
      pushName: "Karan",
      timestamp: 1_744_992_000,
      ...overrides,
    },
  };
}

async function createStateStore(): Promise<StateStore> {
  const dir = await mkdtemp(join(tmpdir(), "gullak-whatsapp-test-"));
  return new StateStore(join(dir, "pi-state.json"));
}

test("media-only image messages are converted into agent text", async () => {
  const bridge = new FakeBridgeClient();
  const agent = new FakeAgentService("Recorded from receipt.");
  const stateStore = await createStateStore();
  const receiptVision = new FakeReceiptVisionService(
    "Parsed from receipt image: Spent 799 INR at DMart on 2026-04-18.",
  );
  const service = new WhatsAppService(
    makeConfig(),
    bridge,
    agent,
    stateStore,
    receiptVision,
  );

  const result = await service.handleWebhook(makeEnvelope({
    media: {
      type: "image",
      mimetype: "image/jpeg",
      data: "ZmFrZQ==",
      size: 4,
    },
  }));

  assert.equal(result.status, "processed");
  assert.equal(agent.requests.length, 1);
  assert.equal(
    agent.requests[0].text,
    "Parsed from receipt image: Spent 799 INR at DMart on 2026-04-18.",
  );
  assert.equal(receiptVision.requests.length, 1);
  assert.deepEqual(
    bridge.calls.map((call) => call.method),
    ["sendSeen", "startTyping", "sendText", "stopTyping"],
  );
});

test("unsupported media without text falls back to a user-facing prompt", async () => {
  const bridge = new FakeBridgeClient();
  const agent = new FakeAgentService();
  const stateStore = await createStateStore();
  const receiptVision = new FakeReceiptVisionService(null);
  const service = new WhatsAppService(
    makeConfig(),
    bridge,
    agent,
    stateStore,
    receiptVision,
  );

  const result = await service.handleWebhook(makeEnvelope({
    media: {
      type: "image",
      mimetype: "image/jpeg",
      data: "ZmFrZQ==",
      size: 4,
    },
  }));

  assert.equal(result.status, "ignored");
  assert.equal(result.reason, "media_not_supported");
  assert.equal(agent.requests.length, 0);
  assert.equal(
    bridge.calls.find((call) => call.method === "sendText")?.args[1],
    "I couldn't read that receipt image yet. Send the spend as text, or add a caption with the amount and merchant.",
  );
});

test("quoted message ids are passed to the agent and assistant replies are anchored in state", async () => {
  const bridge = new FakeBridgeClient();
  bridge.nextMessageId = "wa-out-quoted-1";
  const agent = new FakeAgentService("Done. Updated it.");
  const stateStore = await createStateStore();
  const receiptVision = new FakeReceiptVisionService(null);
  const service = new WhatsAppService(
    makeConfig(),
    bridge,
    agent,
    stateStore,
    receiptVision,
  );

  await stateStore.pushRecentTransactionId(
    "wa:dm:919650318721",
    "txn-recent-1",
  );

  const result = await service.handleWebhook(makeEnvelope({
    body: "This.",
    quotedText: "Got it. Saved 1200.00 INR for Swiggy.",
    quotedMessageId: "wa-in-quoted-123",
  }));

  assert.equal(result.status, "processed");
  assert.equal(agent.requests.length, 1);
  assert.equal(agent.requests[0].quotedMessageId, "wa-in-quoted-123");
  assert.match(agent.requests[0].text, /^\[Replying to: "Got it\. Saved 1200\.00 INR for Swiggy\."\]\nThis\.$/);

  const replyContext = await stateStore.getReplyContext("wa:dm:919650318721", "wa-out-quoted-1");
  assert.deepEqual(replyContext?.recentTransactionIds, ["txn-recent-1"]);
  assert.deepEqual(replyContext?.transactionIds, ["txn-1"]);
});
