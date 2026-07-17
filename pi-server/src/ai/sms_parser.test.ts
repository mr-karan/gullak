import { afterEach, expect, test, vi } from "vitest";

// Mock only the LLM network call; keep LlmOutputError real so the retry-on-
// undecodable path is exercised end to end.
vi.mock("../llm/client.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../llm/client.ts")>()),
  chatJson: vi.fn(),
}));

import type { AppConfig } from "../config.ts";
import { chatJson, LlmHttpError, LlmOutputError } from "../llm/client.ts";
import { parseSms, validateCandidate } from "./sms_parser.ts";

const mockChat = vi.mocked(chatJson);
const cfg = {} as unknown as AppConfig; // chatJson is mocked; config is unused
const req = {
  sender: "JM-ICICIT-S",
  body: "INR 742.00 spent using ICICI Bank Card XX6001 on 16-Jul-26 on Etsy.",
  receivedAt: 1_789_000_000_000,
};

afterEach(() => vi.clearAllMocks());

test("coerces a stringified amount instead of parse_failed", async () => {
  mockChat.mockResolvedValue({
    is_transaction: true,
    amount_cents: "74200", // model stringified the number — must be accepted
    is_income: "false", // and the boolean
    payee: "Etsy",
    confidence: "0.9",
  });
  const r = await parseSms(cfg, req);
  expect(r.status).toBe("transaction");
  expect(r.candidate?.amountCents).toBe(74200);
  expect(r.candidate?.isIncome).toBe(false);
  expect(mockChat).toHaveBeenCalledTimes(1); // no retry needed
});

test("re-prompts once when the first answer is undecodable, then succeeds", async () => {
  mockChat
    .mockRejectedValueOnce(new LlmOutputError("malformed JSON"))
    .mockResolvedValueOnce({
      is_transaction: true,
      amount_cents: 627500,
      is_income: false,
      payee: "Payu Retail",
    });
  const r = await parseSms(cfg, req);
  expect(r.status).toBe("transaction");
  expect(r.candidate?.amountCents).toBe(627500);
  expect(mockChat).toHaveBeenCalledTimes(2);
});

test("a transaction with no usable amount re-prompts, not silently dropped", async () => {
  mockChat
    .mockResolvedValueOnce({ is_transaction: true, amount_cents: null, payee: "X" })
    .mockResolvedValueOnce({
      is_transaction: true,
      amount_cents: 5000,
      is_income: false,
      payee: "X",
    });
  const r = await parseSms(cfg, req);
  expect(r.status).toBe("transaction");
  expect(r.candidate?.amountCents).toBe(5000);
  expect(mockChat).toHaveBeenCalledTimes(2);
});

test("parse_failed only after the retry also fails", async () => {
  mockChat.mockRejectedValue(new LlmOutputError("still bad"));
  const r = await parseSms(cfg, req);
  expect(r.status).toBe("parse_failed");
  expect(mockChat).toHaveBeenCalledTimes(2);
});

test("an operational LLM error (402) throws — retryable, not parse_failed", async () => {
  // The model never judged the SMS, so it must NOT be burned as parse_failed.
  // parseSms throws so the route replies 503 and the phone keeps it queued.
  mockChat.mockRejectedValue(new LlmHttpError(402, "LLM 402: out of credits"));
  await expect(parseSms(cfg, req)).rejects.toBeInstanceOf(LlmHttpError);
  expect(mockChat).toHaveBeenCalledTimes(1); // no content-retry on operational
});

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
