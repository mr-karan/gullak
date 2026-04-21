import { DateTime } from "luxon";

import type { AppConfig } from "../config.js";
import type { AgentService, MessageRequest, MessageResponse } from "../agent/service.js";
import type { StateStore } from "../state/store.js";
import type { ReceiptVisionService, WhatsAppMediaPayload } from "./media.js";

export interface WebhookEnvelope {
  event: string;
  payload: Record<string, unknown>;
}

export interface BridgeSendTextResult {
  messageId?: string;
}

export interface BridgeClient {
  sendText(chatId: string, text: string): Promise<BridgeSendTextResult>;
  sendSeen(chatId: string): Promise<void>;
  startTyping(chatId: string): Promise<void>;
  stopTyping(chatId: string): Promise<void>;
}

export interface MessageHandler {
  handleMessage(request: MessageRequest): Promise<MessageResponse>;
}

const NOISE_PATTERNS = new Set([
  "hi",
  "hello",
  "hey",
  "gm",
  "gn",
  "thanks",
  "thank you",
  "bye",
  "👍",
  "🙏",
]);

export class WhatsAppBridgeClient {
  constructor(private readonly config: AppConfig) {}

  async sendText(chatId: string, text: string): Promise<BridgeSendTextResult> {
    const result = await this.post<{ messageId?: unknown }>("/api/sendText", {
      session: "default",
      chatId,
      text,
    });
    const messageId = asString(result.messageId).trim();
    return { messageId: messageId || undefined };
  }

  async sendSeen(chatId: string): Promise<void> {
    await this.post("/api/sendSeen", { session: "default", chatId });
  }

  async startTyping(chatId: string): Promise<void> {
    await this.post("/api/startTyping", { session: "default", chatId });
  }

  async stopTyping(chatId: string): Promise<void> {
    await this.post("/api/stopTyping", { session: "default", chatId });
  }

  private async post<T extends Record<string, unknown>>(path: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${this.config.whatsappBridgeUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.config.whatsappApiKey ? { "X-Api-Key": this.config.whatsappApiKey } : {}),
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`WhatsApp bridge error: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return {} as T;
    }

    return await response.json() as T;
  }
}

export class WhatsAppService {
  constructor(
    private readonly config: AppConfig,
    private readonly bridgeClient: BridgeClient,
    private readonly agentService: MessageHandler,
    private readonly stateStore: StateStore,
    private readonly receiptVisionService: ReceiptVisionService,
  ) {}

  async handleWebhook(body: WebhookEnvelope): Promise<Record<string, unknown>> {
    if (body.event !== "message") {
      return { status: "ignored", reason: "not_message_event" };
    }

    const payload = body.payload;
    const messageId = asString(payload.id);
    if (messageId && (await this.stateStore.isDuplicateWhatsappMessage(messageId))) {
      return { status: "ignored", reason: "duplicate" };
    }

    const sender = asString(payload.from);
    const author = asString(payload.author) || sender;
    const authorPhone = asString(payload.authorPhone);
    const resolvedNumber = authorPhone || author.split("@")[0].split(":")[0];
    const fromMe = Boolean(payload.fromMe);
    const isGroup = sender.includes("@g.us");

    if (fromMe) {
      return { status: "ignored", reason: "from_me" };
    }

    if (
      this.config.whatsappAllowedNumbers.length > 0 &&
      !this.config.whatsappAllowedNumbers.includes(resolvedNumber)
    ) {
      return { status: "ignored", reason: "unauthorized" };
    }

    let text = asString(payload.body).trim();
    const quotedText = asString(payload.quotedText).trim();
    const quotedMessageId = asString(payload.quotedMessageId).trim();
    const media = asMedia(payload.media);
    const hasMedia = Boolean(media);

    if (isGroup && this.config.whatsappGroupRequireMention) {
      const lower = text.toLowerCase();
      if (lower.startsWith("@gullak")) {
        text = text.slice(7).trim();
      } else if (lower.startsWith("gullak")) {
        text = text.slice(6).trim();
      } else {
        return { status: "ignored", reason: "group_no_mention" };
      }
    }

    const threadId = isGroup
      ? `wa:group:${sender.split("@")[0]}:${resolvedNumber}`
      : `wa:dm:${resolvedNumber}`;

    try {
      await this.bridgeClient.sendSeen(sender);
      await this.bridgeClient.startTyping(sender);

      if (media) {
        const receiptText = await this.receiptVisionService.describeReceipt({
          caption: text,
          media,
        }).catch(() => null);

        if (receiptText) {
          text = text ? `${text}\n\n${receiptText}` : receiptText;
        } else if (!text) {
          await this.bridgeClient.sendText(
            sender,
            "I couldn't read that receipt image yet. Send the spend as text, or add a caption with the amount and merchant.",
          );
          return { status: "ignored", reason: "media_not_supported" };
        }
      }

      if (!text) {
        return { status: "ignored", reason: "empty_message" };
      }

      if (quotedText) {
        text = `[Replying to: \"${quotedText}\"]\n${text}`;
      }

      if (isNoiseMessage(text)) {
        return { status: "ignored", reason: "noise" };
      }

      const response = await this.agentService.handleMessage({
        text,
        threadId,
        source: "whatsapp",
        sourceUser: asString(payload.pushName) || resolvedNumber,
        timestamp: extractTimestamp(payload),
        quotedMessageId: quotedMessageId || undefined,
      });

      if (response.reply.trim()) {
        const sendResult = await this.bridgeClient.sendText(sender, response.reply);
        if (sendResult.messageId) {
          await this.stateStore.saveReplyContext(threadId, sendResult.messageId, {
            transactionIds: response.referencedTransactionIds
              ?? (response.transactionId ? [response.transactionId] : []),
            recentTransactionIds: await this.stateStore.getRecentTransactionIds(threadId, 5),
            createdAt: new Date().toISOString(),
          });
        }
      }

      return {
        status: "processed",
        threadId,
        action: response.action,
        transactionId: response.transactionId,
      };
    } finally {
      try {
        await this.bridgeClient.stopTyping(sender);
      } catch {
        // ignore stop typing failures
      }
    }
  }
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asMedia(value: unknown): WhatsAppMediaPayload | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const candidate = value as Record<string, unknown>;
  const type = asString(candidate.type);
  const data = asString(candidate.data);
  if (!type || !data) {
    return undefined;
  }

  return {
    type,
    data,
    mimetype: asString(candidate.mimetype) || undefined,
    filename: asString(candidate.filename) || undefined,
    size: typeof candidate.size === "number" ? candidate.size : undefined,
  };
}

function isNoiseMessage(message: string): boolean {
  const normalized = message.toLowerCase().trim().replace(/[!?.…]+$/g, "");
  return NOISE_PATTERNS.has(normalized);
}

function extractTimestamp(payload: Record<string, unknown>): string | undefined {
  const keys = ["timestamp", "messageTimestamp", "messageTimestampMs", "t"];
  for (const key of keys) {
    const raw = payload[key];
    if (typeof raw !== "number" && typeof raw !== "string") {
      continue;
    }

    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      continue;
    }

    const millis = parsed > 10_000_000_000 ? parsed : parsed * 1000;
    return DateTime.fromMillis(millis).toISO() ?? undefined;
  }

  return undefined;
}
