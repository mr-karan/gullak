import assert from "node:assert/strict";
import test from "node:test";

import { formatReplyFromTool, formatReplyFromTurn } from "../src/agent/replies.js";
import type { ToolDetails } from "../src/agent/tools.js";

test("formats expense confirmations with category and payment mode", () => {
  const details: ToolDetails = {
    action: "record_expense",
    transaction: {
      id: "txn-1",
      date: "2026-04-18",
      payee: "licious chicken",
      amount: 702,
      currency: "INR",
      kind: "expense",
      expenseAccount: "Expenses:Food:Groceries",
      paymentAccount: "Liabilities:Card:Axis",
    },
  };

  assert.equal(
    formatReplyFromTool(details),
    "Added 702.00 INR for licious chicken.",
  );
});

test("formats multi-edit confirmations with per-transaction detail", () => {
  const details: ToolDetails = {
    action: "edit_recent_transactions",
    transactions: [
      {
        id: "txn-1",
        date: "2026-04-18",
        payee: "boodmo",
        amount: 8277,
        currency: "INR",
        kind: "expense",
        expenseAccount: "Expenses:Auto:Parts",
        paymentAccount: "Liabilities:Card:Axis",
        note: "Jimny upcoming trip with Curbover",
      },
      {
        id: "txn-2",
        date: "2026-04-18",
        payee: "Maruti Suzuki",
        amount: 1226,
        currency: "INR",
        kind: "expense",
        expenseAccount: "Expenses:Auto:Service",
        paymentAccount: "Liabilities:Card:Axis",
      },
    ],
  };

  assert.match(formatReplyFromTool(details) ?? "", /^Updated 2 transactions:/);
  assert.match(formatReplyFromTool(details) ?? "", /- boodmo: 8277\.00 INR via Axis card/);
  assert.doesNotMatch(formatReplyFromTool(details) ?? "", /Ref: txn-1/);
  assert.doesNotMatch(formatReplyFromTool(details) ?? "", /Category:/);
  assert.match(formatReplyFromTool(details) ?? "", /- Maruti Suzuki: 1226\.00 INR via Axis card/);
});

test("aggregates multiple record-expense tool results into one reply", () => {
  const reply = formatReplyFromTurn([
    {
      action: "record_expense",
      transaction: {
        id: "txn-1",
        date: "2026-04-20",
        payee: "IKEA",
        amount: 2000,
        currency: "INR",
        kind: "expense",
        expenseAccount: "Expenses:Food:Restaurants",
        paymentAccount: "Liabilities:CreditCard:Axis",
      },
    },
    {
      action: "record_expense",
      transaction: {
        id: "txn-2",
        date: "2026-04-20",
        payee: "Swiggy",
        amount: 1200,
        currency: "INR",
        kind: "expense",
        expenseAccount: "Expenses:Food:Delivery",
        paymentAccount: "Liabilities:CreditCard:Axis",
        note: "pizza bakery dinner",
      },
    },
  ]);

  assert.match(reply ?? "", /^Added 2 expenses:/);
  assert.match(reply ?? "", /- IKEA: 2000\.00 INR/);
  assert.match(reply ?? "", /- Swiggy: 1200\.00 INR \(pizza bakery dinner\)/);
  assert.doesNotMatch(reply ?? "", /Category:/);
  assert.doesNotMatch(reply ?? "", /Ref:/);
});

test("includes short notes in single-save confirmations but omits ledger metadata", () => {
  const details: ToolDetails = {
    action: "record_expense",
    transaction: {
      id: "txn-1",
      date: "2026-04-20",
      payee: "Licious",
      amount: 714,
      currency: "INR",
      kind: "expense",
      expenseAccount: "Expenses:Food:Groceries",
      paymentAccount: "Liabilities:CreditCard:Axis",
      note: "chicken thighs",
    },
  };

  assert.equal(
    formatReplyFromTool(details),
    "Added 714.00 INR for Licious (chicken thighs).",
  );
});

test("omits long notes from single-save confirmations", () => {
  const details: ToolDetails = {
    action: "record_expense",
    transaction: {
      id: "txn-1",
      date: "2026-04-20",
      payee: "Amazon/Online Mart",
      amount: 3400,
      currency: "INR",
      kind: "expense",
      expenseAccount: "Expenses:Home:Equipment",
      paymentAccount: "Liabilities:CreditCard:Axis",
      note: "miscellaneous home expenses on amazon/other online sites",
    },
  };

  assert.equal(
    formatReplyFromTool(details),
    "Added 3400.00 INR for Amazon/Online Mart.",
  );
});

test("formats recent transactions in a plain chat-friendly list", () => {
  const details: ToolDetails = {
    action: "list_recent_transactions",
    transactions: [
      {
        id: "txn-1",
        date: "2026-04-22",
        payee: "Licious",
        amount: 714,
        currency: "INR",
        kind: "expense",
        expenseAccount: "Expenses:Food:Groceries",
        paymentAccount: "Liabilities:CreditCard:Axis",
      },
      {
        id: "txn-2",
        date: "2026-04-22",
        payee: "Groceries",
        amount: 315,
        currency: "INR",
        kind: "expense",
        expenseAccount: "Expenses:Food:Groceries",
        paymentAccount: "Liabilities:CreditCard:Axis",
      },
      {
        id: "txn-3",
        date: "2026-04-21",
        payee: "Swiggy",
        amount: 1200,
        currency: "INR",
        kind: "expense",
        expenseAccount: "Expenses:Food:Delivery",
        paymentAccount: "Assets:Bank:HDFC:UPI",
      },
    ],
  };

  const reply = formatReplyFromTool(details) ?? "";
  assert.match(reply, /^Recent transactions:/);
  assert.match(reply, /Apr 22: Licious \(714\.00 INR\), Groceries \(315\.00 INR\)/);
  assert.match(reply, /Apr 21: Swiggy \(1200\.00 INR\)/);
  assert.doesNotMatch(reply, /\*\*/);
  assert.doesNotMatch(reply, /Ref:/);
});

test("formats summaries as short natural-language spend recaps", () => {
  const details: ToolDetails = {
    action: "get_summary",
    summary: {
      startDate: "2026-04-01",
      endDate: "2026-04-30",
      totalExpense: 4629,
      totalIncome: 100000,
      net: 95371,
      transactionCount: 4,
      topAccounts: [
        { name: "Expenses:Food:Groceries", total: 1029 },
      ],
      topPayees: [
        { name: "Amazon", total: 3400 },
        { name: "Licious", total: 714 },
        { name: "Groceries", total: 315 },
      ],
      transactions: [],
    },
  };

  const reply = formatReplyFromTool(details) ?? "";
  assert.match(reply, /^Apr 1 to Apr 30: spent 4629\.00 INR, income 100000\.00 INR, net 95371\.00 INR across 4 transactions\./);
  assert.match(reply, /Biggest spends: Amazon \(3400\.00 INR\), Licious \(714\.00 INR\), Groceries \(315\.00 INR\)\./);
  assert.doesNotMatch(reply, /Top accounts:/);
  assert.doesNotMatch(reply, /\*\*/);
});
