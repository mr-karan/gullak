"""Custom tools for the Gullak agent using Anthropic Python SDK."""

import json
from datetime import date, timedelta
from decimal import Decimal
from pathlib import Path
from typing import Any

from gullak.ledger.models import PendingTransaction, Transaction
from gullak.ledger.parser import LedgerParser
from gullak.ledger.validator import LedgerValidator


# Global state for tools
class ToolState:
    """Shared state for tools."""

    ledger_path: Path = Path("./data/main.ledger")
    default_currency: str = "INR"
    pending_transactions: dict[str, PendingTransaction] = {}
    parser: LedgerParser | None = None
    validator: LedgerValidator | None = None


_state = ToolState()


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


def get_pending_transactions() -> dict[str, PendingTransaction]:
    """Get pending transactions (for API layer)."""
    return _state.pending_transactions


def clear_pending_transaction(txn_id: str) -> PendingTransaction | None:
    """Remove and return a pending transaction."""
    return _state.pending_transactions.pop(txn_id, None)


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
                    "description": "Merchant or payee name (e.g., 'BigBasket', 'Swiggy', 'Amazon')"
                },
                "amount": {
                    "type": "number",
                    "description": "Positive amount of the expense (e.g., 500, 1250.50)"
                },
                "expense_account": {
                    "type": "string",
                    "description": "Expense account path like 'Expenses:Food:Groceries' or 'Expenses:Transport:Fuel'"
                },
                "payment_account": {
                    "type": "string",
                    "description": "Payment source account like 'Assets:Cash' or 'Assets:Bank:HDFC'. Default: 'Assets:Cash'"
                },
                "currency": {
                    "type": "string",
                    "description": "Currency code (INR, USD, EUR). Default: INR"
                },
                "transaction_date": {
                    "type": "string",
                    "description": "Date in YYYY-MM-DD format, or relative like 'today', 'yesterday'. Default: today"
                },
                "note": {
                    "type": "string",
                    "description": "Optional note about the transaction"
                }
            },
            "required": ["payee", "amount", "expense_account"]
        }
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
                    "description": "Account pattern (e.g., 'Expenses:Food' or 'Assets'). Leave empty for all accounts."
                },
                "period": {
                    "type": "string",
                    "description": "Time period (e.g., 'this month', 'last week', '2024')"
                }
            },
            "required": []
        }
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
                    "description": "Filter by type: 'all', 'expenses', 'assets', 'liabilities', 'income'"
                }
            },
            "required": []
        }
    }
]


def execute_tool(name: str, args: dict[str, Any]) -> str:
    """Execute a tool by name with given arguments."""
    if name == "parse_expense":
        return _parse_expense(args)
    elif name == "query_balance":
        return _query_balance(args)
    elif name == "list_accounts":
        return _list_accounts(args)
    else:
        return json.dumps({"error": f"Unknown tool: {name}"})


def _parse_expense(args: dict[str, Any]) -> str:
    """Parse expense and create pending transaction."""
    try:
        # Parse date (handle relative dates)
        txn_date = _parse_date_string(args.get("transaction_date", ""))
        used_currency = args.get("currency") or _state.default_currency

        # Create transaction
        txn = Transaction.create_expense(
            date=txn_date,
            payee=args["payee"],
            amount=Decimal(str(args["amount"])),
            expense_account=args["expense_account"],
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

        # Store for later confirmation
        _state.pending_transactions[pending.id] = pending

        return json.dumps({
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
            "message": "Transaction preview created. Ask user to confirm or modify."
        })

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
            return json.dumps({
                "accounts": [],
                "message": "No ledger file found. Start adding transactions!"
            })

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
            return json.dumps({
                "accounts": [],
                "message": f"No {account_type} accounts found yet."
            })

        return json.dumps({"accounts": sorted_accounts})

    except Exception as e:
        return json.dumps({"error": f"Error listing accounts: {e}"})


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


# Export for agent
TOOLS = TOOL_DEFINITIONS
