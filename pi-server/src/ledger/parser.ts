import { type LedgerTransaction, type Posting, type TransactionStatus } from "./models.js";

const DATE_PATTERN = /^(\d{4}[-/]\d{2}[-/]\d{2})\s*([*!])?\s*(.+?)(?:\s*;\s*(.*))?$/;
const COMMENT_PATTERN = /^\s*;\s*(.*)$/;
const POSTING_LINE_PATTERN = /^\s{2,}(.+?)(?:\s{2,}(.+?))?(?:\s*;\s*(.*))?$/;
const ACCOUNT_DIRECTIVE_PATTERN = /^account\s+(\S+)/;
const GULLAK_ID_PATTERN = /gullak:id\s+(\w+)/;
const GULLAK_SOURCE_PATTERN = /gullak:source\s+(\w+)/;
const GULLAK_USER_PATTERN = /gullak:user\s+(.+)$/;
const TAG_PATTERN = /^(\w+):\s*(.+)$/;

interface WorkingTransaction {
  date: string;
  payee: string;
  status: TransactionStatus;
  postings: Posting[];
  missingPostings: Array<{ account: string; currency: string }>;
}

function parseAmount(raw: string): number | undefined {
  const normalized = raw.replaceAll(",", "").replaceAll("_", "");
  const value = Number.parseFloat(normalized);
  return Number.isFinite(value) ? Number(value.toFixed(2)) : undefined;
}

function parseStatus(raw: string | undefined): TransactionStatus {
  if (raw === "*" || raw === "!") {
    return raw;
  }

  return "";
}

function buildTransaction(
  current: WorkingTransaction | undefined,
  comments: string[],
): LedgerTransaction | undefined {
  if (!current || (current.postings.length === 0 && current.missingPostings.length === 0)) {
    return undefined;
  }

  if (current.missingPostings.length === 1 && current.postings.length > 0) {
    const missing = current.missingPostings[0];
    const balance = Number(
      (-current.postings.reduce((sum, posting) => sum + posting.amount, 0)).toFixed(2),
    );
    current.postings.push({
      account: missing.account,
      amount: balance,
      currency: missing.currency || current.postings[0]?.currency || "INR",
    });
  } else if (current.missingPostings.length > 0) {
    for (const missing of current.missingPostings) {
      current.postings.push({
        account: missing.account,
        amount: 0,
        currency: missing.currency || current.postings[0]?.currency || "INR",
      });
    }
  }

  let gullakId = "";
  let source: LedgerTransaction["source"];
  let sourceUser: string | undefined;
  let note: string | undefined;
  const tags: Record<string, string> = {};

  for (const comment of comments) {
    const idMatch = comment.match(GULLAK_ID_PATTERN);
    if (idMatch) {
      gullakId = idMatch[1];
      continue;
    }

    const sourceMatch = comment.match(GULLAK_SOURCE_PATTERN);
    if (sourceMatch) {
      source = sourceMatch[1] as LedgerTransaction["source"];
      continue;
    }

    const userMatch = comment.match(GULLAK_USER_PATTERN);
    if (userMatch) {
      sourceUser = userMatch[1].trim();
      continue;
    }

    const tagMatch = comment.match(TAG_PATTERN);
    if (tagMatch && tagMatch[1] !== "gullak") {
      tags[tagMatch[1]] = tagMatch[2];
      continue;
    }

    if (!note) {
      note = comment;
    }
  }

  return {
    date: current.date.replaceAll("/", "-"),
    payee: current.payee,
    status: current.status,
    postings: current.postings,
    note,
    tags,
    gullakId,
    source,
    sourceUser,
  };
}

export function parseLedger(content: string): LedgerTransaction[] {
  const transactions: LedgerTransaction[] = [];
  let current: WorkingTransaction | undefined;
  let comments: string[] = [];

  for (const line of content.split("\n")) {
    if (!line.trim()) {
      const built = buildTransaction(current, comments);
      if (built) {
        transactions.push(built);
      }
      current = undefined;
      comments = [];
      continue;
    }

    const headerMatch = line.match(DATE_PATTERN);
    if (headerMatch) {
      const previous = buildTransaction(current, comments);
      if (previous) {
        transactions.push(previous);
      }

      current = {
        date: headerMatch[1].replaceAll("/", "-"),
        status: parseStatus(headerMatch[2]),
        payee: headerMatch[3].trim(),
        postings: [],
        missingPostings: [],
      };
      comments = [];
      continue;
    }

    if (!current) {
      continue;
    }

    const commentMatch = line.match(COMMENT_PATTERN);
    if (commentMatch) {
      comments.push(commentMatch[1]);
      continue;
    }

    const postingMatch = line.match(POSTING_LINE_PATTERN);
    if (postingMatch) {
      const account = postingMatch[1].trim();
      const posting = parsePosting(postingMatch[2]);
      if (posting.amount !== undefined) {
        current.postings.push({
          account,
          amount: posting.amount,
          currency: posting.currency,
        });
      } else {
        current.missingPostings.push({ account, currency: posting.currency });
      }

      if (postingMatch[3]) {
        comments.push(postingMatch[3]);
      }
    }
  }

  const last = buildTransaction(current, comments);
  if (last) {
    transactions.push(last);
  }

  return transactions;
}

function parsePosting(rawAmount: string | undefined): { amount?: number; currency: string } {
  if (!rawAmount) {
    return { currency: "INR" };
  }

  const tokens = rawAmount.trim().split(/\s+/).filter(Boolean);
  const amountToken = tokens.find((token) => /^[-\d,_.]+$/.test(token));
  const amount = amountToken ? parseAmount(amountToken) : undefined;
  const amountIndex = amountToken ? tokens.indexOf(amountToken) : -1;
  const currencyCandidate = amountIndex >= 0 ? tokens[amountIndex + 1] : undefined;

  return {
    amount,
    currency:
      currencyCandidate && !currencyCandidate.startsWith("@") && !currencyCandidate.startsWith("{")
        ? currencyCandidate
        : "INR",
  };
}

export function extractAccounts(content: string): string[] {
  const accounts = new Set<string>();

  for (const line of content.split("\n")) {
    const match = line.match(ACCOUNT_DIRECTIVE_PATTERN);
    if (!match) {
      continue;
    }

    const parts = match[1].split(":");
    for (let index = 1; index <= parts.length; index += 1) {
      accounts.add(parts.slice(0, index).join(":"));
    }
  }

  for (const transaction of parseLedger(content)) {
    for (const posting of transaction.postings) {
      const parts = posting.account.split(":");
      for (let index = 1; index <= parts.length; index += 1) {
        accounts.add(parts.slice(0, index).join(":"));
      }
    }
  }

  return [...accounts].sort();
}

export function findTransactionSpan(
  lines: string[],
  gullakId: string,
): { start: number; end: number } | undefined {
  const marker = `gullak:id ${gullakId}`;
  let markerLine = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].includes(marker)) {
      markerLine = index;
      break;
    }
  }

  if (markerLine === -1) {
    return undefined;
  }

  let start = markerLine;
  for (let index = markerLine - 1; index >= 0; index -= 1) {
    if (!lines[index].trim()) {
      break;
    }

    if (DATE_PATTERN.test(lines[index])) {
      start = index;
      break;
    }
  }

  let end = markerLine + 1;
  for (let index = markerLine + 1; index < lines.length; index += 1) {
    if (!lines[index].trim()) {
      end = index;
      break;
    }
    end = index + 1;
  }

  return { start, end };
}
