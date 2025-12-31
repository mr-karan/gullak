"""Custom tools for the Gullak agent using Anthropic Python SDK."""

import json
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from gullak.ledger.models import PendingTransaction, Transaction
from gullak.ledger.parser import LedgerParser
from gullak.ledger.validator import LedgerValidator
from gullak.ledger.memory import PayeeMemory


class ToolState:
    """Shared state for tools."""

    ledger_path: Path = Path("./data/main.ledger")
    default_currency: str = "INR"
    pending_transactions: dict[str, PendingTransaction] = {}
    parser: LedgerParser | None = None
    validator: LedgerValidator | None = None
    memory: PayeeMemory | None = None


_state = ToolState()


def _get_pending_file() -> Path:
    """Get path to pending transactions file."""
    return _state.ledger_path.parent / ".pending.json"


def _save_pending() -> None:
    """Persist pending transactions to disk."""
    pending_file = _get_pending_file()
    if not _state.pending_transactions:
        if pending_file.exists():
            pending_file.unlink()
        return

    data = {k: v.model_dump(mode="json") for k, v in _state.pending_transactions.items()}
    pending_file.write_text(json.dumps(data, indent=2, default=str))


def _load_pending() -> None:
    """Load pending transactions from disk."""
    pending_file = _get_pending_file()
    if not pending_file.exists():
        return

    try:
        data = json.loads(pending_file.read_text())
        for k, v in data.items():
            _state.pending_transactions[k] = PendingTransaction.model_validate(v)
    except (json.JSONDecodeError, Exception):
        pass


def configure_tools(
    ledger_path: Path,
    default_currency: str,
    parser: LedgerParser | None = None,
    validator: LedgerValidator | None = None,
) -> None:
    """Configure global tool state."""
    _state.ledger_path = ledger_path
    _state.default_currency = default_currency
    _state.parser = parser or LedgerParser()
    _state.validator = validator or LedgerValidator()
    _state.memory = PayeeMemory(ledger_path)
    _load_pending()


def get_pending_transactions() -> dict[str, PendingTransaction]:
    """Get pending transactions (for API layer)."""
    return _state.pending_transactions


def clear_pending_transaction(txn_id: str) -> PendingTransaction | None:
    """Remove and return a pending transaction."""
    result = _state.pending_transactions.pop(txn_id, None)
    if result is not None:
        _save_pending()
    return result


# Tool definitions in Anthropic API format
TOOL_DEFINITIONS = [
    {
        "name": "parse_expense",
        "description": """Parse natural language expense input and create a transaction preview.

Use this tool when the user mentions spending money, paying for something,
or buying something. Examples: "spent 500 on groceries", "paid rent",
"bought coffee at Starbucks".""",
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
                    "description": "Expense account path like 'Expenses:Food:Groceries' or 'Expenses:Transport:Fuel'",
                },
                "payment_account": {
                    "type": "string",
                    "description": "Payment source account like 'Assets:Cash' or 'Assets:Bank:HDFC'. Default: 'Assets:Cash'",
                },
                "currency": {
                    "type": "string",
                    "description": "Currency code (INR, USD, EUR). Default: INR",
                },
                "transaction_date": {
                    "type": "string",
                    "description": "Date in YYYY-MM-DD format, or relative like 'today', 'yesterday'. Default: today",
                },
                "note": {"type": "string", "description": "Optional note about the transaction"},
            },
            "required": ["payee", "amount", "expense_account"],
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
                    "description": "Account pattern (e.g., 'Expenses:Food' or 'Assets'). Leave empty for all accounts.",
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
                    "description": "Filter by type: 'all', 'expenses', 'assets', 'liabilities', 'income'",
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
                    "description": "The bank/card account for these transactions (e.g., Assets:Bank:HDFC)",
                },
                "default_expense_account": {
                    "type": "string",
                    "description": "Default expense account for uncategorized transactions",
                },
            },
            "required": ["file_path", "payment_account"],
        },
    },
]


def execute_tool(name: str, args: dict[str, Any]) -> str:
    """Execute a tool by name with given arguments."""
    if name == "parse_expense":
        return _parse_expense(args)
    elif name == "query_balance":
        return _query_balance(args)
    elif name == "list_accounts":
        return _list_accounts(args)
    elif name == "edit_transaction":
        return _edit_transaction(args)
    elif name == "delete_transaction":
        return _delete_transaction(args)
    elif name == "get_recent_transactions":
        return _get_recent_transactions(args)
    elif name == "learn_payee_mapping":
        return _learn_payee_mapping(args)
    elif name == "import_csv":
        return _import_csv(args)
    else:
        return json.dumps({"error": f"Unknown tool: {name}"})


