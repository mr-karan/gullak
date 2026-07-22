import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { ZodError } from "zod";

import type { AppConfig } from "./config.ts";
import type { Db } from "./db/index.ts";
import { accountsRouter } from "./routes/accounts.ts";
import { aiRouter } from "./routes/ai.ts";
import { budgetRouter } from "./routes/budget.ts";
import { budgetsRouter } from "./routes/budgets.ts";
import { calendarRouter } from "./routes/calendar.ts";
import { categoriesRouter } from "./routes/categories.ts";
import { desiresRouter } from "./routes/desires.ts";
import { exportRouter } from "./routes/export.ts";
import { feedbackRouter } from "./routes/feedback.ts";
import { goalsRouter } from "./routes/goals.ts";
import { healthRouter } from "./routes/health.ts";
import { holdingsRouter } from "./routes/holdings.ts";
import { insightsRouter } from "./routes/insights.ts";
import { netWorthRouter } from "./routes/networth.ts";
import { profilesRouter } from "./routes/profiles.ts";
import {
  messagesRouter,
  whatsappInboxRouter,
  whatsappRouter,
} from "./routes/messages.ts";
import { rateLimit } from "./middleware/rate_limit.ts";
import { payeesRouter } from "./routes/payees.ts";
import { recurrencesRouter } from "./routes/recurrences.ts";
import { rulesRouter } from "./routes/rules.ts";
import { sheetsRouter } from "./routes/sheets.ts";
import { smsRouter } from "./routes/sms.ts";
import { summaryRouter } from "./routes/summary.ts";
import { syncV2Router } from "./routes/sync_v2.ts";
import { transactionsRouter } from "./routes/transactions.ts";
import { webRouter } from "./routes/web.ts";

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

  // Cap request bodies so a huge payload (e.g. an oversized receipt-image
  // base64) can't exhaust memory. 15 MB is generous for a phone photo.
  app.use(
    "*",
    bodyLimit({
      maxSize: 15 * 1024 * 1024,
      onError: (c) => c.json({ error: "Payload too large" }, 413),
    }),
  );

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
    // The static web PWA (shell + assets) must load without a key so the user
    // can reach the Settings modal to enter one. Only the /v1/* API is gated;
    // the browser attaches the key from localStorage on those calls itself.
    if (!path.startsWith("/v1/")) return next();
    if (path === "/v1/health" || path.endsWith("/whatsapp/webhook")) {
      return next();
    }
    if (c.req.header("x-api-key") !== key) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    return next();
  });

  // Cost guards on the LLM-driven surfaces. These spend model tokens per call
  // and/or write financial rows: /v1/ai/* (draft parsing), the auth-exempt
  // WhatsApp webhook (agent log-path), and /v1/messages (the multi-turn agent —
  // the costliest surface, which also writes transactions). All get a
  // fixed-window cap. trustProxy gates whether X-Forwarded-For is believed.
  const trustProxy = ctx.config.trustProxy;
  app.use(
    "/v1/ai/*",
    rateLimit({
      max: ctx.config.rateLimit.aiPerMinute,
      windowMs: 60_000,
      bucket: "ai",
      trustProxy,
    }),
  );
  // Hono's use(path) matches the EXACT path (no implicit prefix), so the
  // model-invoking/writing message endpoints each need the limiter registered
  // explicitly — and it must be the SAME instance, since the counter lives in
  // the middleware closure and the three surfaces should share one budget.
  // GET /v1/messages/threads* stays uncapped: cheap authed reads for history.
  const messagesLimiter = rateLimit({
    max: ctx.config.rateLimit.aiPerMinute,
    windowMs: 60_000,
    bucket: "messages",
    trustProxy,
  });
  app.use("/v1/messages", messagesLimiter);
  app.use("/v1/messages/stream", messagesLimiter);
  app.use("/v1/messages/action", messagesLimiter);
  app.use(
    "/v1/whatsapp/webhook",
    rateLimit({
      max: ctx.config.rateLimit.webhookPerMinute,
      windowMs: 60_000,
      bucket: "webhook",
      trustProxy,
    }),
  );

  // AI is optional: refuse /v1/ai/* cleanly when no real model key is set,
  // rather than calling a provider with a "dummy" key and failing opaquely.
  app.use("/v1/ai/*", async (c, next) => {
    if (!ctx.config.ai.enabled) {
      return c.json({ error: "AI is not configured on this server" }, 503);
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
  // Envelope-budgeting plan (assigned/activity/available + Ready-to-Assign).
  // Distinct from the raw /v1/budgets CRUD router above.
  app.route("/v1/budget", budgetRouter);
  app.route("/v1/recurrences", recurrencesRouter);
  app.route("/v1/summary", summaryRouter);
  // Mounted at /v1/calendar (not /v1/summary/calendar) so it can't be shadowed
  // by the summary router.
  app.route("/v1/calendar", calendarRouter);
  app.route("/v1/insights", insightsRouter);
  app.route("/v1/rules", rulesRouter);
  app.route("/v1/sync/v2", syncV2Router);
  app.route("/v1/sheets", sheetsRouter);
  app.route("/v1/export", exportRouter);
  app.route("/v1/messages", messagesRouter);
  // More-specific route first so /webhook in whatsappRouter doesn't
  // shadow the inbox candidate queue.
  app.route("/v1/whatsapp/inbox-candidates", whatsappInboxRouter);
  app.route("/v1/whatsapp", whatsappRouter);
  app.route("/v1/ai", aiRouter);
  app.route("/v1/sms", smsRouter);
  app.route("/v1/feedback", feedbackRouter);
  // M5 money-manager surfaces (server-only, x-api-key gated like everything).
  app.route("/v1/holdings", holdingsRouter);
  app.route("/v1/goals", goalsRouter);
  app.route("/v1/desires", desiresRouter);
  app.route("/v1/net-worth", netWorthRouter);
  app.route("/v1/profiles", profilesRouter);

  // The web SPA (webapp/dist). Mounted last so it can never shadow a /v1/*
  // route; it serves the app shell, hashed static assets, and a history-mode
  // fallback for everything else.
  app.route("/", webRouter);

  app.onError((error, c) => {
    // Validation errors are the client's fault → 400 with safe field info.
    if (error instanceof ZodError) {
      return c.json(
        {
          error: "Invalid request",
          issues: error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        400,
      );
    }
    // Everything else: log the detail server-side, return a generic message so
    // internal errors (provider responses, stack traces, secrets) never leak.
    console.error("unhandled error:", error);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.notFound((c) => c.json({ error: "Not found" }, 404));

  return app;
}
