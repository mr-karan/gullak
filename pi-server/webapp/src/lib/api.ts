// Same-origin pi-server /v1/* client. Reads the SAME localStorage keys the
// legacy Alpine app used, so a user's existing session carries over untouched.
// Money in the API is integer minor units; this client is transport only.

export const API_KEY_STORAGE = "gullak_api_key";
export const SERVER_URL_STORAGE = "gullak_server_url";

/** Fired when any gated call returns 401 so the shell can open the connect UI. */
export const UNAUTHORIZED_EVENT = "gullak:unauthorized";

export function getApiKey(): string {
  return localStorage.getItem(API_KEY_STORAGE) ?? "";
}

export function getServerUrl(): string {
  // Empty string => same-origin relative requests (the common case).
  return (localStorage.getItem(SERVER_URL_STORAGE) ?? "").replace(/\/$/, "");
}

export function isConnected(): boolean {
  return Boolean(getApiKey());
}

export function setCredentials(apiKey: string, serverUrl: string): void {
  localStorage.setItem(API_KEY_STORAGE, apiKey.trim());
  const url = serverUrl.trim().replace(/\/$/, "");
  if (url) localStorage.setItem(SERVER_URL_STORAGE, url);
  else localStorage.removeItem(SERVER_URL_STORAGE);
}

export function clearCredentials(): void {
  localStorage.removeItem(API_KEY_STORAGE);
  localStorage.removeItem(SERVER_URL_STORAGE);
}

/** Probe a candidate key/URL WITHOUT persisting them. Confirms the URL resolves
    (auth-exempt health) and the key is accepted (gated summary). Throws ApiError
    on any failure so callers can keep the previous working credentials. Does not
    dispatch UNAUTHORIZED_EVENT — verification failure is a local dialog concern,
    not a session expiry. */
export async function verifyCredentials(apiKey: string, serverUrl: string): Promise<void> {
  const base = serverUrl.trim().replace(/\/$/, "");
  const key = apiKey.trim();
  let health: Response;
  try {
    health = await fetch(`${base}/v1/health`);
  } catch {
    throw new ApiError("Could not reach the server.", 0);
  }
  if (!health.ok) throw new ApiError(`Server unreachable (${health.status}).`, health.status);
  let gated: Response;
  try {
    gated = await fetch(`${base}/v1/summary`, { headers: { "x-api-key": key } });
  } catch {
    throw new ApiError("Could not reach the server.", 0);
  }
  if (gated.status === 401) throw new ApiError("Unauthorized — check your API key.", 401);
  if (!gated.ok) throw new ApiError(`Request failed (${gated.status}).`, gated.status);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function authHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  const key = getApiKey();
  if (key) headers.set("x-api-key", key);
  return headers;
}

async function handle(res: Response): Promise<unknown> {
  if (res.status === 401) {
    window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    throw new ApiError("Unauthorized — check your API key.", 401);
  }
  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: string } | null;
      detail = body?.error ?? "";
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(detail || `Request failed (${res.status})`, res.status);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = authHeaders(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const res = await fetch(`${getServerUrl()}${path}`, { ...init, headers });
  return (await handle(res)) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),

  /** Multipart upload (holdings xlsx, desire photos). The browser sets the
      multipart boundary itself, so we must NOT set Content-Type. */
  async upload<T>(path: string, file: File, field = "file"): Promise<T> {
    const fd = new FormData();
    fd.append(field, file);
    const res = await fetch(`${getServerUrl()}${path}`, {
      method: "POST",
      body: fd,
      headers: authHeaders(),
    });
    return (await handle(res)) as T;
  },

  /** Fetch protected image bytes with the api key and return an object URL.
      <img> cannot send x-api-key, so we fetch -> blob -> createObjectURL. The
      caller MUST revoke the returned URL when done. */
  async blobUrl(path: string): Promise<string> {
    const res = await fetch(`${getServerUrl()}${path}`, { headers: authHeaders() });
    if (!res.ok) throw new ApiError(`Image failed (${res.status})`, res.status);
    return URL.createObjectURL(await res.blob());
  },
};
