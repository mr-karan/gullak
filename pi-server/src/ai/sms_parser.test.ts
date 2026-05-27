import { expect, test } from "bun:test";

import { validateCandidate } from "./sms_parser.ts";

// The full parse path is LLM-only as of parserVersion 4 — see sms_parser.ts
// for the rationale. Integration tests for parseSms() would need a mocked
// chatJson; those live in the e2e harness, not here. What we DO cover here
// is the deterministic post-validator that runs over every model response,
// because that's the safety net protecting the financial dataset from
// payee-name leakage.

test("validateCandidate accepts a clean Title Case merchant", () => {
  expect(validateCandidate("Taco Bell")).toBeNull();
  expect(validateCandidate("Apple Services")).toBeNull();
  expect(validateCandidate("Keya Spring Electricity")).toBeNull();
  expect(validateCandidate("Goibibo")).toBeNull();
});

test("validateCandidate accepts a UPI VPA payee (no merchant decode)", () => {
  // VPAs survive — they're legitimate identifiers when the merchant name
  // didn't appear in the SMS at all.
  expect(validateCandidate("friend@okaxis")).toBeNull();
  expect(validateCandidate("paytmqr583e1y@paytm")).toBeNull();
});

test("validateCandidate flags a leading underscore from HDFC card format", () => {
  const issue = validateCandidate("_TACO BELL");
  expect(issue).toContain("underscore");
});

test("validateCandidate flags trailing double-dots", () => {
  const issue = validateCandidate("Taco Bell..");
  expect(issue).toContain("..");
});

test("validateCandidate flags a time suffix glued to the merchant", () => {
  expect(validateCandidate("Taco Bell 19:24:04")).toContain("time");
});

test("validateCandidate flags an ISO date fragment in the merchant", () => {
  expect(validateCandidate("Happenstance 2026-05-25")).toContain("date");
});

test("validateCandidate catches the Not-You bank disclaimer leak", () => {
  expect(
    validateCandidate(
      "_TACO BELL.. On 2026-05-24:19:24:04.Not You? To Block+Reissue Call 18002586161/SMS BLOCK CC 4904 to 7308080808",
    ),
  ).not.toBeNull();
});

test("validateCandidate catches SMS BLOCK footer fragment", () => {
  expect(validateCandidate("Happenstance SMS BLOCK")).toContain("SMS BLOCK");
});

test("validateCandidate catches a customer-care phone number", () => {
  expect(validateCandidate("Some Merchant Call 18001234567")).toContain("phone");
});

test("validateCandidate rejects unreasonably long payees", () => {
  const long = "X".repeat(80);
  expect(validateCandidate(long)).toContain("long");
});

test("validateCandidate treats null/empty as clean", () => {
  expect(validateCandidate(null)).toBeNull();
  expect(validateCandidate("")).toBeNull();
  expect(validateCandidate("   ")).toBeNull();
});
