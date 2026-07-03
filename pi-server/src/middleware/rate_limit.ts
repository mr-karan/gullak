import { getConnInfo } from "@hono/node-server/conninfo";
import type { MiddlewareHandler } from "hono";

import type { AppEnv } from "../app.ts";

/// A tiny in-process fixed-window rate limiter. This is a single-user,
/// self-hosted server, so the goal is not multi-tenant fairness — it's a
/// backstop against LLM cost explosion and DB thrashing if the AI or webhook
/// endpoints are hammered (e.g. an open webhook, a runaway client, or a leaked
/// key).
///
/// Keyed by the TCP socket's remote address, NOT the X-Forwarded-For header:
/// XFF is client-forgeable, so keying on it lets an attacker rotate the header
/// to mint a fresh bucket per request and bypass the cap entirely — defeating
/// the backstop this exists to be. Only when the server sits behind a trusted
/// reverse proxy (config.trustProxy) do we read the client IP from XFF; then
/// the socket address is the proxy and everyone would otherwise share one
/// bucket. Falls back to a single global bucket when the peer address is
/// unavailable.

interface Window {
  count: number;
  resetAt: number;
}

export function rateLimit(opts: {
  /** Max requests allowed per window. <= 0 disables the limiter. */
  max: number;
  windowMs: number;
  /** Distinguishes buckets so /v1/ai and the webhook don't share a counter. */
  bucket: string;
  /** Honor X-Forwarded-For (only safe behind a trusted reverse proxy). */
  trustProxy: boolean;
}): MiddlewareHandler<AppEnv> {
  const windows = new Map<string, Window>();

  return async (c, next) => {
    if (opts.max <= 0) return next();

    let ip: string;
    if (opts.trustProxy) {
      ip =
        c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ||
        c.req.header("x-real-ip") ||
        getConnInfo(c).remote.address ||
        "global";
    } else {
      ip = getConnInfo(c).remote.address || "global";
    }
    const key = `${opts.bucket}:${ip}`;
    const now = Date.now();

    let w = windows.get(key);
    if (!w || now >= w.resetAt) {
      w = { count: 0, resetAt: now + opts.windowMs };
      windows.set(key, w);
    }
    w.count += 1;

    if (w.count > opts.max) {
      const retryAfterS = Math.max(1, Math.ceil((w.resetAt - now) / 1000));
      c.header("retry-after", String(retryAfterS));
      return c.json({ error: "Too many requests" }, 429);
    }

    // Sweep expired windows whenever a new one is created, so the Map tracks
    // only currently-active peers (tiny on a single-user server).
    if (w.count === 1) {
      for (const [k, v] of windows) {
        if (now >= v.resetAt) windows.delete(k);
      }
    }

    return next();
  };
}
