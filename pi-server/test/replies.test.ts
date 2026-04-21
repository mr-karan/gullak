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
    [
      "Got it. Saved 702.00 INR for licious chicken.",
      "Category: Expenses:Food:Groceries",
      "Paid via: Liabilities:Card:Axis",
      "Date: 2026-04-18",
      "Ref: txn-1",
    ].join("\n"),
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

  assert.match(formatReplyFromTool(details) ?? "", /Done\. Updated these 2 transactions:/);
  assert.match(formatReplyFromTool(details) ?? "", /boodmo, Category: Expenses:Auto:Parts · Paid via: Liabilities:Card:Axis · Date: 2026-04-18 · Note: Jimny upcoming trip with Curbover · Ref: txn-1/);
  assert.match(formatReplyFromTool(details) ?? "", /Maruti Suzuki, Category: Expenses:Auto:Service · Paid via: Liabilities:Card:Axis · Date: 2026-04-18 · Ref: txn-2/);
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

  assert.match(reply ?? "", /Got it\. Saved these 2 expenses:/);
  assert.match(reply ?? "", /IKEA, Category: Expenses:Food:Restaurants/);
  assert.match(reply ?? "", /Swiggy, Category: Expenses:Food:Delivery · Paid via: Liabilities:CreditCard:Axis · Date: 2026-04-20 · Note: pizza bakery dinner/);
});
