---
summary: "Plain-text accounting format, ledger structure, and customization"
read_when:
  - Understanding the ledger file format
  - Customizing accounts and categories
  - Manually editing the ledger
---

# Plain-Text Accounting in Gullak

Gullak is built on the philosophy of **Plain-Text Accounting (PTA)**. This means your financial data is stored in a human-readable, version-controllable, and future-proof text format; specifically, the [ledger-cli](https://ledger-cli.org/) format.

## What is Plain-Text Accounting?

Plain-text accounting is a method of managing finances where your journal is a simple text file. Unlike proprietary databases or spreadsheets, PTA files are:
- **Readable**: You can open them in any text editor.
- **Durable**: The format hasn't changed in decades and will likely be readable decades from now.
- **Flexible**: You can use a variety of tools (Gullak, Ledger, hledger, Paisa) to report on the same file.
- **Private**: Your data stays in your files, not on a third-party server.

## Ledger File Format Basics

The core of your data resides in `.ledger` files. Gullak automatically manages these, but you can also edit them manually.

### Transaction Structure

A typical transaction in Gullak looks like this:

```ledger
2024/01/15 * Starbucks
    ; Morning caffeine
    Expenses:Food:Coffee       150.00 INR  ; gullak:id a1b2c3d4
    Assets:Bank:HDFC          -150.00 INR
```

- **Header**: `2024/01/15 * Starbucks`
  - `2024/01/15`: The date in `YYYY/MM/DD` format.
  - `*`: The status (Cleared). Gullak uses `*` for confirmed and `!` for pending.
  - `Starbucks`: The payee (who you paid or who paid you).
- **Note**: Lines starting with `;` immediately under the header are notes.
- **Postings**: Indented lines representing the flow of money.
  - `Expenses:Food:Coffee`: The account where money went.
  - `150.00 INR`: The amount and currency.
  - `; gullak:id ...`: A unique identifier Gullak uses to track transactions across updates and deletions.
- **Balancing**: In double-entry bookkeeping, every transaction must balance to zero. Gullak ensures this by creating at least two postings (e.g., an Expense and an Asset).

### Accounts Hierarchy

Accounts are organized hierarchically using colons (`:`). Common top-level accounts in Gullak include:

- **Assets**: Money you have (e.g., `Assets:Bank:HDFC`, `Assets:Cash`).
- **Expenses**: Money you've spent (e.g., `Expenses:Food:Groceries`, `Expenses:Transport:Fuel`).
- **Income**: Money you've earned (e.g., `Income:Salary`, `Income:Interest`).
- **Liabilities**: Money you owe (e.g., `Liabilities:CreditCard:Amex`).

## Account Hierarchy in Gullak

### Default Accounts
When you first set up Gullak, it creates a set of common accounts:
- `Assets:Cash`
- `Assets:Bank:Default`
- `Liabilities:CreditCard:Default`
- `Income:Salary`
- Various `Expenses:*` categories like Food, Transport, Housing, etc.

### Custom Accounts
You can add custom accounts in two ways:
1. **Via UI**: Go to **Settings > Accounts** or **Settings > Categories** to add new bank accounts, credit cards, or expense categories.
2. **Manual Edit**: Add a line like `account Assets:Bank:MyNewBank` to your ledger file.

## Currency Handling

Gullak defaults to `INR` (Indian Rupee) but supports any currency code. 
- **Symbols**: While symbols like `₹` or `$` are supported, Gullak internally maps them to standard ISO codes like `INR` or `USD` for better compatibility with CLI tools.
- **Default Currency**: Set your primary currency during the setup wizard or via the `GULLAK_DEFAULT_CURRENCY` environment variable.

## Manual Editing

Since your data is just text, you can open your ledger file (usually located at `/data/main.ledger` in Docker) with any text editor to:
- Bulk edit payees or accounts.
- Add historical data.
- Fix mistakes that are easier to handle via find-and-replace.

> [!TIP]
> Always keep a backup or use Git to version control your ledger file before making large manual edits.

## Validation

Gullak automatically validates every transaction before writing it to the file using `ledger-cli` (or `hledger`). This ensures your file never gets corrupted with unbalanced transactions or syntax errors.

If you are editing manually, you can run:
```bash
ledger -f main.ledger balance
```
If there are errors, `ledger` will tell you exactly which line is causing the issue.

## Paisa Integration

Gullak integrates with [Paisa](https://paisa.fyi). 
- **Real-time Sync**: Whenever Gullak writes a transaction, it pings Paisa to refresh its database.
- **Shared Files**: Both tools read the same `.ledger` files.
- **Configuration**: Paisa settings (like budget targets or credit card limits) are managed in `paisa.yaml` in the same data directory.

---
*For more information on the CLI tools themselves, visit [ledger-cli.org](https://ledger-cli.org/).*
