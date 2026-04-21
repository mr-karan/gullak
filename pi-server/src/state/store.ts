import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { Message } from "@mariozechner/pi-ai";

import { Mutex } from "../mutex.js";

export interface PayeeMemoryEntry {
  expenseAccount: string;
  paymentAccount?: string;
  updatedAt: string;
}

export interface ThreadState {
  messages: Message[];
  lastTransactionId?: string;
  recentTransactionIds?: string[];
  replyContexts?: Record<string, ReplyContext>;
  updatedAt: string;
}

export interface RecapRecord {
  weekKey: string;
  filePath: string;
  generatedAt: string;
  sentAt?: string;
}

export interface ReplyContext {
  transactionIds: string[];
  recentTransactionIds: string[];
  createdAt: string;
}

interface AppState {
  version: 1;
  payeeMemory: Record<string, PayeeMemoryEntry>;
  threads: Record<string, ThreadState>;
  whatsappSeen: Record<string, number>;
  recaps: Record<string, RecapRecord>;
}

const DEFAULT_STATE: AppState = {
  version: 1,
  payeeMemory: {},
  threads: {},
  whatsappSeen: {},
  recaps: {},
};

export class StateStore {
  private readonly lock = new Mutex();

  constructor(private readonly filePath: string) {}

  async getThread(threadId: string): Promise<ThreadState> {
    const state = await this.readState();
    return state.threads[threadId] ?? {
      messages: [],
      recentTransactionIds: [],
      replyContexts: {},
      updatedAt: new Date().toISOString(),
    };
  }

  async saveThread(threadId: string, messages: Message[], lastTransactionId?: string): Promise<void> {
    await this.lock.runExclusive(async () => {
      const state = await this.readState();
      const existing = state.threads[threadId];
      state.threads[threadId] = {
        messages: messages.slice(-24),
        lastTransactionId,
        recentTransactionIds: existing?.recentTransactionIds ?? [],
        replyContexts: existing?.replyContexts ?? {},
        updatedAt: new Date().toISOString(),
      };
      await this.writeState(state);
    });
  }

  async getLastTransactionId(threadId: string): Promise<string | undefined> {
    const state = await this.readState();
    return state.threads[threadId]?.lastTransactionId;
  }

  async setLastTransactionId(threadId: string, transactionId?: string): Promise<void> {
    await this.lock.runExclusive(async () => {
      const state = await this.readState();
      const thread = state.threads[threadId] ?? {
        messages: [],
        recentTransactionIds: [],
        replyContexts: {},
        updatedAt: new Date().toISOString(),
      };
      thread.lastTransactionId = transactionId;
      thread.updatedAt = new Date().toISOString();
      state.threads[threadId] = thread;
      await this.writeState(state);
    });
  }

  async getRecentTransactionIds(threadId: string, limit = 5): Promise<string[]> {
    const state = await this.readState();
    return (state.threads[threadId]?.recentTransactionIds ?? []).slice(0, limit);
  }

  async pushRecentTransactionId(threadId: string, transactionId: string): Promise<void> {
    await this.lock.runExclusive(async () => {
      const state = await this.readState();
      const thread = state.threads[threadId] ?? {
        messages: [],
        recentTransactionIds: [],
        replyContexts: {},
        updatedAt: new Date().toISOString(),
      };

      thread.lastTransactionId = transactionId;
      thread.recentTransactionIds = [
        transactionId,
        ...(thread.recentTransactionIds ?? []).filter((id) => id !== transactionId),
      ].slice(0, 5);
      thread.updatedAt = new Date().toISOString();
      state.threads[threadId] = thread;
      await this.writeState(state);
    });
  }

  async getReplyContext(threadId: string, messageId: string): Promise<ReplyContext | undefined> {
    if (!messageId) {
      return undefined;
    }

    const state = await this.readState();
    return state.threads[threadId]?.replyContexts?.[messageId];
  }

