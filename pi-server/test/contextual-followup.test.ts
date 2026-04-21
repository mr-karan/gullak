import assert from "node:assert/strict";
import test from "node:test";

import {
  inferReferencedTransactionIds,
  isBareSingleReference,
  splitQuotedReply,
  rewriteContextualFollowup,
} from "../src/agent/contextual-followup.js";
import type { SimpleTransaction } from "../src/ledger/models.js";

const recentTransactions: SimpleTransaction[] = [
  {
    id: "txn2",
    date: "2026-04-18",
    payee: "Maruti Suzuki",
    amount: 1226,
    currency: "INR",
    kind: "expense",
    expenseAccount: "Expenses:Auto:Service",
    paymentAccount: "Assets:Bank:HDFC",
  },
  {
    id: "txn1",
    date: "2026-04-18",
    payee: "boodmo",
    amount: 8277,
    currency: "INR",
    kind: "expense",
    expenseAccount: "Expenses:Auto:Parts",
    paymentAccount: "Assets:Bank:HDFC",
  },
];

test("rewrites multi-transaction follow-ups into explicit update requests", () => {
  assert.equal(
    rewriteContextualFollowup("both of them are related to curbover trip", recentTransactions),
    "Update the last 2 transactions in this conversation: both of them are related to curbover trip",
  );
});

test("rewrites payment corrections into explicit single-transaction updates", () => {
  assert.equal(
    rewriteContextualFollowup("paid via hdfc upi", recentTransactions),
    "Update the last transaction in this conversation: paid via hdfc upi",
  );
});

test("rewrites verb-led plural follow-ups into multi-transaction updates", () => {
  assert.equal(
    rewriteContextualFollowup("mark both as trip expenses", recentTransactions),
    "Update the last 2 transactions in this conversation: mark both as trip expenses",
  );
});

test("rewrites quoted transaction id follow-ups into explicit targeted updates", () => {
  const input = [
    "[Replying to: \"• 2026-04-18 996c417a boodmo 8277.00 INR",
    "• 2026-04-18 67b6c359 Maruti Suzuki 1226.00 INR\"]",
    "^ both of expenses related to curbover trip",
  ].join("\n");

  assert.equal(
    rewriteContextualFollowup(input, recentTransactions),
    "Update transactions with ids 996c417a, 67b6c359 in the ledger: both of expenses related to curbover trip",
  );
});

test("rewrites all-of-them follow-ups to all recent transactions", () => {
  const threeRecentTransactions = [
    ...recentTransactions,
    {
      id: "txn0",
      date: "2026-04-18",
      payee: "Flight Booking",
      amount: 6192,
      currency: "INR",
      kind: "expense" as const,
      expenseAccount: "Expenses:Travel:Flights",
      paymentAccount: "Assets:Bank:HDFC",
    },
  ];

  assert.equal(
    rewriteContextualFollowup("all of them were trip expenses", threeRecentTransactions),
    "Update the last 3 transactions in this conversation: all of them were trip expenses",
  );
});

test("rewrites quoted follow-ups to a single matching recent transaction even without explicit ids", () => {
  const input = [
    "[Replying to: \"Saved 1200.00 INR for Swiggy.\"]",
    "This.",
  ].join("\n");

  assert.equal(
    rewriteContextualFollowup(input, [
      {
        id: "0a717873",
        date: "2026-04-20",
        payee: "Swiggy",
        amount: 1200,
        currency: "INR",
        kind: "expense",
        expenseAccount: "Expenses:Food:Delivery",
        paymentAccount: "Liabilities:CreditCard:Axis",
      },
      {
        id: "7cbc18e7",
        date: "2026-04-20",
        payee: "Printo",
        amount: 323,
        currency: "INR",
        kind: "expense",
        expenseAccount: "Expenses:Shopping:Online",
        paymentAccount: "Liabilities:CreditCard:Axis",
      },
    ]),
    "Update transaction 0a717873 in the ledger: This.",
  );
});

test("does not auto-edit multiple quoted candidates for a singular bare reference", () => {
  const input = [
    "[Replying to: \"Did you mean Swiggy 1200 INR or Printo 323 INR?\"]",
    "This.",
  ].join("\n");

  assert.equal(
    rewriteContextualFollowup(input, [
      {
        id: "0a717873",
        date: "2026-04-20",
        payee: "Swiggy",
        amount: 1200,
        currency: "INR",
        kind: "expense",
        expenseAccount: "Expenses:Food:Delivery",
        paymentAccount: "Liabilities:CreditCard:Axis",
      },
      {
        id: "7cbc18e7",
        date: "2026-04-20",
        payee: "Printo",
        amount: 323,
        currency: "INR",
        kind: "expense",
        expenseAccount: "Expenses:Shopping:Online",
        paymentAccount: "Liabilities:CreditCard:Axis",
      },
    ]),
    "This.",
  );
});

test("infers multiple referenced transaction ids from assistant clarification text", () => {
  assert.deepEqual(
    inferReferencedTransactionIds(
      "Did you mean to edit the last Swiggy transaction for 1200 INR, or the most recent Printo transaction?",
      [
        {
          id: "0a717873",
          date: "2026-04-20",
          payee: "Swiggy",
          amount: 1200,
          currency: "INR",
          kind: "expense",
          expenseAccount: "Expenses:Food:Delivery",
          paymentAccount: "Liabilities:CreditCard:Axis",
        },
        {
          id: "7cbc18e7",
          date: "2026-04-20",
          payee: "Printo",
          amount: 323,
          currency: "INR",
          kind: "expense",
          expenseAccount: "Expenses:Shopping:Online",
          paymentAccount: "Liabilities:CreditCard:Axis",
        },
      ],
    ),
    ["0a717873", "7cbc18e7"],
  );
});

test("detects bare singular references even when they are quoted WhatsApp replies", () => {
  assert.equal(
    isBareSingleReference([
      "[Replying to: \"Did you mean Swiggy or Printo?\"]",
      "And this.",
    ].join("\n")),
    true,
  );
});

test("splitQuotedReply returns the reply body separately from quoted text", () => {
  assert.deepEqual(
    splitQuotedReply([
      "[Replying to: \"Saved 1200.00 INR for Swiggy.\"]",
      "paid via hdfc upi",
    ].join("\n")),
    {
      quotedText: "Saved 1200.00 INR for Swiggy.",
      bodyText: "paid via hdfc upi",
    },
  );
});
