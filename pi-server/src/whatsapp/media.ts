import type { AppConfig } from "../config.js";

export interface WhatsAppMediaPayload {
  type: string;
  mimetype?: string;
  filename?: string;
  data: string;
  size?: number;
}

export interface ReceiptVisionInput {
  caption?: string;
  media: WhatsAppMediaPayload;
}

export interface ReceiptVisionService {
  describeReceipt(input: ReceiptVisionInput): Promise<string | null>;
}

interface ReceiptVisionResult {
  summary?: string;
  kind?: "expense" | "income" | "unknown";
  merchant?: string;
  amount?: number | null;
  currency?: string | null;
  date?: string | null;
  paymentAccountHint?: string | null;
  note?: string | null;
  confidence?: "high" | "medium" | "low";
  needsUserConfirmation?: boolean;
  missingFields?: string[];
}

export class ModelReceiptVisionService implements ReceiptVisionService {
  constructor(private readonly config: AppConfig) {}

  async describeReceipt(input: ReceiptVisionInput): Promise<string | null> {
    if (!supportsVision(input.media) || this.config.modelApiKey === "dummy") {
      return null;
    }

    const raw = await this.runVisionPrompt(input);
    const parsed = parseVisionResult(raw);
    if (!parsed) {
      return null;
    }

    return renderReceiptSummary(parsed);
  }

  private async runVisionPrompt(input: ReceiptVisionInput): Promise<string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.modelApiKey}`,
    };

    if (this.config.modelBaseUrl.includes("openrouter.ai")) {
      headers["HTTP-Referer"] = "https://gullak.mrkaran.dev";
      headers["X-Title"] = "Gullak";
    }

    const response = await fetch(buildChatCompletionsUrl(this.config.modelBaseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: this.config.modelId,
        temperature: 0,
        max_tokens: 350,
        messages: [
          {
            role: "system",
            content: [
              {
                type: "text",
                text: [
                  "You extract transaction details from receipt or bill images for a personal ledger assistant.",
                  "Return ONLY a JSON object with keys:",
                  "summary, kind, merchant, amount, currency, date, paymentAccountHint, note, confidence, needsUserConfirmation, missingFields.",
                  "summary must be a short natural-language line suitable to pass into a finance assistant.",
                  "Use null for unknown scalar fields, [] for unknown missingFields.",
                  "Infer currency if obvious from the receipt.",
                  "If the image is not a financial receipt/bill/invoice, set kind to unknown and explain in summary.",
                ].join(" "),
              },
            ],
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: [
                  "Extract the transaction details from this image.",
                  `User caption: ${input.caption?.trim() || "(none)"}`,
                  "Prefer the final paid amount, merchant/payee, date, and any obvious payment rail or card hint.",
                ].join("\n"),
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${input.media.mimetype || "image/jpeg"};base64,${input.media.data}`,
                },
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      throw new Error(`Receipt vision request failed with status ${response.status}`);
    }

    const payload = await response.json() as Record<string, unknown>;
    const content = extractResponseText(payload);
    if (!content) {
      throw new Error("Receipt vision response was empty.");
    }

    return content;
  }
}

function supportsVision(media: WhatsAppMediaPayload): boolean {
  return media.type === "image" && Boolean(media.data) && (media.mimetype?.startsWith("image/") ?? true);
}

function buildChatCompletionsUrl(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }

  return `${normalized}/chat/completions`;
}

function extractResponseText(payload: Record<string, unknown>): string {
  const choice = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
  const message = typeof choice === "object" && choice
    ? (choice as { message?: { content?: unknown } }).message
    : undefined;
  const content = message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .flatMap((block) => {
        if (!block || typeof block !== "object") {
          return [];
        }

        const text = (block as { type?: unknown; text?: unknown }).type === "text"
          ? (block as { text?: unknown }).text
          : undefined;
        return typeof text === "string" ? [text] : [];
      })
      .join("\n")
      .trim();
  }

  return "";
}

function parseVisionResult(raw: string): ReceiptVisionResult | null {
  const normalized = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  const start = normalized.indexOf("{");
  const end = normalized.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }

  try {
    return JSON.parse(normalized.slice(start, end + 1)) as ReceiptVisionResult;
  } catch {
    return null;
  }
}

function renderReceiptSummary(result: ReceiptVisionResult): string | null {
  const summary = result.summary?.trim();
  const amount = typeof result.amount === "number" && Number.isFinite(result.amount)
    ? `${result.amount} ${result.currency?.trim() || ""}`.trim()
    : undefined;
  const merchant = result.merchant?.trim();
  const date = result.date?.trim();
  const paymentHint = result.paymentAccountHint?.trim();
  const note = result.note?.trim();
  const parts: string[] = [];

  if (summary) {
    parts.push(summary);
  } else {
    if (result.kind === "income") {
      parts.push("Receipt image suggests income");
    } else if (result.kind === "expense") {
      parts.push("Receipt image suggests an expense");
    } else {
      parts.push("Receipt image extracted details");
    }

    if (amount) {
      parts.push(`amount ${amount}`);
    }
    if (merchant) {
      parts.push(`merchant ${merchant}`);
    }
    if (date) {
      parts.push(`date ${date}`);
    }
    if (paymentHint) {
      parts.push(`payment ${paymentHint}`);
    }
    if (note) {
      parts.push(`note ${note}`);
    }
  }

  const text = parts.join(", ").trim();
  if (!text) {
    return null;
  }

  const needsConfirmation = result.needsUserConfirmation || result.confidence === "low";
  return needsConfirmation
    ? `Parsed from receipt image (please verify): ${text}`
    : `Parsed from receipt image: ${text}`;
}
