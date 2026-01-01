import asyncio
import concurrent.futures
import json
import logging
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

from gullak.agent.tool_schemas import (
    AddCreditCardArgs,
    DeleteTransactionArgs,
    EditTransactionArgs,
    GetRecentTransactionsArgs,
    ImportCsvArgs,
    LearnPayeeMappingArgs,
    ListAccountsArgs,
    ParseExpenseArgs,
    ParseIncomeArgs,
    QueryBalanceArgs,
    SetAllocationTargetsArgs,
    SetBudgetArgs,
)
from gullak.config.paisa import AllocationTarget, PaisaConfigManager
from gullak.import_.processor import CSVProcessor
from gullak.ledger.categories import suggest_category
from gullak.ledger.memory import PayeeMemory
from gullak.ledger.models import BudgetEntry, PendingTransaction, PeriodicBudget, Transaction
from gullak.ledger.parser import LedgerParser
from gullak.ledger.validator import LedgerValidator
from gullak.ledger.writer import LedgerWriter

logger = logging.getLogger(__name__)


class ToolState:
    """Shared state for tools."""

    ledger_path: Path = Path("./data/main.ledger")
    default_currency: str = "INR"
    pending_transactions: dict[str, PendingTransaction] = {}
    parser: LedgerParser | None = None
    validator: LedgerValidator | None = None
    memory: PayeeMemory | None = None
    current_thread_id: str | None = None


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
        logger.exception("Error loading pending transactions from disk.")