  async saveReplyContext(threadId: string, messageId: string, context: ReplyContext): Promise<void> {
    if (!messageId) {
      return;
    }

    await this.lock.runExclusive(async () => {
      const state = await this.readState();
      const thread = state.threads[threadId] ?? {
        messages: [],
        recentTransactionIds: [],
        replyContexts: {},
        updatedAt: new Date().toISOString(),
      };

      const replyContexts = {
        ...(thread.replyContexts ?? {}),
        [messageId]: {
          transactionIds: [...new Set(context.transactionIds)],
          recentTransactionIds: [...new Set(context.recentTransactionIds)].slice(0, 5),
          createdAt: context.createdAt,
        },
      };

      const prunedReplyContexts = Object.fromEntries(
        Object.entries(replyContexts)
          .sort((left, right) => left[1].createdAt.localeCompare(right[1].createdAt))
          .slice(-50),
      );

      thread.replyContexts = prunedReplyContexts;
      thread.updatedAt = new Date().toISOString();
      state.threads[threadId] = thread;
      await this.writeState(state);
    });
  }

  async forgetTransactionId(threadId: string, transactionId: string): Promise<void> {
    await this.lock.runExclusive(async () => {
      const state = await this.readState();
      const thread = state.threads[threadId];
      if (!thread) {
        return;
      }

      thread.recentTransactionIds = (thread.recentTransactionIds ?? []).filter((id) => id !== transactionId);
      thread.replyContexts = Object.fromEntries(
        Object.entries(thread.replyContexts ?? {}).map(([messageId, context]) => [
          messageId,
          {
            ...context,
            transactionIds: context.transactionIds.filter((id) => id !== transactionId),
            recentTransactionIds: context.recentTransactionIds.filter((id) => id !== transactionId),
          },
        ]),
      );
      if (thread.lastTransactionId === transactionId) {
        thread.lastTransactionId = thread.recentTransactionIds[0];
      }
      thread.updatedAt = new Date().toISOString();
      state.threads[threadId] = thread;
      await this.writeState(state);
    });
  }

  async rememberPayee(
    payee: string,
    expenseAccount: string,
    paymentAccount?: string,
  ): Promise<void> {
    await this.lock.runExclusive(async () => {
      const state = await this.readState();
      state.payeeMemory[normalizePayee(payee)] = {
        expenseAccount,
        paymentAccount,
        updatedAt: new Date().toISOString(),
      };
      await this.writeState(state);
    });
  }

  async findPayeeMemory(payee: string): Promise<PayeeMemoryEntry | undefined> {
    const normalized = normalizePayee(payee);
    const state = await this.readState();

    if (state.payeeMemory[normalized]) {
      return state.payeeMemory[normalized];
    }

    for (const [knownPayee, mapping] of Object.entries(state.payeeMemory)) {
      if (knownPayee.includes(normalized) || normalized.includes(knownPayee)) {
        return mapping;
      }
    }

    return undefined;
  }

  async isDuplicateWhatsappMessage(messageId: string): Promise<boolean> {
    if (!messageId) {
      return false;
    }

    return this.lock.runExclusive(async () => {
      const state = await this.readState();
      const now = Date.now();
      const ttl = 5 * 60 * 1000;

      for (const [knownId, timestamp] of Object.entries(state.whatsappSeen)) {
        if (now - timestamp > ttl) {
          delete state.whatsappSeen[knownId];
        }
      }

      if (state.whatsappSeen[messageId]) {
        await this.writeState(state);
        return true;
      }

      state.whatsappSeen[messageId] = now;
      await this.writeState(state);
      return false;
    });
  }

  async getRecap(weekKey: string): Promise<RecapRecord | undefined> {
    const state = await this.readState();
    return state.recaps[weekKey];
  }

  async saveRecap(record: RecapRecord): Promise<void> {
    await this.lock.runExclusive(async () => {
      const state = await this.readState();
      state.recaps[record.weekKey] = record;
      await this.writeState(state);
    });
  }

  private async readState(): Promise<AppState> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<AppState>;
      return {
        ...DEFAULT_STATE,
        ...parsed,
        payeeMemory: parsed.payeeMemory ?? {},
        threads: Object.fromEntries(
          Object.entries(parsed.threads ?? {}).map(([threadId, thread]) => [
            threadId,
            {
              ...thread,
              messages: thread.messages ?? [],
              recentTransactionIds: thread.recentTransactionIds ?? [],
              replyContexts: thread.replyContexts ?? {},
            },
          ]),
        ),
        whatsappSeen: parsed.whatsappSeen ?? {},
        recaps: parsed.recaps ?? {},
      };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  private async writeState(state: AppState): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tempPath, JSON.stringify(state, null, 2), "utf8");
    await rename(tempPath, this.filePath);
  }
}

function normalizePayee(payee: string): string {
  return payee.trim().toLowerCase();
}
