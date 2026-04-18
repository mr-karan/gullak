import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { complete, type AssistantMessage } from "@mariozechner/pi-ai";
import { DateTime } from "luxon";

import type { AppConfig } from "../config.js";
import { formatAmount } from "../ledger/models.js";
import type { LedgerService } from "../ledger/service.js";
import type { StateStore } from "../state/store.js";
import { buildModel } from "../agent/model.js";
import type { WhatsAppBridgeClient } from "../whatsapp/service.js";

export interface WeeklyRecapResult {
  weekKey: string;
  startDate: string;
  endDate: string;
  filePath: string;
  markdown: string;
  sentToWhatsapp: boolean;
}

export class WeeklyRecapService {
  constructor(
    private readonly config: AppConfig,
    private readonly ledgerService: LedgerService,
    private readonly stateStore: StateStore,
    private readonly bridgeClient?: WhatsAppBridgeClient,
  ) {}

  async run(options: { force?: boolean; sendWhatsapp?: boolean } = {}): Promise<WeeklyRecapResult> {
    const now = DateTime.now().setZone(this.config.timezone);
    const previousWeek = now.minus({ weeks: 1 });
    const start = previousWeek.startOf("week");
    const end = previousWeek.endOf("week");
    const weekKey = start.toFormat("kkkk-'W'WW");
    const filePath = join(this.config.recapDir, `${weekKey}.md`);

    if (!options.force) {
      const existing = await this.stateStore.getRecap(weekKey);
      if (existing) {
        const markdown = await readFile(existing.filePath, "utf8");
        return {
          weekKey,
          startDate: start.toISODate() ?? "",
          endDate: end.toISODate() ?? "",
          filePath: existing.filePath,
          markdown,
          sentToWhatsapp: Boolean(existing.sentAt),
        };
      }
    }

    const summary = await this.ledgerService.getSummary({
      startDate: start.toISODate() ?? undefined,
      endDate: end.toISODate() ?? undefined,
    });
    const previousSummary = await this.ledgerService.getSummary({
      startDate: start.minus({ weeks: 1 }).toISODate() ?? undefined,
      endDate: end.minus({ weeks: 1 }).toISODate() ?? undefined,
    });

    const noSpendDays = 7 - new Set(summary.transactions.map((item) => item.date)).size;
    const biggestTransactions = summary.transactions
      .filter((item) => item.kind === "expense")
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 3);

    const stats = {
      weekKey,
      startDate: start.toISODate(),
      endDate: end.toISODate(),
      totalExpense: summary.totalExpense,
      previousExpense: previousSummary.totalExpense,
      delta: Number((summary.totalExpense - previousSummary.totalExpense).toFixed(2)),
      transactionCount: summary.transactionCount,
      noSpendDays,
      topAccounts: summary.topAccounts,
      topPayees: summary.topPayees,
      biggestTransactions,
    };

    const narrative = await this.generateNarrative(stats);
    const markdown = buildMarkdown(stats, narrative);
    await writeFile(filePath, markdown, "utf8");

    let sentAt: string | undefined;
    if (options.sendWhatsapp && this.bridgeClient && this.config.recapWhatsappChatId) {
      await this.bridgeClient.sendText(this.config.recapWhatsappChatId, narrative);
      sentAt = new Date().toISOString();
    }

    await this.stateStore.saveRecap({
      weekKey,
      filePath,
      generatedAt: new Date().toISOString(),
      sentAt,
    });

    return {
      weekKey,
      startDate: stats.startDate ?? "",
      endDate: stats.endDate ?? "",
      filePath,
      markdown,
      sentToWhatsapp: Boolean(sentAt),
    };
  }

  private async generateNarrative(stats: Record<string, unknown>): Promise<string> {
    try {
      const response = await complete(
        buildModel(this.config),
        {
          systemPrompt:
            "Write a short weekly money recap in plain English. Be specific, honest, and nudging. No hype.",
          messages: [
            {
              role: "user",
              content: `Turn these stats into a 4-6 sentence weekly spending recap: ${JSON.stringify(stats)}`,
              timestamp: Date.now(),
            },
          ],
        },
        {
          apiKey: this.config.modelApiKey,
          reasoning: this.config.modelReasoning ? this.config.modelThinkingLevel : undefined,
        },
      );

      return extractAssistantText(response) || fallbackNarrative(stats);
    } catch {
      return fallbackNarrative(stats);
    }
  }
}

function buildMarkdown(stats: Record<string, unknown>, narrative: string): string {
  const topAccounts = (stats.topAccounts as Array<{ name: string; total: number }> | undefined) ?? [];
  const topPayees = (stats.topPayees as Array<{ name: string; total: number }> | undefined) ?? [];
  const biggestTransactions =
    (stats.biggestTransactions as Array<{ payee: string; amount: number; currency: string; date: string }> | undefined) ?? [];

  return [
    `# Weekly Recap ${stats.weekKey}`,
    "",
    narrative,
    "",
    `- Spend: ${formatAmount(Number(stats.totalExpense ?? 0))}`,
    `- Previous week: ${formatAmount(Number(stats.previousExpense ?? 0))}`,
    `- Delta: ${formatAmount(Number(stats.delta ?? 0))}`,
    `- Transactions: ${stats.transactionCount}`,
    `- No-spend days: ${stats.noSpendDays}`,
    "",
    "## Top Categories",
    ...topAccounts.map((entry) => `- ${entry.name}: ${formatAmount(entry.total)}`),
    "",
    "## Top Payees",
    ...topPayees.map((entry) => `- ${entry.name}: ${formatAmount(entry.total)}`),
    "",
    "## Largest Transactions",
    ...biggestTransactions.map(
      (entry) => `- ${entry.date} ${entry.payee}: ${formatAmount(entry.amount)} ${entry.currency}`,
    ),
    "",
  ].join("\n");
}

function extractAssistantText(message: AssistantMessage): string {
  return message.content
    .filter((block): block is Extract<AssistantMessage["content"][number], { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
}

function fallbackNarrative(stats: Record<string, unknown>): string {
  const totalExpense = Number(stats.totalExpense ?? 0);
  const delta = Number(stats.delta ?? 0);
  const trend = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return `You spent ${formatAmount(totalExpense)} last week, which was ${trend} by ${formatAmount(Math.abs(delta))} versus the week before. The goal is not perfection, just awareness. Look at the top categories and the biggest spends, then decide what deserves a tighter boundary next week.`;
}