def configure_tool_state(
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


def get_pending_transactions(thread_id: str | None = None) -> dict[str, PendingTransaction]:
    """Get pending transactions, optionally filtered by thread_id."""
    if thread_id is None:
        return _state.pending_transactions
    return {k: v for k, v in _state.pending_transactions.items() if v.thread_id == thread_id}


def clear_pending_transaction(txn_id: str) -> PendingTransaction | None:
    """Remove and return a pending transaction."""
    result = _state.pending_transactions.pop(txn_id, None)
    if result is not None:
        _save_pending()
    return result


def set_current_thread_id(thread_id: str | None) -> None:
    """Set the current thread context for pending transactions."""
    _state.current_thread_id = thread_id


def get_current_thread_id() -> str | None:
    """Get the current thread context."""
    return _state.current_thread_id


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
            logger.debug(f"Could not parse 'days ago' from: {date_str}")
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
        logger.debug(f"Could not parse ISO date from: {date_str}")
        pass

    # Try other common formats
    for fmt in ("%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue

    # Default to today if all else fails
    logger.warning(f"Could not parse date string '{date_str}', defaulting to today.")
    return today


TOOL_HANDLERS: dict[str, Any] = {}


def register_tool(name: str):
    def decorator(func):
        TOOL_HANDLERS[name] = func
        return func

    return decorator


@register_tool("parse_expense")
def _parse_expense(args: ParseExpenseArgs) -> str:
    """Parse expense and create pending transaction."""
    try:
        txn_date = _parse_date_string(args.transaction_date)
        used_currency = args.currency or _state.default_currency

        expense_account = args.expense_account
        if not expense_account or expense_account == "Expenses:Unknown":
            if _state.memory:
                suggested = _state.memory.suggest_account(args.payee)
                if suggested:
                    expense_account = suggested

            if not expense_account:
                expense_account = suggest_category(args.payee, float(args.amount))

            if not expense_account:
                expense_account = "Expenses:Other"

        recurring_name = None
        recurring_period = None
        if args.is_recurring or args.recurring_name:
            recurring_name = args.recurring_name or args.payee
            recurring_period = args.recurring_period

        txn = Transaction.create_expense(
            date=txn_date,
            payee=args.payee,
            amount=args.amount,
            expense_account=expense_account,
            payment_account=args.payment_account,
            currency=used_currency,
            note=args.note,
            recurring_name=recurring_name,
            recurring_period=recurring_period,
        )

        pending = PendingTransaction(
            id=txn.gullak_id,
            transaction=txn,
            source_text=f"{args.payee} - {args.amount} {used_currency}",
            thread_id=_state.current_thread_id,
        )

        _state.pending_transactions[pending.id] = pending
        _save_pending()
        logger.info(f"Created pending expense transaction: {pending.id}")

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
        logger.exception(f"Error parsing expense with args: {args.model_dump_json()}")
        return json.dumps({"error": f"Error parsing expense: {e}"})


@register_tool("parse_income")
def _parse_income(args: ParseIncomeArgs) -> str:
    """Parse income and create pending transaction."""
    try:
        txn_date = _parse_date_string(args.transaction_date)
        used_currency = args.currency or _state.default_currency

        txn = Transaction.create_income(
            date=txn_date,
            payee=args.payee,
            amount=args.amount,
            income_account=args.income_account,
            deposit_account=args.deposit_account,
            currency=used_currency,
            note=args.note,
        )

        pending = PendingTransaction(
            id=txn.gullak_id,
            transaction=txn,
            source_text=f"Income: {args.payee} - {args.amount} {used_currency}",
            thread_id=_state.current_thread_id,
        )

        _state.pending_transactions[pending.id] = pending
        _save_pending()
        logger.info(f"Created pending income transaction: {pending.id}")

        return json.dumps(
            {
                "status": "pending",
                "id": pending.id,
                "preview": pending.ledger_preview,
                "transaction": {
                    "date": str(txn.date),
                    "payee": txn.payee,
                    "amount": float(args.amount),
                    "currency": used_currency,
                    "income_account": args.income_account,
                    "deposit_account": args.deposit_account,
                },
                "message": "Income transaction preview created. Ask user to confirm.",
            }
        )

    except Exception as e:
        logger.exception(f"Error parsing income with args: {args.model_dump_json()}")
        return json.dumps({"error": f"Error parsing income: {e}"})


@register_tool("query_balance")
def _query_balance(args: QueryBalanceArgs) -> str:
    """Query balance from ledger."""
    if _state.validator is None:
        logger.error("Validator not configured for query_balance.")
        return json.dumps({"error": "Validator not configured"})

    account = args.account
    period = args.period

    async def _query():
        return await _state.validator.get_balance(
            _state.ledger_path,
            account=account,
            period=period,
        )

    try:
        asyncio.get_running_loop()
        with concurrent.futures.ThreadPoolExecutor() as pool:
            future = pool.submit(asyncio.run, _query())
            success, result = future.result()
    except RuntimeError:
        success, result = asyncio.run(_query())
    except Exception as e:
        logger.exception(
            f"Error running async query for balance with args: {args.model_dump_json()}"
        )
        return json.dumps({"error": f"Query execution error: {e}"})

    if success:
        if result.strip():
            logger.info(f"Balance query successful for account '{account}' period '{period}'.")
            return json.dumps({"balance": result.strip()})
        else:
            msg = f"No transactions found for {account or 'all accounts'}"
            if period:
                msg += f" in {period}"
            logger.info(
                f"Balance query returned no results for account '{account}' period '{period}'."
            )
            return json.dumps({"message": msg})
    else:
        logger.error(f"Balance query failed for account '{account}' period '{period}': {result}")
        return json.dumps({"error": f"Query error: {result}"})


@register_tool("list_accounts")
def _list_accounts(args: ListAccountsArgs) -> str:
    """List accounts from ledger."""
    if _state.parser is None:
        logger.error("Parser not configured for list_accounts.")
        return json.dumps({"error": "Parser not configured"})

    account_type = args.account_type

    try:
        if not _state.ledger_path.exists():
            logger.info("No ledger file found when listing accounts.")
            return json.dumps(
                {"accounts": [], "message": "No ledger file found. Start adding transactions!"}
            )

        accounts = _state.parser.extract_accounts(_state.ledger_path)

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
            logger.info(f"No {account_type} accounts found.")
            return json.dumps({"accounts": [], "message": f"No {account_type} accounts found yet."})

        logger.info(f"Listed {len(sorted_accounts)} {account_type} accounts.")
        return json.dumps({"accounts": sorted_accounts})

    except Exception as e:
        logger.exception(f"Error listing accounts with args: {args.model_dump_json()}")
        return json.dumps({"error": f"Error listing accounts: {e}"})


@register_tool("edit_transaction")
def _edit_transaction(args: EditTransactionArgs) -> str:
    """Edit an existing transaction."""
    txn_id = args.transaction_id
    if not txn_id:
        logger.warning("Attempted to edit transaction without ID.")
        return json.dumps({"error": "transaction_id is required"})

    updates = {}
    if args.payee is not None:
        updates["payee"] = args.payee
    if args.amount is not None:
        updates["amount"] = args.amount
    if args.expense_account is not None:
        updates["expense_account"] = args.expense_account
    if args.payment_account is not None:
        updates["payment_account"] = args.payment_account
    if args.currency is not None:
        updates["currency"] = args.currency
    if args.date is not None:
        updates["date"] = _parse_date_string(args.date)
    if args.note is not None:
        updates["note"] = args.note

    if not updates:
        logger.warning(f"No updates provided for transaction ID: {txn_id}")
        return json.dumps({"error": "No updates provided"})

    async def _do_update():
        writer = LedgerWriter(_state.ledger_path, _state.validator)
        return await writer.update_transaction(txn_id, updates)

    try:
        try:
            asyncio.get_running_loop()
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, _do_update())
                updated_txn = future.result()
        except RuntimeError:
            updated_txn = asyncio.run(_do_update())

        if updated_txn is None:
            logger.warning(f"Transaction {txn_id} not found for editing.")
            return json.dumps({"error": f"Transaction {txn_id} not found"})

        logger.info(f"Transaction {txn_id} updated successfully.")
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
        logger.warning(f"Validation error updating transaction {txn_id}: {e}")
        return json.dumps({"error": str(e)})
    except Exception as e:
        logger.exception(f"Error updating transaction {txn_id} with args: {args.model_dump_json()}")
        return json.dumps({"error": f"Error updating transaction: {e}"})


@register_tool("delete_transaction")
def _delete_transaction(args: DeleteTransactionArgs) -> str:
    """Delete a transaction."""
    txn_id = args.transaction_id
    if not txn_id:
        logger.warning("Attempted to delete transaction without ID.")
        return json.dumps({"error": "transaction_id is required"})

    if _state.parser is None:
        logger.error("Parser not configured for delete_transaction.")
        return json.dumps({"error": "Parser not configured"})

    transactions = _state.parser.parse_file(_state.ledger_path)
    target = None
    for txn in transactions:
        if txn.gullak_id == txn_id:
            target = txn
            break

    if target is None:
        logger.warning(f"Transaction {txn_id} not found for deletion.")
        return json.dumps({"error": f"Transaction {txn_id} not found"})

    async def _do_delete():
        writer = LedgerWriter(_state.ledger_path, _state.validator)
        return await writer.delete_transaction(txn_id)

    try:
        try:
            asyncio.get_running_loop()
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, _do_delete())
                deleted = future.result()
        except RuntimeError:
            deleted = asyncio.run(_do_delete())

        if not deleted:
            logger.error(f"Failed to delete transaction {txn_id}.")
            return json.dumps({"error": f"Failed to delete transaction {txn_id}"})

        logger.info(f"Transaction {txn_id} ('{target.payee}') deleted successfully.")
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
        logger.exception(f"Error deleting transaction {txn_id} with args: {args.model_dump_json()}")
        return json.dumps({"error": f"Error deleting transaction: {e}"})


