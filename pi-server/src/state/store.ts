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
  updatedAt: string;
}

export interface RecapRecord {
  weekKey: string;
  filePath: string;
  generatedAt: string;
  sentAt?: string;
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
    return state.threads[threadId] ?? { messages: [], updatedAt: new Date().toISOString() };
  }

  async saveThread(threadId: string, messages: Message[], lastTransactionId?: string): Promise<void> {
    await this.lock.runExclusive(async () => {
      const state = await this.readState();
      state.threads[threadId] = {
        messages: messages.slice(-24),
        lastTransactionId,
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
        updatedAt: new Date().toISOString(),
      };
      thread.lastTransactionId = transactionId;
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
        threads: parsed.threads ?? {},
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
