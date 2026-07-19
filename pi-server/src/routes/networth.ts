import { Hono } from "hono";

import type { AppEnv } from "../app.ts";
import { computeNetWorth } from "../repos/networth.ts";

// Dedicated net-worth endpoint. Kept separate from /v1/summary so the Flutter
// app's existing summary calls stay fast and holdings-free.
export const netWorthRouter = new Hono<AppEnv>();

netWorthRouter.get("/", (c) => {
  return c.json(computeNetWorth(c.get("db")));
});
