import assert from "node:assert/strict";
import test from "node:test";

import { resolveExpenseAccountHint, resolvePaymentAccountHint, suggestExpenseAccount } from "../src/ledger/inference.js";

test("resolves informal payment hints to known accounts", () => {
  assert.equal(
    resolvePaymentAccountHint("hdfc upi", [
      "Assets:Cash",
      "Assets:Bank:HDFC",
      "Liabilities:Card:Amex",
    ]),
    "Assets:Bank:HDFC",
  );
});

test("does not accept invented expense accounts that are not in the ledger", () => {
  assert.equal(
    resolveExpenseAccountHint("Expenses:Misc", [
      "Expenses:Other",
      "Expenses:Food:Groceries",
      "Expenses:Transport:Vehicle:Maintenance",
    ]),
    undefined,
  );
});

test("uses note text when inferring expense accounts", () => {
  assert.equal(
    suggestExpenseAccount("IKEA", 2000, "lunch"),
    "Expenses:Food:Restaurants",
  );
});
