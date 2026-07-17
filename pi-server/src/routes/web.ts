import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

import type { AppEnv } from "../app.ts";

// The flattened legacy PWA lives in pi-server/web/ (index.html + static/).
// serveStatic's `root` is resolved relative to the process CWD, which is not
// guaranteed to be pi-server/, so compute the web dir from this module's
// location and hand serveStatic a CWD-relative root.
const thisDir = dirname(fileURLToPath(import.meta.url));
const webDir = join(thisDir, "..", "..", "web"); // src/routes -> pi-server/web
const staticRoot = "./web/static";

function readWebFile(rel: string): string {
  return readFileSync(join(webDir, rel), "utf8");
}

export const webRouter = new Hono<AppEnv>();

// SPA shell. Served at "/" and as the fallback for unknown non-/v1, non-/static
// paths so client-side hash routing survives a hard refresh.
const indexHtml = () => readWebFile("index.html");
const offlineHtml = () => readWebFile("offline.html");

webRouter.get("/", (c) => c.html(indexHtml()));

webRouter.get("/offline", (c) => c.html(offlineHtml()));

// PWA files the app + service worker request at the origin root.
webRouter.get("/manifest.json", (c) => {
  c.header("Content-Type", "application/manifest+json");
  return c.body(readWebFile("static/manifest.json"));
});

webRouter.get("/sw.js", (c) => {
  c.header("Content-Type", "text/javascript");
  // Never let a stale service worker script get cached; it gates every update.
  c.header("Cache-Control", "no-cache");
  return c.body(readWebFile("static/sw.js"));
});

// Hashed/static assets (css, js, icons, manifest, sw copy).
webRouter.use("/static/*", serveStatic({ root: staticRoot, rewriteRequestPath: (p) => p.replace(/^\/static/, "") }));
