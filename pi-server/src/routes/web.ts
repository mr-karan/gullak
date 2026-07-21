import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

import type { AppEnv } from "../app.ts";

// Serves the Vite + React SPA built into pi-server/webapp/dist: static assets
// plus a history-mode SPA fallback. /v1/* is never touched by this router.
const thisDir = dirname(fileURLToPath(import.meta.url));
const webappDist = join(thisDir, "..", "..", "webapp", "dist"); // src/routes -> pi-server/webapp/dist

// serveStatic's `root` resolves relative to process CWD. Passing an ABSOLUTE
// root (derived from this module's location, not CWD) makes asset serving work
// no matter where the process was started from — e.g. `npm --prefix pi-server
// start` or launching from the repo root — instead of only from pi-server/.
const webappStaticRoot = webappDist;

export const webRouter = new Hono<AppEnv>();

// Exact `/v1` and everything under `/v1/` are the API's alone — the SPA/static
// layer must never answer for them.
function isApi(path: string): boolean {
  return path === "/v1" || path.startsWith("/v1/");
}

const spaIndex = () => readFileSync(join(webappDist, "index.html"), "utf8");

// Guard the API namespace BEFORE any static serving so nothing under /v1 can
// ever be answered by serveStatic or the SPA fallback (e.g. a stray
// dist/v1/*.json). Unmatched /v1 paths get a JSON 404, not HTML.
webRouter.use("*", async (c, next) => {
  if (isApi(c.req.path)) return c.json({ error: "Not found" }, 404);
  return next();
});

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
  if (isApi(c.req.path)) return c.json({ error: "Not found" }, 404);
  return c.html(spaIndex());
});
