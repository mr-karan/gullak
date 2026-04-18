import { randomUUID } from "node:crypto";

import { Agent } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, Message, ToolResultMessage, UserMessage } from "@mariozechner/pi-ai";
import { DateTime } from "luxon";

import type { AppConfig } from "../config.js";
import type { TransactionSource } from "../ledger/models.js";
import type { LedgerService } from "../ledger/service.js";
import type { StateStore } from "../state/store.js";
import { buildModel } from "./model.js";
import { buildSystemPrompt } from "./prompts.js";
import { createTools, type ToolDetails } from "./tools.js";

export interface MessageRequest {
  text: string;
  threadId?: string;
  source?: TransactionSource;
  sourceUser?: string;
  timestamp?: string;
}

export interface MessageResponse {
  threadId: string;
  reply: string;
  action?: ToolDetails["action"];
  transactionId?: string;
  needsClarification: boolean;
}

export class AgentService {
  constructor(
    private readonly config: AppConfig,
    private readonly ledgerService: LedgerService,
    private readonly stateStore: StateStore,
  ) {}

  async handleMessage(request: MessageRequest): Promise<MessageResponse> {
    const threadId = request.threadId ?? `${request.source ?? "http"}:${randomUUID().slice(0, 8)}`;
    const thread = await this.stateStore.getThread(threadId);
    const accounts = await this.ledgerService.listAccounts();
    const commonAccounts = await this.ledgerService.getCommonAccounts();
    const lastTransactionId = await this.stateStore.getLastTransactionId(threadId);
    const lastTransaction = lastTransactionId
      ? await this.ledgerService.getTransactionById(lastTransactionId)
      : undefined;

    const agent = new Agent({
      initialState: {
        systemPrompt: buildSystemPrompt({
          today: DateTime.now().setZone(this.config.timezone).toISODate() ?? "unknown",
          timezone: this.config.timezone,
          knownAccounts: accounts,
          commonPaymentAccounts: commonAccounts.paymentAccounts,
          commonExpenseAccounts: commonAccounts.expenseAccounts,
          lastTransaction,
        }),
        model: buildModel(this.config),
        thinkingLevel: this.config.modelThinkingLevel,
        tools: createTools({
          config: this.config,
          ledgerService: this.ledgerService,
          stateStore: this.stateStore,
          threadId,
          source: request.source ?? "http",
          sourceUser: request.sourceUser,
        }),
        messages: thread.messages,
      },
      toolExecution: "sequential",
      getApiKey: async () => this.config.modelApiKey,
      transformContext: async (messages) => messages.slice(-24),
    });

    const userMessage: UserMessage = {
      role: "user",
      content: request.text,
      timestamp: request.timestamp
        ? DateTime.fromISO(request.timestamp).toMillis()
        : Date.now(),
    };

    await agent.prompt(userMessage);

    const messages = agent.state.messages.slice(-24) as Message[];
    const assistantMessage = findLastAssistantMessage(messages);
    const lastToolResult = findLastToolResult(messages);
    const persistedLastTransactionId = await this.stateStore.getLastTransactionId(threadId);

    await this.stateStore.saveThread(threadId, messages, persistedLastTransactionId);

    const reply = assistantMessage ? extractAssistantText(assistantMessage) : "I could not process that.";
    return {
      threadId,
      reply,
      action: lastToolResult?.details?.action,
      transactionId: lastToolResult?.details?.transaction?.id ?? lastToolResult?.details?.deletedId,
      needsClarification: !lastToolResult,
    };
  }
}

function findLastAssistantMessage(messages: Message[]): AssistantMessage | undefined {
  return [...messages].reverse().find((message): message is AssistantMessage => message.role === "assistant");
}

function findLastToolResult(messages: Message[]): ToolResultMessage<ToolDetails> | undefined {
  return [...messages].reverse().find(
    (message): message is ToolResultMessage<ToolDetails> => message.role === "toolResult",
  );
}

function extractAssistantText(message: AssistantMessage): string {
  const text = message.content
    .filter((block): block is Extract<AssistantMessage["content"][number], { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  if (text) {
    return text;
  }

  return message.errorMessage ?? "Done.";
}
