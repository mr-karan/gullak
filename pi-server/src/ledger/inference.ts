import type { SimpleTransaction } from "./models.js";

const CATEGORY_PATTERNS: Array<{ pattern: RegExp; account: string }> = [
  { pattern: /salary|payroll|stipend/i, account: "Income:Salary" },
  { pattern: /interest\s*(credit|credited|received|earned)|int\s*cr/i, account: "Income:Interest" },
  { pattern: /refund|cashback/i, account: "Income:Refund" },
  { pattern: /swiggy|zomato|uber\s*eats|dunzo/i, account: "Expenses:Food:Delivery" },
  { pattern: /starbucks|costa|cafe|coffee|barista|ccd/i, account: "Expenses:Food:Coffee" },
  { pattern: /mcdonald|domino|pizza|burger|kfc|subway|taco/i, account: "Expenses:Food:FastFood" },
  { pattern: /restaurant|bistro|dhaba/i, account: "Expenses:Food:Restaurants" },
  {
    pattern:
      /bigbasket|blinkit|zepto|jiomart|grofers|d-?mart|supermarket|grocery|licious|country\s*delight/i,
    account: "Expenses:Food:Groceries",
  },
  { pattern: /uber|ola|rapido|meru|cab|taxi/i, account: "Expenses:Transport:Rides" },
  { pattern: /shell|petrol|fuel|diesel|cng|indian\s*oil|bharat\s*petroleum/i, account: "Expenses:Transport:Fuel" },
  { pattern: /metro|bus|public\s*transport/i, account: "Expenses:Transport:PublicTransit" },
  { pattern: /amazon|flipkart|myntra|ajio|meesho/i, account: "Expenses:Shopping:Online" },
  { pattern: /netflix|hotstar|prime\s*video|spotify|youtube\s*music/i, account: "Expenses:Entertainment:Streaming" },
  { pattern: /electricity|power|bescom|tata\s*power/i, account: "Expenses:Utilities:Electricity" },
  { pattern: /airtel|jio|vodafone|vi|mobile|recharge/i, account: "Expenses:Utilities:Mobile" },
  { pattern: /broadband|internet|wifi|fibernet/i, account: "Expenses:Utilities:Internet" },
  { pattern: /apollo|pharmacy|medical|medicine|1mg|netmeds/i, account: "Expenses:Health:Pharmacy" },
  { pattern: /gym|fitness|cult/i, account: "Expenses:Health:Fitness" },
  { pattern: /rent|housing|apartment/i, account: "Expenses:Housing:Rent" },
  { pattern: /atm\s*withdraw|cash\s*withdraw|withdrawal/i, account: "Expenses:Cash" },
];

export function suggestExpenseAccount(payee: string, amount: number, note?: string): string {
  const haystack = `${payee} ${note ?? ""}`.trim();

  for (const entry of CATEGORY_PATTERNS) {
    if (entry.account.startsWith("Expenses:") && entry.pattern.test(haystack)) {
      return entry.account;
    }
  }

  if (/lunch|dinner|breakfast|brunch|meal|cafe|bakery/i.test(haystack)) {
    return "Expenses:Food:Restaurants";
  }

  return "Expenses:Other";
}

export function suggestIncomeAccount(payee: string): string {
  for (const entry of CATEGORY_PATTERNS) {
    if (entry.account.startsWith("Income:") && entry.pattern.test(payee)) {
      return entry.account;
    }
  }

  return "Income:Other";
}

export function suggestPaymentAccount(
  knownAccounts: string[],
  recentTransactions: SimpleTransaction[],
  amount: number,
): string {
  if (amount < 100 && knownAccounts.includes("Assets:Cash")) {
    return "Assets:Cash";
  }

  const preferred = mostCommon(
    recentTransactions.map((transaction) => transaction.paymentAccount).filter(Boolean) as string[],
  );
  if (preferred) {
    return preferred;
  }

  const fallback = knownAccounts.find(
    (account) => account.startsWith("Assets:") || account.startsWith("Liabilities:"),
  );
  return fallback ?? "Assets:Cash";
}

export function suggestDepositAccount(
  knownAccounts: string[],
  recentTransactions: SimpleTransaction[],
): string {
  const preferred = mostCommon(
    recentTransactions.map((transaction) => transaction.depositAccount).filter(Boolean) as string[],
  );
  if (preferred) {
    return preferred;
  }

  const fallback = knownAccounts.find(
    (account) => account.startsWith("Assets:") || account.startsWith("Liabilities:"),
  );
  return fallback ?? "Assets:Cash";
}

export function resolveExpenseAccountHint(hint: string | undefined, knownAccounts: string[]): string | undefined {
  return resolveAccountHint(hint, knownAccounts, ["Expenses:"]);
}

export function resolvePaymentAccountHint(hint: string | undefined, knownAccounts: string[]): string | undefined {
  return resolveAccountHint(hint, knownAccounts, ["Assets:", "Liabilities:"]);
}

export function resolveIncomeAccountHint(hint: string | undefined, knownAccounts: string[]): string | undefined {
  return resolveAccountHint(hint, knownAccounts, ["Income:"]);
}

export function resolveDepositAccountHint(hint: string | undefined, knownAccounts: string[]): string | undefined {
  return resolveAccountHint(hint, knownAccounts, ["Assets:", "Liabilities:"]);
}

function resolveAccountHint(
  hint: string | undefined,
  knownAccounts: string[],
  allowedPrefixes: string[],
): string | undefined {
  if (!hint) {
    return undefined;
  }

  const trimmed = hint.trim();
  if (!trimmed) {
    return undefined;
  }

  const candidates = knownAccounts.filter((account) =>
    allowedPrefixes.some((prefix) => account.startsWith(prefix))
  );

  const exact = candidates.find((account) => account.toLowerCase() === trimmed.toLowerCase());
  if (exact) {
    return exact;
  }

  if (trimmed.includes(":")) {
    return undefined;
  }

  const normalizedHint = normalize(trimmed);
  const hintTokens = tokenize(trimmed);
  let best: { account: string; score: number } | undefined;

  for (const account of candidates) {
    const accountLower = account.toLowerCase();
    let score = 0;

    if (accountLower.includes(trimmed.toLowerCase()) || normalizedHint.includes(normalize(account))) {
      score += 10;
    }

    const accountTokens = tokenize(account);
    for (const token of hintTokens) {
      if (accountTokens.includes(token)) {
        score += token.length >= 4 ? 4 : 2;
      }
    }

    if (/cash/i.test(trimmed) && /cash/i.test(account)) {
      score += 8;
    }

    if (/upi/i.test(trimmed) && /bank|upi/i.test(account)) {
      score += 3;
    }

    if (/card/i.test(trimmed) && /card|credit/i.test(account)) {
      score += 4;
    }

    if (score > (best?.score ?? 0)) {
      best = { account, score };
    }
  }

  return (best?.score ?? 0) >= 4 ? best!.account : undefined;
}
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokenize(value: string): string[] {
  return value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function mostCommon(values: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
}