@register_tool("get_recent_transactions")
def _get_recent_transactions(args: GetRecentTransactionsArgs) -> str:
    """Get recent transactions."""
    if _state.parser is None:
        logger.error("Parser not configured for get_recent_transactions.")
        return json.dumps({"error": "Parser not configured"})

    limit = min(args.limit, 20)
    account_filter = args.account or ""

    try:
        if not _state.ledger_path.exists():
            logger.info("No ledger file found when getting recent transactions.")
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
        logger.info(f"Retrieved {len(result)} recent transactions.")
        return json.dumps(
            {
                "transactions": result,
                "count": len(result),
            }
        )
    except Exception as e:
        logger.exception(f"Error getting recent transactions with args: {args.model_dump_json()}")
        return json.dumps({"error": f"Error getting transactions: {e}"})


@register_tool("learn_payee_mapping")
def _learn_payee_mapping(args: LearnPayeeMappingArgs) -> str:
    """Learn a payee->account mapping."""
    if _state.memory is None:
        logger.error("Memory not configured for learn_payee_mapping.")
        return json.dumps({"error": "Memory not configured"})

    payee = args.payee.strip()
    account = args.account.strip()

    if not payee or not account:
        logger.warning(
            f"Attempted to learn payee mapping with empty payee or account: {payee} -> {account}"
        )
        return json.dumps({"error": "Both payee and account are required"})

    _state.memory.add_mapping(payee, account)
    logger.info(f"Learned payee mapping: {payee} -> {account}")

    return json.dumps(
        {
            "status": "learned",
            "payee": payee,
            "account": account,
            "message": f"Will remember: {payee} -> {account}",
        }
    )


