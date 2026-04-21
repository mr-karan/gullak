import type { SimpleTransaction } from "../ledger/models.js";

const MULTI_REFERENCE_PATTERN = /\b(both|both of them|them|these|all of them)\b/i;
const BARE_SINGLE_REFERENCE_PATTERN = /^\s*(?:and\s+)?(it|this|that)[.!?]*$/i;
const SINGLE_REFERENCE_PATTERNS = [
  /^\s*(it|this|that)\s+(was|is|should|needs|used|belongs|looks|goes)\b/i,
  /^\s*(last|previous)\s+one\b/i,
  /^\s*(paid|payment)\s+(via|with|using|on)\b/i,
  /^\s*(use|mark|change|update|set)\b/i,
];
const TRANSACTION_ID_PATTERN = /\b[a-f0-9]{8}\b/gi;

export function rewriteContextualFollowup(
  text: string,
  recentTransactions: SimpleTransaction[],
): string {
  const { quotedText, bodyText } = splitQuotedReply(text);
  const trimmed = sanitizeLeadingMarkers(bodyText).trim();
  if (!trimmed || recentTransactions.length === 0) {
    return text.trim();
  }

  const directIds = extractTransactionIds(trimmed);
  if (directIds.length > 1) {
    return `Update transactions with ids ${directIds.join(", ")} in the ledger: ${trimmed}`;
  }

  if (directIds.length === 1) {
    return `Update transaction ${directIds[0]} in the ledger: ${trimmed}`;
  }

  const quotedTransactionIds = resolveQuotedTransactionIds(quotedText, recentTransactions);
  if (quotedTransactionIds.length > 1 && MULTI_REFERENCE_PATTERN.test(trimmed)) {
    return `Update transactions with ids ${quotedTransactionIds.join(", ")} in the ledger: ${trimmed}`;
  }

  if (quotedTransactionIds.length === 1) {
    return `Update transaction ${quotedTransactionIds[0]} in the ledger: ${trimmed}`;
  }

  if (MULTI_REFERENCE_PATTERN.test(trimmed)) {
    const count = /^\s*all of them\b/i.test(trimmed)
      ? Math.min(recentTransactions.length, 5)
      : Math.min(2, recentTransactions.length);
    return `Update the last ${count} transactions in this conversation: ${trimmed}`;
  }

  if (SINGLE_REFERENCE_PATTERNS.some((pattern) => pattern.test(trimmed))) {
    return `Update the last transaction in this conversation: ${trimmed}`;
  }

  if (BARE_SINGLE_REFERENCE_PATTERN.test(trimmed) && recentTransactions.length === 1) {
    return `Update the last transaction in this conversation: ${trimmed}`;
  }

  return trimmed;
}

export function splitQuotedReply(text: string): { quotedText: string; bodyText: string } {
  const prefix = '[Replying to: "';
  const endMarker = '"]\n';
  if (!text.startsWith(prefix)) {
    return { quotedText: "", bodyText: text };
  }

  const endIndex = text.lastIndexOf(endMarker);
  if (endIndex === -1) {
    return { quotedText: "", bodyText: text };
  }

  return {
    quotedText: text.slice(prefix.length, endIndex),
    bodyText: text.slice(endIndex + endMarker.length),
  };
}

export function isBareSingleReference(text: string): boolean {
  const { bodyText } = splitQuotedReply(text);
  const trimmed = sanitizeLeadingMarkers(bodyText).trim();
  return BARE_SINGLE_REFERENCE_PATTERN.test(trimmed);
}

function extractTransactionIds(text: string): string[] {
  return [...new Set(text.match(TRANSACTION_ID_PATTERN) ?? [])];
}

function resolveQuotedTransactionIds(
  quotedText: string,
  recentTransactions: SimpleTransaction[],
): string[] {
  if (!quotedText.trim()) {
    return [];
  }

  const explicitIds = extractTransactionIds(quotedText);
  if (explicitIds.length > 0) {
    return explicitIds;
  }

  const normalizedQuoted = normalize(quotedText);
  const lowerQuoted = quotedText.toLowerCase();

  const strongMatches = recentTransactions.filter((transaction) => {
    const payeeMatch = quotedMentionsPayee(lowerQuoted, normalizedQuoted, transaction.payee);
    if (!payeeMatch) {
      return false;
    }

    return quotedMentionsAmount(quotedText, transaction.amount) || quotedText.includes(transaction.date);
  });

  if (strongMatches.length > 0) {
    return [...new Set(strongMatches.map((transaction) => transaction.id))];
  }

  const payeeOnlyMatches = recentTransactions.filter((transaction) =>
    quotedMentionsPayee(lowerQuoted, normalizedQuoted, transaction.payee),
  );

  return payeeOnlyMatches.length === 1 ? [payeeOnlyMatches[0]!.id] : [];
}

export function inferReferencedTransactionIds(
  text: string,
  candidateTransactions: SimpleTransaction[],
): string[] {
  if (!text.trim()) {
    return [];
  }

  const explicitIds = extractTransactionIds(text);
  if (explicitIds.length > 0) {
    return explicitIds;
  }

  const normalizedText = normalize(text);
  const lowerText = text.toLowerCase();
  const strongMatches = candidateTransactions.filter((transaction) => {
    const payeeMatch = quotedMentionsPayee(lowerText, normalizedText, transaction.payee);
    if (!payeeMatch) {
      return false;
    }

    return quotedMentionsAmount(text, transaction.amount) || text.includes(transaction.date);
  });
  const payeeOnlyMatches = candidateTransactions.filter((transaction) =>
    quotedMentionsPayee(lowerText, normalizedText, transaction.payee),
  );

  if (strongMatches.length > 0) {
    return [...new Set([
      ...strongMatches.map((transaction) => transaction.id),
      ...payeeOnlyMatches.map((transaction) => transaction.id),
    ])];
  }

  return [...new Set(payeeOnlyMatches.map((transaction) => transaction.id))];
}

function quotedMentionsPayee(lowerQuoted: string, normalizedQuoted: string, payee: string): boolean {
  const lowerPayee = payee.toLowerCase();
  if (lowerQuoted.includes(lowerPayee)) {
    return true;
  }

  const normalizedPayee = normalize(payee);
  if (normalizedPayee.length >= 4 && normalizedQuoted.includes(normalizedPayee)) {
    return true;
  }

  return payee
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4)
    .some((token) => lowerQuoted.includes(token));
}

function quotedMentionsAmount(text: string, amount: number): boolean {
  const amountTokens = new Set([
    amount.toFixed(2),
    String(amount),
    String(Math.trunc(amount)),
  ]);

  return [...amountTokens].some((token) => token.length > 0 && text.includes(token));
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function sanitizeLeadingMarkers(text: string): string {
  return text.replace(/^[\s>^•*\-]+/, "");
}
