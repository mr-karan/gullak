import express, { type NextFunction, type Request, type Response } from "express";

import type { Runtime } from "./runtime.js";

export function createApp(runtime: Runtime) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.use((request, response, next) => {
    if (!runtime.config.httpApiKey) {
      next();
      return;
    }

    if (request.path === "/health" || request.path.endsWith("/whatsapp/webhook")) {
      next();
      return;
    }

    if (request.header("x-api-key") !== runtime.config.httpApiKey) {
      response.status(401).json({ error: "Unauthorized" });
      return;
    }

    next();
  });

  app.get("/health", async (_request, response) => {
    response.json({
      status: (await runtime.validator.isCliAvailable()) ? "ok" : "degraded",
      version: runtime.config.version,
      ledgerCli: await runtime.validator.isCliAvailable(),
    });
  });

  app.post("/v1/messages", asyncHandler(async (request, response) => {
    const result = await runtime.agentService.handleMessage({
      text: String(request.body.text || ""),
      threadId: request.body.threadId,
      source: request.body.source,
      sourceUser: request.body.sourceUser,
    });
    response.json(result);
  }));

  app.get("/v1/accounts", asyncHandler(async (_request, response) => {
    response.json({ accounts: await runtime.ledgerService.listAccounts() });
  }));

  app.get("/v1/transactions", asyncHandler(async (request, response) => {
    const limit = request.query.limit ? Number.parseInt(String(request.query.limit), 10) : undefined;
    const transactions = await runtime.ledgerService.listTransactions({
      limit,
      startDate: asOptionalString(request.query.startDate),
      endDate: asOptionalString(request.query.endDate),
      payee: asOptionalString(request.query.payee),
      account: asOptionalString(request.query.account),
    });
    response.json({ transactions });
  }));

  app.patch("/v1/transactions/:id", asyncHandler(async (request, response) => {
    const updated = await runtime.ledgerService.updateTransaction(String(request.params.id), request.body);
    if (!updated) {
      response.status(404).json({ error: "Transaction not found" });
      return;
    }

    response.json({ transaction: updated });
  }));

  app.delete("/v1/transactions/:id", asyncHandler(async (request, response) => {
    const deleted = await runtime.ledgerService.deleteTransaction(String(request.params.id));
    if (!deleted) {
      response.status(404).json({ error: "Transaction not found" });
      return;
    }

    response.json({ deleted: true, transactionId: request.params.id });
  }));

  app.get("/v1/summary", asyncHandler(async (request, response) => {
    const summary = await runtime.ledgerService.getSummary({
      period: asOptionalString(request.query.period),
      startDate: asOptionalString(request.query.startDate),
      endDate: asOptionalString(request.query.endDate),
    });
    response.json(summary);
  }));

  app.post("/v1/recaps/weekly/run", asyncHandler(async (request, response) => {
    const recap = await runtime.weeklyRecapService.run({
      force: Boolean(request.body.force),
      sendWhatsapp: Boolean(request.body.sendWhatsapp),
    });
    response.json(recap);
  }));

  app.post("/v1/whatsapp/webhook", asyncHandler(async (request, response) => {
    response.json(await runtime.whatsappService.handleWebhook(request.body));
  }));

  app.post("/api/whatsapp/webhook", asyncHandler(async (request, response) => {
    response.json(await runtime.whatsappService.handleWebhook(request.body));
  }));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    response.status(500).json({ error: message });
  });

  return app;
}

function asyncHandler(
  handler: (request: Request, response: Response) => Promise<void>,
) {
  return (request: Request, response: Response, next: NextFunction) => {
    handler(request, response).catch(next);
  };
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