@register_tool("import_csv")
def _import_csv(args: ImportCsvArgs) -> str:
    """Import transactions from CSV."""
    file_path = Path(args.file_path)
    payment_account = args.payment_account
    default_account = args.default_expense_account

    if not file_path.exists():
        logger.warning(f"File not found for CSV import: {file_path}")
        return json.dumps({"error": f"File not found: {file_path}"})

    # Security: Restrict file_path to a designated upload directory
    # For now, this is a placeholder. A real implementation would check against a base path.
    # if not file_path.is_relative_to(Path("./uploads")): # Example check
    #     logger.error(f"Attempted to import CSV from unauthorized path: {file_path}")
    #     return json.dumps({"error": "Unauthorized file path for CSV import."})

    existing_hashes: set[str] = set()
    if _state.parser and _state.ledger_path.exists():
        existing_txns = _state.parser.parse_file(_state.ledger_path)
        existing_hashes = CSVProcessor.get_existing_hashes(existing_txns)

    processor = CSVProcessor(existing_hashes)
    result = processor.process_file(
        file_path,
        default_account=default_account,
        payment_account=payment_account,
    )

    if result.errors:
        logger.error(f"CSV import errors: {'; '.join(result.errors)}")
        return json.dumps({"error": "; ".join(result.errors)})

    pending_ids = []
    for imp_txn in result.transactions:
        suggested_account = default_account
        if _state.memory:
            suggested = _state.memory.suggest_account(imp_txn.payee)
            if suggested:
                suggested_account = suggested

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
            thread_id=_state.current_thread_id,
        )

        _state.pending_transactions[pending.id] = pending
        pending_ids.append(pending.id)

    _save_pending()
    new_count = len(result.transactions)
    dup_count = len(result.duplicates)
    logger.info(f"CSV import: {new_count} new, {dup_count} duplicates skipped.")

    return json.dumps(
        {
            "status": "imported",
            "total_rows": result.total_rows,
            "imported": len(result.transactions),
            "duplicates": len(result.duplicates),
            "skipped": result.skipped_rows,
            "template": result.template_used,
            "pending_ids": pending_ids,
            "message": f"Imported {new_count} transactions. {dup_count} duplicates skipped.",
        }
    )


