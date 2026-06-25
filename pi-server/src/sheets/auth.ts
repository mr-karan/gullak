import { readFileSync } from "node:fs";

// Minimal Google service-account auth: sign a JWT with the SA private key
// (RS256) and exchange it for an access token. Avoids pulling in the heavy
// `googleapis` package — Bun's Web Crypto handles the signing.

export interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/** Load a service account from inline JSON (starts with "{") or a file path. */
export function loadServiceAccount(keyOrPath: string): ServiceAccount {
  const trimmed = keyOrPath.trim();
  const raw = trimmed.startsWith("{") ? trimmed : readFileSync(trimmed, "utf8");
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) {
    throw new Error("service account JSON missing client_email/private_key");
  }
  return sa;
}

function base64Url(input: ArrayBuffer | Uint8Array | string): string {
  let bytes: Uint8Array;
  if (typeof input === "string") {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  }
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function pemToPkcs8(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  return Buffer.from(body, "base64").buffer as ArrayBuffer;
}

// Cache per client_email so token exchange only happens ~hourly.
const tokenCache = new Map<string, { token: string; expEpoch: number }>();

export async function getAccessToken(
  sa: ServiceAccount,
  scope: string,
): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(sa.client_email);
  if (cached && cached.expEpoch - 60 > nowSec) return cached.token;

  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: tokenUri,
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned),
  );
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) {
    throw new Error(`token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  tokenCache.set(sa.client_email, {
    token: json.access_token,
    expEpoch: nowSec + (json.expires_in ?? 3600),
  });
  return json.access_token;
}
