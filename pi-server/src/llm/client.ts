import type { AppConfig } from "../config.ts";

/// One thin wrapper over the OpenAI-compatible /chat/completions API
/// that every server-side LLM caller uses. The app no longer talks to
/// any model directly — the homelab pi-server is the single trusted
/// box that holds the API key and decides which model to use, so this
/// file is the only place the actual fetch lives.

export interface ChatJsonOptions {
  system: string;
  user: string;
  history?: { role: string; content: string }[];
  /// Multimodal: when set, the user message is sent as a content array
  /// with the text plus an image part. Image is `image/<mime>;base64,<data>`
  /// in OpenAI's format.
  imageBase64?: string;
  imageMimeType?: string;
  temperature?: number;
}

export async function chatJson<T = unknown>(
  config: AppConfig,
  opts: ChatJsonOptions,
): Promise<T> {
  const url = `${stripTrailingSlash(config.modelBaseUrl)}/chat/completions`;
  const userContent: unknown = opts.imageBase64
    ? [
        { type: "text", text: opts.user },
        {
          type: "image_url",
          image_url: {
            url: `data:${opts.imageMimeType ?? "image/jpeg"};base64,${opts.imageBase64}`,
          },
        },
      ]
    : opts.user;
  const messages: { role: string; content: unknown }[] = [
    { role: "system", content: opts.system },
    ...(opts.history ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: userContent },
  ];
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${config.modelApiKey}`,
      accept: "application/json",
    },
    body: JSON.stringify({
      model: config.modelId,
      temperature: opts.temperature ?? 0.1,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`LLM ${r.status}: ${body.slice(0, 200)}`);
  }
  const json = (await r.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  return parseJsonObject<T>(raw);
}

function parseJsonObject<T>(raw: string): T {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error(`LLM returned non-JSON: ${text.slice(0, 120)}`);
  }
  return JSON.parse(text.slice(start, end + 1)) as T;
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