def _parse_expense(args: dict[str, Any]) -> str:
    """Parse expense and create pending transaction."""
    from gullak.ledger.categories import suggest_category

    try:
        # Parse date (handle relative dates)
        txn_date = _parse_date_string(args.get("transaction_date", ""))
        used_currency = args.get("currency") or _state.default_currency

        # Determine expense account with smart suggestions
        expense_account = args.get("expense_account")
        if not expense_account or expense_account == "Expenses:Unknown":
            # Try payee memory first
            if _state.memory:
                expense_account = _state.memory.suggest_account(args["payee"])

            # Fall back to pattern-based suggestion
            if not expense_account:
                expense_account = suggest_category(args["payee"], float(args["amount"]))

            # Final fallback
            if not expense_account:
                expense_account = "Expenses:Other"

        # Create transaction
        txn = Transaction.create_expense(
            date=txn_date,
            payee=args["payee"],
            amount=Decimal(str(args["amount"])),
            expense_account=expense_account,
            payment_account=args.get("payment_account", "Assets:Cash"),
            currency=used_currency,
            note=args.get("note"),
        )

        # Create pending transaction
        pending = PendingTransaction(
            id=txn.gullak_id,
            transaction=txn,
            source_text=f"{args['payee']} - {args['amount']} {used_currency}",
        )

        _state.pending_transactions[pending.id] = pending
        _save_pending()

        return json.dumps(
            {
                "status": "pending",
                "id": pending.id,
                "preview": pending.ledger_preview,
                "transaction": {
                    "date": str(txn.date),
                    "payee": txn.payee,
                    "amount": float(txn.total_amount),
                    "currency": txn.postings[0].currency,
                    "expense_account": txn.postings[0].account,
                    "payment_account": txn.postings[1].account,
                },
                "message": "Transaction preview created. Ask user to confirm or modify.",
            }
        )

    except Exception as e:
        return json.dumps({"error": f"Error parsing expense: {e}"})


def _query_balance(args: dict[str, Any]) -> str:
    """Query balance from ledger."""
    if _state.validator is None:
        return json.dumps({"error": "Validator not configured"})

    account = args.get("account", "")
    period = args.get("period", "")

    import asyncio

    async def _query():
        return await _state.validator.get_balance(
            _state.ledger_path,
            account=account,
            period=period,
        )

    # Run async query
    try:
        loop = asyncio.get_running_loop()
        # If we're already in an async context, create a task
        import concurrent.futures

        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(asyncio.run, _query())
            success, result = future.result()
    except RuntimeError:
        # No running loop, we can use asyncio.run directly
        success, result = asyncio.run(_query())

    if success:
        if result.strip():
            return json.dumps({"balance": result.strip()})
        else:
            msg = f"No transactions found for {account or 'all accounts'}"
            if period:
                msg += f" in {period}"
            return json.dumps({"message": msg})
    else:
        return json.dumps({"error": f"Query error: {result}"})


def _list_accounts(args: dict[str, Any]) -> str:
    """List accounts from ledger."""
    if _state.parser is None:
        return json.dumps({"error": "Parser not configured"})

    account_type = args.get("account_type", "all")

    try:
        if not _state.ledger_path.exists():
            return json.dumps(
                {"accounts": [], "message": "No ledger file found. Start adding transactions!"}
            )

        accounts = _state.parser.extract_accounts(_state.ledger_path)

        # Filter by type
        prefix_map = {
            "expenses": "Expenses:",
            "assets": "Assets:",
            "liabilities": "Liabilities:",
            "income": "Income:",
        }

        if account_type != "all" and account_type in prefix_map:
            prefix = prefix_map[account_type]
            accounts = {a for a in accounts if a.startswith(prefix)}

        sorted_accounts = sorted(accounts)

        if not sorted_accounts:
            return json.dumps({"accounts": [], "message": f"No {account_type} accounts found yet."})

        return json.dumps({"accounts": sorted_accounts})

    except Exception as e:
        return json.dumps({"error": f"Error listing accounts: {e}"})


