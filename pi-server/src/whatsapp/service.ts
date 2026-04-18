import { DateTime } from "luxon";

import type { AppConfig } from "../config.js";
import type { AgentService } from "../agent/service.js";

export interface WebhookEnvelope {
  event: string;
  payload: Record<string, unknown>;
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

  async sendText(chatId: string, text: string): Promise<void> {
    await this.post("/api/sendText", { session: "default", chatId, text });
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

  private async post(path: string, body: Record<string, unknown>): Promise<void> {
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
  }
}

export class WhatsAppService {
  constructor(
    private readonly config: AppConfig,
    private readonly bridgeClient: WhatsAppBridgeClient,
    private readonly agentService: AgentService,
    private readonly seenMessage: (messageId: string) => Promise<boolean>,
  ) {}

  async handleWebhook(body: WebhookEnvelope): Promise<Record<string, unknown>> {
    if (body.event !== "message") {
      return { status: "ignored", reason: "not_message_event" };
    }

    const payload = body.payload;
    const messageId = asString(payload.id);
    if (messageId && (await this.seenMessage(messageId))) {
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
    const hasMedia = Boolean(payload.media);

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

    if (!text && hasMedia) {
      await this.bridgeClient.sendText(
        sender,
        "Media receipt parsing is not in the minimal rewrite yet. Send the spend as text.",
      );
      return { status: "ignored", reason: "media_not_supported" };
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

    const threadId = isGroup
      ? `wa:group:${sender.split("@")[0]}:${resolvedNumber}`
      : `wa:dm:${resolvedNumber}`;

    try {
      await this.bridgeClient.sendSeen(sender);
      await this.bridgeClient.startTyping(sender);

      const response = await this.agentService.handleMessage({
        text,
        threadId,
        source: "whatsapp",
        sourceUser: asString(payload.pushName) || resolvedNumber,
        timestamp: extractTimestamp(payload),
      });

      if (response.reply.trim()) {
        await this.bridgeClient.sendText(sender, response.reply);
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
