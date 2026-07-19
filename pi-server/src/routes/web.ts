import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

import type { AppEnv } from "../app.ts";

// Two front-ends can live in this repo:
//   1. pi-server/webapp/dist — the new Vite + React SPA (built output).
//   2. pi-server/web         — the legacy no-build Alpine PWA (still shipped).
// If the new SPA has been built, serve THAT (static assets + history-mode SPA
// fallback). Otherwise fall back to the legacy PWA so nothing regresses before
// the rewrite reaches parity. /v1/* is never touched by this router.
const thisDir = dirname(fileURLToPath(import.meta.url));
const webappDist = join(thisDir, "..", "..", "webapp", "dist"); // src/routes -> pi-server/webapp/dist
const webDir = join(thisDir, "..", "..", "web"); // src/routes -> pi-server/web

// serveStatic's `root` resolves relative to process CWD (assumed pi-server/,
// same as the legacy mount below).
const webappStaticRoot = "./webapp/dist";
const legacyStaticRoot = "./web/static";

const hasWebapp = existsSync(join(webappDist, "index.html"));

export const webRouter = new Hono<AppEnv>();

function isApiOrLegacyStatic(path: string): boolean {
  return path.startsWith("/v1/") || path.startsWith("/static/");
}

if (hasWebapp) {
  // --- New Vite SPA -------------------------------------------------------
  const spaIndex = () => readFileSync(join(webappDist, "index.html"), "utf8");

  webRouter.get("/", (c) => c.html(spaIndex()));

  // Never let the built service worker script get cached; it gates updates.
  webRouter.get("/sw.js", (c) => {
    c.header("Content-Type", "text/javascript");
    c.header("Cache-Control", "no-cache");
    return c.body(readFileSync(join(webappDist, "sw.js")));
  });

  // Hashed assets, icons, manifest, registerSW — served straight from dist.
  webRouter.use("*", serveStatic({ root: webappStaticRoot }));

  // History-mode SPA fallback: any other non-API GET returns the app shell so a
  // hard refresh on /transactions survives. API paths stay a JSON 404.
  webRouter.get("*", (c) => {
    if (isApiOrLegacyStatic(c.req.path)) return c.json({ error: "Not found" }, 404);
    return c.html(spaIndex());
  });
} else {
  // --- Legacy Alpine PWA (unchanged behaviour) ----------------------------
  const readWebFile = (rel: string): string => readFileSync(join(webDir, rel), "utf8");
  const indexHtml = () => readWebFile("index.html");
  const offlineHtml = () => readWebFile("offline.html");

  webRouter.get("/", (c) => c.html(indexHtml()));
  webRouter.get("/offline", (c) => c.html(offlineHtml()));

  webRouter.get("/manifest.json", (c) => {
    c.header("Content-Type", "application/manifest+json");
    return c.body(readWebFile("static/manifest.json"));
  });

  webRouter.get("/sw.js", (c) => {
    c.header("Content-Type", "text/javascript");
    c.header("Cache-Control", "no-cache");
    return c.body(readWebFile("static/sw.js"));
  });

  webRouter.use(
    "/static/*",
    serveStatic({ root: legacyStaticRoot, rewriteRequestPath: (p) => p.replace(/^\/static/, "") }),
  );
}
