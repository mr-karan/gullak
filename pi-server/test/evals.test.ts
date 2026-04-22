import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  buildEvalRequest,
  evaluateExpectations,
  loadEvalSuite,
} from "../src/evals/runner.js";

test("buildEvalRequest injects quoted text in the same format as WhatsApp service", () => {
  const request = buildEvalRequest({
    threadId: "thread-1",
    text: "paid via hdfc upi",
    source: "api",
    quotedText: "Added 1200.00 INR for Swiggy.",
    quotedMessageId: "wa-msg-1",
  });

  assert.equal(
    request.text,
    "[Replying to: \"Added 1200.00 INR for Swiggy.\"]\npaid via hdfc upi",
  );
  assert.equal(request.quotedMessageId, "wa-msg-1");
});

test("evaluateExpectations checks action, reply content, and ledger writes", () => {
  const checks = evaluateExpectations(
    {
      action: "edit_transaction",
      transactionId: "txn-1",
      referencedTransactionIds: ["txn-1"],
      needsClarification: false,
      ledgerChanged: true,
      replyContains: ["Updated"],
      replyExcludes: ["I apologize"],
      replyMaxLength: 40,
      ledgerContains: ["Assets:Bank:HDFC"],
      ledgerExcludes: ["Liabilities:Card:Axis"],
    },
    {
      action: "edit_transaction",
      transactionId: "txn-1",
      referencedTransactionIds: ["txn-1"],
      needsClarification: false,
      reply: "Updated Swiggy: 1200.00 INR via HDFC.",
    },
    true,
    [
      "2026/04/20 Swiggy",
      "    Expenses:Food:Delivery  1200.00 INR",
      "    Assets:Bank:HDFC  -1200.00 INR",
    ].join("\n"),
  );

  assert.equal(checks.every((check) => check.passed), true);
});

test("loadEvalSuite merges defaults into each case", async () => {
  const dir = await mkdtemp(join(tmpdir(), "gullak-eval-suite-"));
  const suitePath = join(dir, "suite.json");
  await writeFile(
    suitePath,
    JSON.stringify({
      id: "suite-1",
      title: "Suite 1",
      defaults: {
        ledgerFixture: "./fixtures/base.ledger",
        request: {
          source: "api",
          sourceUser: "eval",
        },
        expectations: {
          ledgerChanged: false,
        },
      },
      cases: [
        {
          id: "case-1",
          title: "Case 1",
          request: {
            threadId: "thread-1",
            text: "show recent transactions",
          },
          expectations: {
            needsClarification: false,
          },
        },
      ],
    }),
    "utf8",
  );

  const suite = await loadEvalSuite(suitePath);
  assert.equal(suite.cases.length, 1);
  assert.equal(suite.cases[0]?.ledgerFixture, "./fixtures/base.ledger");
  assert.equal(suite.cases[0]?.request.sourceUser, "eval");
  assert.equal(suite.cases[0]?.expectations.ledgerChanged, false);
  assert.equal(suite.cases[0]?.expectations.needsClarification, false);
});
