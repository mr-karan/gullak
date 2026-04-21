import assert from "node:assert/strict";
import test from "node:test";

import { normalizeUserMessage } from "../src/agent/message-normalizer.js";

test("rewrites multi-line amount-first messages into explicit batch instructions", () => {
  const normalized = normalizeUserMessage([
    "2k ikea lunch",
    "1.2k Swiggy pizza bakery dinner",
    "323 printo posters",
  ].join("\n"));

  assert.match(normalized, /The user sent 3 separate expense items in one message/);
  assert.match(normalized, /1\. amount=2000\.00 INR/);
  assert.match(normalized, /2\. amount=1200\.00 INR/);
  assert.match(normalized, /3\. amount=323\.00 INR/);
});

test("rewrites single shorthand expense entries without forcing a separate payee question", () => {
  const normalized = normalizeUserMessage("302 groceries");

  assert.match(normalized, /The user sent one shorthand expense entry/);
  assert.match(normalized, /amount=302\.00 INR/);
  assert.match(normalized, /Do not ask for a separate payee/);
});
