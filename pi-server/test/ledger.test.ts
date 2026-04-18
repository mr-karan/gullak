import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { LedgerService } from "../src/ledger/service.js";
import { LedgerValidator } from "../src/ledger/validator.js";
import { LedgerWriter } from "../src/ledger/writer.js";

function makeConfig(ledgerPath: string) {
  return {
    version: "test",
    dataDir: "",
    ledgerPath,
    statePath: "",
    recapDir: "",
    timezone: "Asia/Kolkata",
    defaultCurrency: "INR",
    ledgerCli: "ledger",
    validateWrites: false,
    host: "127.0.0.1",
    port: 8787,
    modelBaseUrl: "http://localhost:11434/v1",
    modelId: "gpt-oss:20b",
    modelName: "GPT-OSS 20B",
    modelApiKey: "dummy",
    modelReasoning: false,
    modelThinkingLevel: "minimal" as const,
    whatsappBridgeUrl: "http://localhost:3000",
    whatsappAllowedNumbers: [],
    whatsappGroupRequireMention: false,
  };
}

test("ledger service appends and lists simple expense transactions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gullak-pi-test-"));

  try {
    const ledgerPath = join(dir, "main.ledger");
    const validator = new LedgerValidator("ledger", false);
    const writer = new LedgerWriter(ledgerPath, validator);
    const service = new LedgerService(makeConfig(ledgerPath), writer);

    const transaction = await service.appendExpense({
      date: "2026-04-16",
      payee: "Swiggy",
      amount: 350,
      expenseAccount: "Expenses:Food:Delivery",
      paymentAccount: "Assets:Bank:HDFC",
      currency: "INR",
      source: "http",
    });

    assert.equal(transaction.payee, "Swiggy");

    const content = await readFile(ledgerPath, "utf8");
    assert.match(content, /Swiggy/);
    assert.match(content, /gullak:id/);

    const transactions = await service.listTransactions();
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].amount, 350);
    assert.equal(transactions[0].expenseAccount, "Expenses:Food:Delivery");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ledger service updates and summarizes transactions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gullak-pi-test-"));

  try {
    const ledgerPath = join(dir, "main.ledger");
    const validator = new LedgerValidator("ledger", false);
    const writer = new LedgerWriter(ledgerPath, validator);
    const service = new LedgerService(makeConfig(ledgerPath), writer);

    const first = await service.appendExpense({
      date: "2026-04-10",
      payee: "Blinkit",
      amount: 500,
      expenseAccount: "Expenses:Food:Groceries",
      paymentAccount: "Assets:Bank:HDFC",
      currency: "INR",
      source: "http",
    });

    await service.appendIncome({
      date: "2026-04-11",
      payee: "Salary",
      amount: 100000,
      incomeAccount: "Income:Salary",
      depositAccount: "Assets:Bank:HDFC",
      currency: "INR",
      source: "http",
    });

    const updated = await service.updateTransaction(first.id, {
      amount: 650,
      note: "weekly groceries",
    });

    assert.equal(updated?.amount, 650);
    assert.equal(updated?.note, "weekly groceries");

    const summary = await service.getSummary({
      startDate: "2026-04-01",
      endDate: "2026-04-30",
    });

    assert.equal(summary.totalExpense, 650);
    assert.equal(summary.totalIncome, 100000);
    assert.equal(summary.topAccounts[0]?.name, "Expenses:Food:Groceries");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("parser keeps transactions with omitted balancing amounts", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gullak-pi-test-"));

  try {
    const ledgerPath = join(dir, "main.ledger");
    await writeFile(
      ledgerPath,
      `2026/04/12 Salary\n    ; gullak:id salary01\n    Income:Salary  -100000.00 INR\n    Assets:Bank:HDFC\n`,
      "utf8",
    );

    const validator = new LedgerValidator("ledger", false);
    const writer = new LedgerWriter(ledgerPath, validator);
    const service = new LedgerService(makeConfig(ledgerPath), writer);

    const transactions = await service.listTransactions();
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].kind, "income");
    assert.equal(transactions[0].amount, 100000);
    assert.equal(transactions[0].depositAccount, "Assets:Bank:HDFC");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