def _edit_transaction(args: dict[str, Any]) -> str:
    """Edit an existing transaction."""
    from gullak.ledger.writer import LedgerWriter
    import asyncio

    txn_id = args.get("transaction_id")
    if not txn_id:
        return json.dumps({"error": "transaction_id is required"})

    updates = {}
    if "payee" in args:
        updates["payee"] = args["payee"]
    if "amount" in args:
        updates["amount"] = args["amount"]
    if "expense_account" in args:
        updates["expense_account"] = args["expense_account"]
    if "payment_account" in args:
        updates["payment_account"] = args["payment_account"]
    if "currency" in args:
        updates["currency"] = args["currency"]
    if "date" in args:
        updates["date"] = _parse_date_string(args["date"])
    if "note" in args:
        updates["note"] = args["note"]

    if not updates:
        return json.dumps({"error": "No updates provided"})

    async def _do_update():
        writer = LedgerWriter(_state.ledger_path, _state.validator)
        return await writer.update_transaction(txn_id, updates)

    try:
        try:
            loop = asyncio.get_running_loop()
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, _do_update())
                updated_txn = future.result()
        except RuntimeError:
            updated_txn = asyncio.run(_do_update())

        if updated_txn is None:
            return json.dumps({"error": f"Transaction {txn_id} not found"})

        return json.dumps(
            {
                "status": "updated",
                "transaction": {
                    "id": updated_txn.gullak_id,
                    "date": str(updated_txn.date),
                    "payee": updated_txn.payee,
                    "amount": float(updated_txn.total_amount),
                    "expense_account": updated_txn.postings[0].account
                    if updated_txn.postings
                    else "",
                    "payment_account": updated_txn.postings[1].account
                    if len(updated_txn.postings) > 1
                    else "",
                },
                "preview": updated_txn.to_ledger(),
                "message": "Transaction updated successfully.",
            }
        )
    except ValueError as e:
        return json.dumps({"error": str(e)})
    except Exception as e:
        return json.dumps({"error": f"Error updating transaction: {e}"})


def _delete_transaction(args: dict[str, Any]) -> str:
    """Delete a transaction."""
    from gullak.ledger.writer import LedgerWriter
    import asyncio

    txn_id = args.get("transaction_id")
    if not txn_id:
        return json.dumps({"error": "transaction_id is required"})

    if _state.parser is None:
        return json.dumps({"error": "Parser not configured"})

    transactions = _state.parser.parse_file(_state.ledger_path)
    target = None
    for txn in transactions:
        if txn.gullak_id == txn_id:
            target = txn
            break

    if target is None:
        return json.dumps({"error": f"Transaction {txn_id} not found"})

    async def _do_delete():
        writer = LedgerWriter(_state.ledger_path, _state.validator)
        return await writer.delete_transaction(txn_id)

    try:
        try:
            loop = asyncio.get_running_loop()
            import concurrent.futures

            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, _do_delete())
                deleted = future.result()
        except RuntimeError:
            deleted = asyncio.run(_do_delete())

        if not deleted:
            return json.dumps({"error": f"Failed to delete transaction {txn_id}"})

        return json.dumps(
            {
                "status": "deleted",
                "transaction": {
                    "id": target.gullak_id,
                    "date": str(target.date),
                    "payee": target.payee,
                    "amount": float(target.total_amount),
                },
                "message": f"Transaction '{target.payee}' deleted successfully.",
            }
        )
    except Exception as e:
        return json.dumps({"error": f"Error deleting transaction: {e}"})


def _get_recent_transactions(args: dict[str, Any]) -> str:
    """Get recent transactions."""
    if _state.parser is None:
        return json.dumps({"error": "Parser not configured"})

    limit = min(args.get("limit", 5), 20)
    account_filter = args.get("account", "")

    try:
        if not _state.ledger_path.exists():
            return json.dumps({"transactions": [], "message": "No transactions yet."})

        transactions = _state.parser.parse_file(_state.ledger_path)

        if account_filter:
            transactions = [
                t
                for t in transactions
                if any(account_filter.lower() in p.account.lower() for p in t.postings)
            ]

        transactions = sorted(transactions, key=lambda t: t.date, reverse=True)[:limit]

        result = []
        for txn in transactions:
            result.append(
                {
                    "id": txn.gullak_id,
                    "date": str(txn.date),
                    "payee": txn.payee,
                    "amount": float(txn.total_amount),
                    "expense_account": txn.postings[0].account if txn.postings else "",
                    "currency": txn.postings[0].currency if txn.postings else "INR",
                }
            )

        return json.dumps(
            {
                "transactions": result,
                "count": len(result),
            }
        )
    except Exception as e:
        return json.dumps({"error": f"Error getting transactions: {e}"})


