import { Hono } from "hono";

import type { AppEnv } from "../app.ts";

// The two household people. Ids are the hard enum ('karan' | 'wife');
// names/emoji come from config (GULLAK_PROFILES). Attribution, not auth —
// the API key is the household boundary.
export const profilesRouter = new Hono<AppEnv>();

profilesRouter.get("/", (c) => {
  return c.json({ profiles: c.get("config").profiles });
});
