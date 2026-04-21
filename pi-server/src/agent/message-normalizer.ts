export function normalizeUserMessage(text: string): string {
  return rewriteAmountFirstExpense(text);
}

function rewriteAmountFirstExpense(text: string): string {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0 || lines.some((line) => line.startsWith("[Replying to:"))) {
    return text;
  }

  const parsed = lines.map(parseExpenseLine);
  if (parsed.some((item) => !item)) {
    return text;
  }

  if (parsed.length === 1) {
    const item = parsed[0]!;
    return [
      "The user sent one shorthand expense entry. Record it as a single expense transaction.",
      "Do not ask for a separate payee if the merchant is not explicit.",
      `amount=${item.amount.toFixed(2)} INR | raw="${item.raw}" | details="${item.details}"`,
      "If the details are category or merchant shorthand, use a short payee derived from the details and infer the category from it.",
    ].join("\n");
  }

  return [
    `The user sent ${parsed.length} separate expense items in one message. Record every item as its own expense transaction.`,
    "Do not ignore any line. Prefer the batch expense tool when possible.",
    "If an item has no explicit merchant, use a short payee derived from the details instead of asking a separate payee question.",
    "Items:",
    ...parsed.map((item, index) => `${index + 1}. amount=${item!.amount.toFixed(2)} INR | raw="${item!.raw}" | details="${item!.details}"`),
  ].join("\n");
}

function parseExpenseLine(line: string): { raw: string; amount: number; details: string } | undefined {
  const match = line.match(/^(?:[-*•]\s*)?(?:₹|rs\.?\s*)?(\d+(?:\.\d+)?)([kK])?\s+(.+)$/i);
  if (!match) {
    return undefined;
  }

  const amount = Number.parseFloat(match[1]);
  if (!Number.isFinite(amount)) {
    return undefined;
  }

  const normalized = match[2] ? amount * 1000 : amount;
  return {
    raw: line,
    amount: Number(normalized.toFixed(2)),
    details: match[3].trim(),
  };
}