def _parse_date_string(date_str: str) -> date:
    """Parse date string, handling relative dates."""
    if not date_str:
        return date.today()

    date_str = date_str.lower().strip()

    # Handle relative dates
    today = date.today()

    if date_str in ("today", "now"):
        return today

    if date_str == "yesterday":
        return today - timedelta(days=1)

    if date_str == "tomorrow":
        return today + timedelta(days=1)

    # Handle "X days ago"
    if "days ago" in date_str:
        try:
            days = int(date_str.split()[0])
            return today - timedelta(days=days)
        except (ValueError, IndexError):
            pass

    # Handle "last <weekday>"
    weekdays = {
        "monday": 0,
        "tuesday": 1,
        "wednesday": 2,
        "thursday": 3,
        "friday": 4,
        "saturday": 5,
        "sunday": 6,
    }

    for day_name, day_num in weekdays.items():
        if day_name in date_str:
            days_ago = (today.weekday() - day_num) % 7
            if days_ago == 0:
                days_ago = 7  # "last Monday" means previous Monday
            return today - timedelta(days=days_ago)

    # Try ISO format
    try:
        return date.fromisoformat(date_str)
    except ValueError:
        pass

    # Try other common formats
    for fmt in ("%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            from datetime import datetime

            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue

    # Default to today
    return today


def _learn_payee_mapping(args: dict[str, Any]) -> str:
    """Learn a payee->account mapping."""
    if _state.memory is None:
        return json.dumps({"error": "Memory not configured"})

    payee = args.get("payee", "").strip()
    account = args.get("account", "").strip()

    if not payee or not account:
        return json.dumps({"error": "Both payee and account are required"})

    _state.memory.add_mapping(payee, account)

    return json.dumps(
        {
            "status": "learned",
            "payee": payee,
            "account": account,
            "message": f"Will remember: {payee} -> {account}",
        }
    )


def _import_csv(args: dict[str, Any]) -> str:
    """Import transactions from CSV."""
    from gullak.import_ import CSVProcessor
    from gullak.ledger.categories import suggest_category

    file_path = Path(args.get("file_path", ""))
    payment_account = args.get("payment_account", "Assets:Bank")
    default_account = args.get("default_expense_account", "Expenses:Unknown")

    if not file_path.exists():
        return json.dumps({"error": f"File not found: {file_path}"})

    # Get existing transaction hashes for duplicate detection
    existing_hashes: set[str] = set()
    if _state.parser and _state.ledger_path.exists():
        existing_txns = _state.parser.parse_file(_state.ledger_path)
        existing_hashes = CSVProcessor.get_existing_hashes(existing_txns)

    # Process CSV
    processor = CSVProcessor(existing_hashes)
    result = processor.process_file(
        file_path,
        default_account=default_account,
        payment_account=payment_account,
    )

    if result.errors:
        return json.dumps({"error": "; ".join(result.errors)})

    # Create pending transactions
    pending_ids = []
    for imp_txn in result.transactions:
        # Try to suggest account from payee memory
        suggested_account = default_account
        if _state.memory:
            suggested = _state.memory.suggest_account(imp_txn.payee)
            if suggested:
                suggested_account = suggested

        # Fall back to pattern matching
        if suggested_account == default_account:
            pattern_suggestion = suggest_category(
                imp_txn.payee,
                float(imp_txn.amount),
                imp_txn.is_credit,
            )
            if pattern_suggestion:
                suggested_account = pattern_suggestion

        txn = imp_txn.to_transaction(
            expense_account=suggested_account,
            payment_account=payment_account,
        )

        pending = PendingTransaction(
            id=txn.gullak_id,
            transaction=txn,
            source_text=f"CSV import row {imp_txn.source_row}: {imp_txn.payee}",
        )

        _state.pending_transactions[pending.id] = pending
        pending_ids.append(pending.id)

    _save_pending()

    return json.dumps(
        {
            "status": "imported",
            "total_rows": result.total_rows,
            "imported": len(result.transactions),
            "duplicates": len(result.duplicates),
            "skipped": result.skipped_rows,
            "template": result.template_used,
            "pending_ids": pending_ids,
            "message": f"Imported {len(result.transactions)} transactions. {len(result.duplicates)} duplicates skipped. Review and confirm.",
        }
    )


# Export for agent
TOOLS = TOOL_DEFINITIONS
