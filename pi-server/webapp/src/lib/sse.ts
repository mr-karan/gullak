// Fetch-based Server-Sent Events reader. EventSource can only GET and can't set
// the x-api-key header, so streaming endpoints (POST /v1/messages/stream) are
// consumed here with the SAME auth/base-url conventions as lib/api.ts. Transport
// only; callers own the parsed event payloads.

import { ApiError, authHeaders, getServerUrl, UNAUTHORIZED_EVENT } from "./api";

interface SseHandlers {
  // Called once per named SSE event, in stream order. `data` is JSON.parsed.
  onEvent: (event: string, data: unknown) => void;
  signal?: AbortSignal;
}

/** POST a JSON body and stream back a text/event-stream response, invoking
    onEvent for each named event as it arrives. Mirrors api.ts error handling:
    401 dispatches UNAUTHORIZED_EVENT and throws ApiError; any other non-OK
    status throws ApiError with the server's `error` detail when present.
    Resolves when the stream closes. */
export async function postSse(path: string, body: unknown, handlers: SseHandlers): Promise<void> {
  const headers = authHeaders({ "Content-Type": "application/json" });
  const res = await fetch(`${getServerUrl()}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: handlers.signal,
  });

  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    throw new ApiError("Unauthorized — check your API key.", 401);
  }
  if (!res.ok || !res.body) {
    let detail = "";
    try {
      const errBody = (await res.json()) as { error?: string } | null;
      detail = errBody?.error ?? "";
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail || `Request failed (${res.status})`, res.status);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // SSE frames are separated by a blank line; accumulate bytes and dispatch each
  // complete frame, keeping any partial trailer in the buffer for the next read.
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = indexOfFrameEnd(buffer)) !== -1) {
      const frame = buffer.slice(0, sep);
      buffer = buffer.slice(sep).replace(/^(\r?\n){2}/, "");
      dispatchFrame(frame, handlers.onEvent);
    }
  }
  // Flush a trailing frame that wasn't newline-terminated at stream close.
  const tail = buffer.trim();
  if (tail) dispatchFrame(tail, handlers.onEvent);
}

// Index just before the blank-line frame separator (\n\n or \r\n\r\n), or -1.
function indexOfFrameEnd(buffer: string): number {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf === -1) return crlf;
  if (crlf === -1) return lf;
  return Math.min(lf, crlf);
}

// Parse a single SSE frame: `event:` names it, `data:` lines join with newlines,
// `:` lines are keep-alive comments. Emits nothing for a data-less frame.
function dispatchFrame(frame: string, onEvent: SseHandlers["onEvent"]): void {
  let event = "message";
  const dataLines: string[] = [];
  for (const raw of frame.split(/\r?\n/)) {
    if (!raw || raw.startsWith(":")) continue; // blank or keep-alive comment
    const colon = raw.indexOf(":");
    const field = colon === -1 ? raw : raw.slice(0, colon);
    // Per spec a single leading space after the colon is stripped.
    const rawVal = colon === -1 ? "" : raw.slice(colon + 1);
    const value = rawVal.startsWith(" ") ? rawVal.slice(1) : rawVal;
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }
  if (dataLines.length === 0) return;
  const payload = dataLines.join("\n");
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return; // ignore frames whose data isn't the JSON object the contract promises
  }
  onEvent(event, data);
}