@register_tool("set_budget")
def _set_budget(args: SetBudgetArgs) -> str:
    """Set monthly budget using Paisa's periodic transaction format."""
    budgets = args.budgets
    if not budgets:
        logger.warning("Attempted to set budget with no entries.")
        return json.dumps({"error": "No budget entries provided"})

    funding_account = args.funding_account

    entries = []
    for b in budgets:
        entries.append(
            BudgetEntry(
                account=b.account,
                amount=b.amount,
            )
        )

    budget = PeriodicBudget(
        entries=entries,
        funding_account=funding_account,
    )

    ledger_text = budget.to_ledger()

    try:
        if _state.ledger_path.exists():
            content = _state.ledger_path.read_text()
            if "~ Monthly" in content:
                lines = content.split("\n")
                new_lines = []
                skip_until_blank = False
                for line in lines:
                    if line.startswith("~ Monthly"):
                        skip_until_blank = True
                        continue
                    if skip_until_blank:
                        if not line.strip():
                            skip_until_blank = False
                        continue
                    new_lines.append(line)
                content = "\n".join(new_lines)
            new_content = ledger_text + "\n\n" + content.lstrip()
        else:
            _state.ledger_path.parent.mkdir(parents=True, exist_ok=True)
            new_content = ledger_text + "\n"

        _state.ledger_path.write_text(new_content)
        logger.info(f"Budget set for {len(entries)} categories.")

        return json.dumps(
            {
                "status": "saved",
                "preview": ledger_text,
                "entries": len(entries),
                "message": f"Budget set for {len(entries)} categories.",
            }
        )
    except Exception as e:
        logger.exception(f"Failed to save budget with args: {args.model_dump_json()}")
        return json.dumps({"error": f"Failed to save budget: {e}"})


@register_tool("add_credit_card")
def _add_credit_card(args: AddCreditCardArgs) -> str:
    """Add a credit card to Paisa config."""
    name = args.name.strip()
    if not name:
        logger.warning("Attempted to add credit card with empty name.")
        return json.dumps({"error": "Card name is required"})

    credit_limit = args.credit_limit
    if credit_limit <= 0:
        logger.warning(
            f"Attempted to add credit card with non-positive credit limit: {credit_limit}"
        )
        return json.dumps({"error": "Credit limit must be positive"})

    account = f"Liabilities:CreditCard:{name.replace(' ', '')}"

    config_path = _state.ledger_path.parent / "paisa.yaml"
    manager = PaisaConfigManager(config_path)

    card = manager.add_credit_card(
        account=account,
        credit_limit=credit_limit,
        statement_end_day=args.statement_end_day,
        due_day=args.due_day,
        network=args.network,
    )
    logger.info(f"Credit card '{name}' added with account '{account}'.")

    return json.dumps(
        {
            "status": "added",
            "card": {
                "name": name,
                "account": account,
                "credit_limit": credit_limit,
                "statement_end_day": card.statement_end_day,
                "due_day": card.due_day,
                "network": card.network,
            },
            "message": f"Credit card '{name}' added. Use account '{account}'.",
        }
    )


@register_tool("set_allocation_targets")
def _set_allocation_targets(args: SetAllocationTargetsArgs) -> str:
    """Set asset allocation targets in Paisa config."""
    targets_data = args.targets
    if not targets_data:
        logger.warning("Attempted to set allocation targets with no entries.")
        return json.dumps({"error": "No allocation targets provided"})

    total = sum(t.target for t in targets_data)
    if total != 100:
        logger.warning(f"Allocation targets must sum to 100, got {total}.")
        return json.dumps({"error": f"Allocation targets must sum to 100, got {total}"})

    config_path = _state.ledger_path.parent / "paisa.yaml"
    manager = PaisaConfigManager(config_path)

    targets = []
    for t in targets_data:
        name = t.name
        target_pct = t.target
        accounts = t.accounts if t.accounts is not None else [f"Assets:{name}:*"]

        targets.append(AllocationTarget(name=name, target=target_pct, accounts=accounts))

    manager.set_allocation_targets(targets)
    logger.info(f"Allocation targets set for {len(targets)} categories.")

    return json.dumps(
        {
            "status": "saved",
            "targets": [
                {"name": t.name, "target": t.target, "accounts": t.accounts} for t in targets
            ],
            "message": f"Allocation set: {', '.join(f'{t.name} {t.target}%' for t in targets)}.",
        }
    )
