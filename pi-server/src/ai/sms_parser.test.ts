import { expect, test } from "bun:test";

import type { AppConfig } from "../config.ts";
import { parseSms } from "./sms_parser.ts";

const config = {
  modelBaseUrl: "http://127.0.0.1:9",
  modelId: "unused",
  modelApiKey: "unused",
} as AppConfig;

test("deterministically parses Kotak sent UPI SMS without LLM", async () => {
  const result = await parseSms(config, {
    sender: "JX-KOTAKB-S",
    body:
      "Sent Rs.146.00 from Kotak Bank AC X9876 to friend@example on 06-05-26.UPI Ref 111111111111. Not you? SMS BLOCK",
    receivedAt: Date.UTC(2026, 4, 6, 12),
    categories: [{ id: "transfer", name: "Transfers" }],
  });

  expect(result.isTransaction).toBe(true);
  expect(result.candidate?.amountCents).toBe(14600);
  expect(result.candidate?.isIncome).toBe(false);
  expect(result.candidate?.payee).toBe("friend@example");
  expect(result.candidate?.accountHint).toBe("Kotak AC X9876");
  expect(result.candidate?.date).toBe("2026-05-06");
  expect(result.candidate?.bankRef).toBe("111111111111");
  expect(result.candidate?.parserVersion).toBe(3);
});

test("deterministically parses credited SMS as income", async () => {
  const result = await parseSms(config, {
    sender: "VK-HDFCBK",
    body:
      "INR 1,250.50 credited to HDFC Bank A/C xx1234 from RAZORPAY on 06/05/2026 Ref 99887766.",
    receivedAt: Date.UTC(2026, 4, 6, 12),
  });

  expect(result.isTransaction).toBe(true);
  expect(result.candidate?.amountCents).toBe(125050);
  expect(result.candidate?.isIncome).toBe(true);
  expect(result.candidate?.payee).toBe("RAZORPAY");
  expect(result.candidate?.accountHint).toBe("Hdfc AC X1234");
});
