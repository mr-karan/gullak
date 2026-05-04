import { Hono } from "hono";

import type { AppEnv } from "../app.ts";

export const messagesRouter = new Hono<AppEnv>();

// Stub. The agent (pi-sdk + SQL-backed tools) will replace this in a
// follow-up — see TODO at the bottom of CLAUDE.md.
messagesRouter.post("/", (c) =>
  c.json(
    {
      error: "Agent not yet wired in this build.",
      hint:
        "POST /v1/transactions directly while the natural-language agent is being rebuilt.",
    },
    501,
  ),
);

export const whatsappRouter = new Hono<AppEnv>();
whatsappRouter.post("/webhook", (c) =>
  c.json(
    {
      error: "WhatsApp webhook handler not yet wired in this build.",
    },
    501,
  ),
);
