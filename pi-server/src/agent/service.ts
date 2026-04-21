import { randomUUID } from "node:crypto";

import { Agent } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, Message, ToolResultMessage, UserMessage } from "@mariozechner/pi-ai";
import { DateTime } from "luxon";

import type { AppConfig } from "../config.js";
import { formatAmount, type SimpleTransaction, type TransactionSource } from "../ledger/models.js";
import type { LedgerService } from "../ledger/service.js";
import type { ReplyContext, StateStore } from "../state/store.js";
import {
  inferReferencedTransactionIds,
  isBareSingleReference,
  rewriteContextualFollowup,
} from "./contextual-followup.js";
import { normalizeUserMessage } from "./message-normalizer.js";
import { buildModel } from "./model.js";
import { buildSystemPrompt } from "./prompts.js";
import { formatReplyFromTurn } from "./replies.js";
import { createTools, type ToolDetails } from "./tools.js";

export interface MessageRequest {
  text: string;
  threadId?: string;
  source?: TransactionSource;
  sourceUser?: string;
  timestamp?: string;
  quotedMessageId?: string;
}

export interface MessageResponse {
  threadId: string;
  reply: string;
  action?: ToolDetails["action"];
  transactionId?: string;
  referencedTransactionIds?: string[];
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
    const recentTransactionIds = await this.stateStore.getRecentTransactionIds(threadId, 5);
    const recentTransactions = (
      await Promise.all(recentTransactionIds.map((transactionId) => this.ledgerService.getTransactionById(transactionId)))
    ).filter((transaction): transaction is NonNullable<typeof transaction> => Boolean(transaction));
    const replyContext = request.quotedMessageId
      ? await this.stateStore.getReplyContext(threadId, request.quotedMessageId)
      : undefined;
    const followupTransactions = await this.resolveFollowupTransactions(
      replyContext,
      recentTransactions,
    );
    const normalizedUserContent = normalizeUserMessage(
      rewriteContextualFollowup(request.text, followupTransactions),
    );
    const userTimestamp = request.timestamp
      ? DateTime.fromISO(request.timestamp).toMillis()
      : Date.now();
    const directClarification = this.buildDeterministicClarification(
      request.text,
      replyContext,
      followupTransactions,
    );

    if (directClarification) {
      await this.persistSyntheticClarificationTurn(
        threadId,
        thread.messages,
        normalizedUserContent,
        userTimestamp,
        directClarification,
        lastTransactionId,
      );

      return {
        threadId,
        reply: directClarification,
        referencedTransactionIds: followupTransactions.map((transaction) => transaction.id),
        needsClarification: true,
      };
    }

