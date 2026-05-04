import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import type { AppConfig } from "./config.ts";
import type { Db } from "./db/index.ts";
import { accountsRouter } from "./routes/accounts.ts";
import { budgetsRouter } from "./routes/budgets.ts";
import { categoriesRouter } from "./routes/categories.ts";
import { healthRouter } from "./routes/health.ts";
import { messagesRouter, whatsappRouter } from "./routes/messages.ts";
import { payeesRouter } from "./routes/payees.ts";
import { recurrencesRouter } from "./routes/recurrences.ts";
import { summaryRouter } from "./routes/summary.ts";
import { syncRouter } from "./routes/sync.ts";
import { transactionsRouter } from "./routes/transactions.ts";

export type AppEnv = {
  Variables: {
    db: Db;
    config: AppConfig;
  };
};

export interface AppContext {
  db: Db;
  config: AppConfig;
}

export function createApp(ctx: AppContext) {
  const app = new Hono<AppEnv>();

  app.use("*", logger());
  app.use("*", cors());

  app.use("*", async (c, next) => {
    c.set("db", ctx.db);
    c.set("config", ctx.config);
    await next();
  });

  // API key gate. /v1/health and the WhatsApp webhook are exempt so
  // monitoring and the bridge can hit us without auth.
  app.use("*", async (c, next) => {
    const key = ctx.config.httpApiKey;
    if (!key) return next();
    const path = c.req.path;
    if (path === "/v1/health" || path.endsWith("/whatsapp/webhook")) {
      return next();
    }
    if (c.req.header("x-api-key") !== key) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  });

  app.route("/v1/health", healthRouter);
  app.route("/v1/accounts", accountsRouter);
  app.route("/v1/category-groups", categoriesRouter.groups);
  app.route("/v1/categories", categoriesRouter.categories);
  app.route("/v1/payees", payeesRouter);
  app.route("/v1/transactions", transactionsRouter);
  app.route("/v1/budgets", budgetsRouter);
  app.route("/v1/recurrences", recurrencesRouter);
  app.route("/v1/summary", summaryRouter);
  app.route("/v1/sync", syncRouter);
  app.route("/v1/messages", messagesRouter);
  app.route("/v1/whatsapp", whatsappRouter);

  app.onError((error, c) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    return c.json({ error: message }, 500);
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  return app;
}
