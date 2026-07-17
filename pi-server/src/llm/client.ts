import type { AppConfig } from "../config.ts";

/// One thin wrapper over the OpenAI-compatible /chat/completions API
/// that every server-side LLM caller uses. The app no longer talks to
/// any model directly — the homelab pi-server is the single trusted
/// box that holds the API key and decides which model to use, so this
/// file is the only place the actual fetch lives.

/// Thrown when the model's HTTP call succeeded but its body wasn't usable
/// JSON. Callers (e.g. the SMS parser) catch this specifically to retry with a
/// corrective nudge — as opposed to transport/timeout errors, which shouldn't
/// be re-prompted.
export class LlmOutputError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LlmOutputError";
  }
}

/// Thrown when the LLM endpoint returns a non-2xx (402 out-of-credits, 429,
/// 5xx, …). Distinct from LlmOutputError: the model never judged the input, so
/// callers treat it as OPERATIONAL/retryable (keep the SMS queued) rather than
/// a terminal content failure.
export class LlmHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "LlmHttpError";
  }
}

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
  /// Cap the completion size. Critical on OpenRouter: an UNSET max_tokens
  /// defaults to the model's full output window (e.g. 65536) and OpenRouter
  /// gates your balance against that whole number upfront — so a request 402s
  /// ("requires more credits") the moment your balance dips below it, even
  /// though the actual JSON reply is ~100 tokens. Every caller here emits a
  /// small JSON object or a short chat reply, so a tight default is correct.
  maxTokens?: number;
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
  // Bound every call so a hung upstream (Ollama, OpenRouter) can't pin the
  // request forever and stack up behind the global body limit. The ceiling is
  // generous because vision/receipt calls are legitimately slow.
  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.modelApiKey}`,
        accept: "application/json",
      },
      body: JSON.stringify({
        model: config.modelId,
        temperature: opts.temperature ?? 0.1,
        // Default 2048: generous for a parse's JSON object or a short chat
        // reply, but 32x below the 65536 model max — so the OpenRouter
        // credit-headroom gate needs 2048, not 65536, of balance per request.
        max_tokens: opts.maxTokens ?? 2048,
        response_format: { type: "json_object" },
        messages,
      }),
      signal: AbortSignal.timeout(config.modelTimeoutMs),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error(`LLM request timed out after ${config.modelTimeoutMs}ms`);
    }
    throw e;
  }
  if (!r.ok) {
    const body = await r.text();
    throw new LlmHttpError(r.status, `LLM ${r.status}: ${body.slice(0, 200)}`);
  }
  const json = (await r.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const raw = json.choices?.[0]?.message?.content ?? "";
  return parseJsonObject<T>(raw);
}

/// One OpenAI-style function tool the model may call.
export interface ChatTool {
  name: string;
  description: string;
  /// JSON Schema for the arguments object.
  parameters: Record<string, unknown>;
}

/// A tool call the model asked us to run.
export interface ChatToolCall {
  id: string;
  name: string;
  /// Raw JSON string of arguments as emitted by the model.
  arguments: string;
}

export interface ChatToolsOptions {
  system: string;
  user: string;
  history?: { role: string; content: string }[];
  tools: ChatTool[];
  temperature?: number;
  maxTokens?: number;
  /// Cap on model → tool → model round-trips before we give up. Prevents a
  /// misbehaving model from looping tool calls forever.
  maxIterations?: number;
  /// Executes one tool call and returns a string result fed back to the model.
  /// Read-only by contract — the agent must never mutate financial rows here.
  runTool: (call: ChatToolCall) => string | Promise<string>;
}

/// Multi-turn tool-calling loop over the OpenAI-compatible chat API. The model
/// emits `tool_calls`; we run each via `runTool`, feed the results back as
/// `tool` messages, and repeat until the model returns a plain text answer (or
/// we hit `maxIterations`). Shares the same auth, timeout, max_tokens cap, and
/// error types as chatJson — the only place a real fetch to the model lives.
export async function chatTools(
  config: AppConfig,
  opts: ChatToolsOptions,
): Promise<string> {
  const url = `${stripTrailingSlash(config.modelBaseUrl)}/chat/completions`;
  const maxIterations = opts.maxIterations ?? 5;
  // Full mutable transcript: system + history + user, then grows with the
  // model's assistant turns and our tool-result turns each iteration.
  const messages: Record<string, unknown>[] = [
    { role: "system", content: opts.system },
    ...(opts.history ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: "user", content: opts.user },
  ];
  const tools = opts.tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));

  for (let iter = 0; iter < maxIterations; iter++) {
    const message = await postChat(config, url, {
      model: config.modelId,
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.maxTokens ?? 2048,
      messages,
      tools,
      tool_choice: "auto",
    });

    const toolCalls = extractToolCalls(message);
    if (toolCalls.length === 0) {
      // No tool call — the model produced its final answer.
      const content = typeof message.content === "string" ? message.content : "";
      return content;
    }

    // Record the assistant turn verbatim so the follow-up tool messages
    // reference the right tool_call ids.
    messages.push(message as unknown as Record<string, unknown>);
    for (const call of toolCalls) {
      let result: string;
      try {
        result = await opts.runTool(call);
      } catch (e) {
        result = `Tool error: ${e instanceof Error ? e.message : String(e)}`;
      }
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
  }
  // Exhausted iterations without a final answer. Ask for a wrap-up with no
  // further tools so the loop always terminates in text.
  const finalMessage = await postChat(config, url, {
    model: config.modelId,
    temperature: opts.temperature ?? 0.1,
    max_tokens: opts.maxTokens ?? 2048,
    messages: [
      ...messages,
      {
        role: "user",
        content:
          "Answer now using the tool results above. Do not call any more tools.",
      },
    ],
  });
  return typeof finalMessage.content === "string" ? finalMessage.content : "";
}

interface ChatMessage {
  content?: unknown;
  tool_calls?: {
    id?: string;
    function?: { name?: string; arguments?: string };
  }[];
}

async function postChat(
  config: AppConfig,
  url: string,
  body: Record<string, unknown>,
): Promise<ChatMessage> {
  let r: Response;
  try {
    r = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.modelApiKey}`,
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.modelTimeoutMs),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      throw new Error(`LLM request timed out after ${config.modelTimeoutMs}ms`);
    }
    throw e;
  }
  if (!r.ok) {
    const errBody = await r.text();
    throw new LlmHttpError(r.status, `LLM ${r.status}: ${errBody.slice(0, 200)}`);
  }
  const json = (await r.json()) as {
    choices?: { message?: ChatMessage }[];
  };
  return json.choices?.[0]?.message ?? {};
}

function extractToolCalls(message: ChatMessage): ChatToolCall[] {
  const calls = message.tool_calls ?? [];
  return calls
    .map((c, i) => ({
      id: c.id ?? `call_${i}`,
      name: c.function?.name ?? "",
      arguments: c.function?.arguments ?? "{}",
    }))
    .filter((c) => c.name.length > 0);
}

function parseJsonObject<T>(raw: string): T {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new LlmOutputError(`LLM returned non-JSON: ${text.slice(0, 120)}`);
  }
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch (cause) {
    // Malformed JSON (e.g. an Indian-comma number like 6,275) is recoverable:
    // the parser re-prompts on LlmOutputError. We deliberately do NOT hand-
    // repair it — silently rewriting 6,275→6275 could log a wrong amount.
    // Include a raw-output snippet so a logged failure shows what the model
    // actually returned.
    throw new LlmOutputError(
      `LLM returned malformed JSON: ${text.slice(0, 200)}`,
      { cause },
    );
  }
}

function stripTrailingSlash(s: string): string {
  return s.endsWith("/") ? s.slice(0, -1) : s;
}