    const agent = new Agent({
      initialState: {
        systemPrompt: buildSystemPrompt({
          today: DateTime.now().setZone(this.config.timezone).toISODate() ?? "unknown",
          timezone: this.config.timezone,
          knownAccounts: accounts,
          commonPaymentAccounts: commonAccounts.paymentAccounts,
          commonExpenseAccounts: commonAccounts.expenseAccounts,
          lastTransaction,
          recentTransactions,
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
      content: normalizedUserContent,
      timestamp: userTimestamp,
    };

    await agent.prompt(userMessage);

    const messages = agent.state.messages.slice(-24) as Message[];
    const assistantMessage = findLastAssistantMessage(messages);
    const turnToolResults = findTurnToolResults(messages, userMessage.timestamp, String(userMessage.content));
    const lastToolResult = turnToolResults.at(-1);
    const persistedLastTransactionId = await this.stateStore.getLastTransactionId(threadId);

    await this.stateStore.saveThread(threadId, messages, persistedLastTransactionId);

    const formattedReply = formatReplyFromTurn(
      turnToolResults
        .map((message) => message.details)
        .filter((details): details is ToolDetails => Boolean(details)),
    );
    const assistantText = assistantMessage ? extractAssistantText(assistantMessage) : undefined;
    const needsClarification = turnToolResults.length === 0 || looksLikeClarification(assistantText);
    const reply = formattedReply
      ? needsClarification && assistantText
        ? `${formattedReply}\n\n${assistantText}`
        : formattedReply
      : assistantText ?? "I could not process that.";
    const toolTransactions = extractToolTransactions(
      turnToolResults
        .map((message) => message.details)
        .filter((details): details is ToolDetails => Boolean(details)),
    );
    const referencedTransactionIds = [
      ...new Set([
        ...toolTransactions.map((transaction) => transaction.id),
        ...inferReferencedTransactionIds(
          reply,
          dedupeTransactions([...toolTransactions, ...recentTransactions]),
        ),
      ]),
    ];

    return {
      threadId,
      reply,
      action: lastToolResult?.details?.action,
      transactionId: lastToolResult?.details?.transaction?.id ?? lastToolResult?.details?.deletedId,
      referencedTransactionIds,
      needsClarification,
    };
  }

  private async resolveFollowupTransactions(
    replyContext: ReplyContext | undefined,
    recentTransactions: SimpleTransaction[],
  ): Promise<SimpleTransaction[]> {
    if (!replyContext) {
      return recentTransactions;
    }

    const candidateIdSets = [
      replyContext.transactionIds,
      replyContext.recentTransactionIds,
    ];

    for (const candidateIds of candidateIdSets) {
      if (candidateIds.length === 0) {
        continue;
      }

      const resolvedTransactions = (
        await Promise.all(candidateIds.map((transactionId) => this.ledgerService.getTransactionById(transactionId)))
      ).filter((transaction): transaction is NonNullable<typeof transaction> => Boolean(transaction));

      if (resolvedTransactions.length > 0) {
        return resolvedTransactions;
      }
    }

    return recentTransactions;
  }

  private buildDeterministicClarification(
    text: string,
    replyContext: ReplyContext | undefined,
    followupTransactions: SimpleTransaction[],
  ): string | undefined {
    if (!replyContext || replyContext.transactionIds.length <= 1) {
      return undefined;
    }

    if (followupTransactions.length <= 1 || !isBareSingleReference(text)) {
      return undefined;
    }

    return `Which one do you mean: ${formatTransactionOptions(followupTransactions)}?`;
  }

  private async persistSyntheticClarificationTurn(
    threadId: string,
    existingMessages: Message[],
    userContent: UserMessage["content"],
    timestamp: number,
    reply: string,
    lastTransactionId: string | undefined,
  ): Promise<void> {
    const userMessage: UserMessage = {
      role: "user",
      content: userContent,
      timestamp,
    };
    const assistantMessage: AssistantMessage = {
      role: "assistant",
      content: [{ type: "text", text: reply }],
      api: "openai-completions",
      provider: "gullak-pi",
      model: this.config.modelId,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: 0,
        cost: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          total: 0,
        },
      },
      stopReason: "stop",
      timestamp: timestamp + 1,
    };

    await this.stateStore.saveThread(
      threadId,
      [...existingMessages, userMessage, assistantMessage].slice(-24),
      lastTransactionId,
    );
  }
}

function findLastAssistantMessage(messages: Message[]): AssistantMessage | undefined {
  return [...messages].reverse().find((message): message is AssistantMessage => message.role === "assistant");
}

function findTurnToolResults(
  messages: Message[],
  timestamp: number,
  content: string,
): ToolResultMessage<ToolDetails>[] {
  let lastUserIndex = -1;

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") {
      continue;
    }

    if (message.timestamp === timestamp && message.content === content) {
      lastUserIndex = index;
      break;
    }
  }

  const scope = lastUserIndex === -1 ? messages : messages.slice(lastUserIndex + 1);
  return scope.filter((message): message is ToolResultMessage<ToolDetails> => message.role === "toolResult");
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

function looksLikeClarification(text: string | undefined): boolean {
  if (!text) {
    return false;
  }

  return /\?|\b(which|what|who|where|when|can you clarify|did you mean|please confirm|need clarification)\b/i.test(text);
}

function extractToolTransactions(details: ToolDetails[]): NonNullable<ToolDetails["transaction"]>[] {
  const transactions = details.flatMap((detail) => {
    if (
      detail.action === "record_expense" ||
      detail.action === "record_income" ||
      detail.action === "edit_transaction" ||
      detail.action === "edit_last_transaction"
    ) {
      return detail.transaction ? [detail.transaction] : [];
    }

    if (detail.action === "record_expense_batch" || detail.action === "edit_recent_transactions") {
      return detail.transactions ?? [];
    }

    return [];
  });

  return dedupeTransactions(transactions);
}

function dedupeTransactions<T extends { id: string }>(transactions: T[]): T[] {
  const seen = new Set<string>();

  return transactions.filter((transaction) => {
    if (seen.has(transaction.id)) {
      return false;
    }

    seen.add(transaction.id);
    return true;
  });
}

function formatTransactionOptions(transactions: SimpleTransaction[]): string {
  const options = transactions.map(
    (transaction) => `${transaction.payee} (${formatAmount(transaction.amount)} ${transaction.currency})`,
  );

  if (options.length === 1) {
    return options[0]!;
  }

  if (options.length === 2) {
    return `${options[0]} or ${options[1]}`;
  }

  return `${options.slice(0, -1).join(", ")}, or ${options.at(-1)}`;
}
