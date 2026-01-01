TOOL_DEFINITIONS = [
    {
        "name": "parse_expense",
        "description": """Parse natural language expense and create a transaction preview.

Use when user mentions spending: "chai 50 rupees", "ordered from Swiggy 350",
"paid rent 15000", "petrol 2000 from ICICI card", "SIP deducted 5000".""",
        "input_schema": {
            "type": "object",
            "properties": {
                "payee": {
                    "type": "string",
                    "description": "Merchant or payee name (e.g., 'BigBasket', 'Swiggy', 'Amazon')",
                },
                "amount": {
                    "type": "number",
                    "description": "Positive amount of the expense (e.g., 500, 1250.50)",
                },
                "expense_account": {
                    "type": "string",
                    "description": "Expense account path like 'Expenses:Food:Groceries', 'Expenses:Transport:Fuel', 'Expenses:Housing:Rent'",
                },
                "payment_account": {
                    "type": "string",
                    "description": "Payment source like 'Assets:Cash', 'Assets:Bank:HDFC', 'Assets:Bank:ICICI', 'Liabilities:CreditCard:HDFC'. Default: Assets:Cash",
                },
                "currency": {
                    "type": "string",
                    "description": "Currency code (INR, USD, EUR). Default: INR",
                },
                "transaction_date": {
                    "type": "string",
                    "description": "Date in YYYY-MM-DD format, or relative like 'today', 'yesterday', 'last Monday'. Default: today",
                },
                "note": {"type": "string", "description": "Optional note about the transaction"},
                "is_recurring": {
                    "type": "boolean",
                    "description": "True for recurring expenses like subscriptions, bills, SIPs, EMIs (e.g., 'monthly rent', 'Netflix subscription', 'SIP deducted')",
                },
                "recurring_name": {
                    "type": "string",
                    "description": "Name for the recurring expense (e.g., 'Netflix', 'Rent')",
                },
                "recurring_period": {
                    "type": "string",
                    "description": "Period pattern for Paisa: '1 * ?' for 1st of month, 'L * ?' for last day, '? * 0' for every Sunday, '15 * ?' for 15th",
                },
            },
            "required": ["payee", "amount", "expense_account"],
        },
    },
    {
        "name": "parse_income",
        "description": """Parse income/earnings and create a transaction preview.

Use when user mentions receiving: "salary credited 75000", "FD interest 5000",
"got refund from Amazon", "dividend from stocks", "cashback received".""",
        "input_schema": {
            "type": "object",
            "properties": {
                "payee": {
                    "type": "string",
                    "description": "Source of income like employer name, 'HDFC Bank Interest', 'Amazon Refund', 'Zerodha Dividend'",
                },
                "amount": {
                    "type": "number",
                    "description": "Amount received (positive number)",
                },
                "income_account": {
                    "type": "string",
                    "description": "Income account like 'Income:Salary' or 'Income:Interest'",
                },
                "deposit_account": {
                    "type": "string",
                    "description": "Account where money was deposited (e.g., 'Assets:Bank:HDFC')",
                },
                "currency": {
                    "type": "string",
                    "description": "Currency code (INR, USD, EUR). Default: INR",
                },
                "transaction_date": {
                    "type": "string",
                    "description": "Date in YYYY-MM-DD format, or relative like 'today', 'yesterday'. Default: today",
                },
                "note": {"type": "string", "description": "Optional note"},
            },
            "required": ["payee", "amount", "income_account", "deposit_account"],
        },
    },
    {
        "name": "query_balance",
        "description": """Query account balances from the ledger.

Use this when the user asks about spending, balances, or totals.
Examples: "How much did I spend on food?", "What's my balance?",
"Total expenses this month".""",
        "input_schema": {
            "type": "object",
            "properties": {
                "account": {
                    "type": "string",
                    "description": "Account pattern like 'Expenses:Food', 'Assets:Bank', 'Liabilities'. Leave empty for all accounts.",
                },
                "period": {
                    "type": "string",
                    "description": "Time period (e.g., 'this month', 'last week', '2024')",
                },
            },
            "required": [],
        },
    },
    {
        "name": "list_accounts",
        "description": """List available accounts in the ledger.

Use this to help categorize expenses correctly or show the user
their account structure.""",
        "input_schema": {
            "type": "object",
            "properties": {
                "account_type": {
                    "type": "string",
                    "enum": ["all", "expenses", "assets", "liabilities", "income"],
                    "description": "Filter: 'all', 'expenses', 'assets', 'liabilities', 'income'",
                }
            },
            "required": [],
        },
    },
    {
        "name": "edit_transaction",
        "description": """Edit an existing transaction in the ledger.

Use when user says "change that", "update the expense", "fix the amount",
"actually it was 400 not 500", "move that to a different category", etc.

You need the transaction ID. Use get_recent_transactions first if you don't have it.""",
        "input_schema": {
            "type": "object",
            "properties": {
                "transaction_id": {
                    "type": "string",
                    "description": "The gullak ID of the transaction to edit (8-char hex string)",
                },
                "payee": {
                    "type": "string",
                    "description": "New payee name (optional)",
                },
                "amount": {
                    "type": "number",
                    "description": "New amount (optional)",
                },
                "expense_account": {
                    "type": "string",
                    "description": "New expense account (optional)",
                },
                "payment_account": {
                    "type": "string",
                    "description": "New payment account (optional)",
                },
                "currency": {
                    "type": "string",
                    "description": "New currency code (optional)",
                },
                "date": {
                    "type": "string",
                    "description": "New date in YYYY-MM-DD format (optional)",
                },
                "note": {
                    "type": "string",
                    "description": "New note (optional)",
                },
            },
            "required": ["transaction_id"],
        },
    },
    {
        "name": "delete_transaction",
        "description": """Delete a transaction from the ledger.

Use when user says "delete that", "remove the expense", "that was a mistake",
"cancel that transaction", etc.

You need the transaction ID. Use get_recent_transactions first if you don't have it.""",
        "input_schema": {
            "type": "object",
            "properties": {
                "transaction_id": {
                    "type": "string",
                    "description": "The gullak ID of the transaction to delete (8-char hex string)",
                },
            },
            "required": ["transaction_id"],
        },
    },
    {
        "name": "get_recent_transactions",
        "description": """Get recent transactions from the ledger.

Use this to find transaction IDs for editing or deleting.
Also useful when user asks "what did I spend recently?" or "show my last few expenses".""",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {
                    "type": "integer",
                    "description": "Number of transactions to return (default: 5, max: 20)",
                },
                "account": {
                    "type": "string",
                    "description": "Filter by account pattern (optional)",
                },
            },
            "required": [],
        },
    },
    {
        "name": "learn_payee_mapping",
        "description": """Remember that a payee should always use a specific account.

Use when user says "Swiggy should always be Food:Delivery",
"remember that Amazon is Shopping", etc.""",
        "input_schema": {
            "type": "object",
            "properties": {
                "payee": {
                    "type": "string",
                    "description": "The payee/merchant name",
                },
                "account": {
                    "type": "string",
                    "description": "The expense account to associate",
                },
            },
            "required": ["payee", "account"],
        },
    },
    {
        "name": "import_csv",
        "description": """Import transactions from a CSV file.

Use when user uploads a bank statement or CSV file.
Returns a list of transactions for review and confirmation.""",
        "input_schema": {
            "type": "object",
            "properties": {
                "file_path": {
                    "type": "string",
                    "description": "Path to the CSV file",
                },
                "payment_account": {
                    "type": "string",
                    "description": "The bank/card account for these transactions like 'Assets:Bank:HDFC', 'Assets:Bank:ICICI', 'Assets:Bank:SBI'",
                },
                "default_expense_account": {
                    "type": "string",
                    "description": "Default expense account for uncategorized transactions",
                },
            },
            "required": ["file_path", "payment_account"],
        },
    },
    {
        "name": "set_budget",
        "description": """Set monthly budget targets for expense categories.

Use when user wants to set spending limits: "budget 15k for rent, 10k for food",
"set monthly budget", "I want to spend max 5000 on entertainment".""",
        "input_schema": {
            "type": "object",
            "properties": {
                "budgets": {
                    "type": "array",
                    "description": "List of budget entries",
                    "items": {
                        "type": "object",
                        "properties": {
                            "account": {
                                "type": "string",
                                "description": "Expense account (e.g., Expenses:Food)",
                            },
                            "amount": {"type": "number", "description": "Monthly budget amount"},
                        },
                        "required": ["account", "amount"],
                    },
                },
                "funding_account": {
                    "type": "string",
                    "description": "Account to fund from (default: Assets:Checking)",
                },
            },
            "required": ["budgets"],
        },
    },
    {
        "name": "add_credit_card",
        "description": """Add a credit card to track in Paisa.

Use when user mentions adding a credit card: "add my HDFC credit card",
"track my Amex card with 2 lakh limit", "credit card due on 15th".""",
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Card name (e.g., 'HDFC', 'Amex', 'ICICI Amazon')",
                },
                "credit_limit": {
                    "type": "integer",
                    "description": "Credit limit in default currency",
                },
                "statement_end_day": {
                    "type": "integer",
                    "description": "Day of month when statement closes (1-31)",
                },
                "due_day": {
                    "type": "integer",
                    "description": "Day of month when payment is due (1-31)",
                },
                "network": {
                    "type": "string",
                    "enum": ["visa", "mastercard", "amex", "rupay", "diners"],
                    "description": "Card network",
                },
            },
            "required": ["name", "credit_limit"],
        },
    },
    {
        "name": "set_allocation_targets",
        "description": """Set asset allocation targets for portfolio rebalancing.

Use when user mentions asset allocation: "I want 60% equity and 40% debt",
"set allocation to 70-30 equity debt", "rebalance targets".""",
        "input_schema": {
            "type": "object",
            "properties": {
                "targets": {
                    "type": "array",
                    "description": "List of allocation targets (must sum to 100)",
                    "items": {
                        "type": "object",
                        "properties": {
                            "name": {
                                "type": "string",
                                "description": "Asset class name (e.g., 'Equity', 'Debt')",
                            },
                            "target": {
                                "type": "integer",
                                "description": "Target percentage (0-100)",
                            },
                            "accounts": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Account patterns (e.g., ['Assets:Equity:*'])",
                            },
                        },
                        "required": ["name", "target"],
                    },
                },
            },
            "required": ["targets"],
        },
    },
]

TOOLS = TOOL_DEFINITIONS
