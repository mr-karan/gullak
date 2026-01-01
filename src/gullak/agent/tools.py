"""Gullak tools using LiteLLM with OpenAI-compatible tool calling.

All 12 tools with Pydantic models for inputs and simple executor functions.
"""

import asyncio
import concurrent.futures
import json
import logging
from collections.abc import Callable
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, Field

from gullak.agent.tool_state import ToolState
from gullak.config.paisa import AllocationTarget, PaisaConfigManager
from gullak.import_.processor import CSVProcessor
from gullak.ledger.categories import suggest_category
from gullak.ledger.models import BudgetEntry, PendingTransaction, PeriodicBudget, Transaction
from gullak.ledger.writer import LedgerWriter
from gullak.settings import settings

logger = logging.getLogger(__name__)


# =============================================================================
# TOOL RESULT TYPE
# =============================================================================


@dataclass
class ToolResult:
    """Result from a tool execution."""

    success: bool
    data: dict[str, Any]
    message: str = ""
    error: str | None = None
    is_pending: bool = False  # For pending transaction previews

    def to_json(self) -> str:
        """Serialize for LLM consumption."""
        return json.dumps(
            {
                "success": self.success,
                "message": self.message,
                "error": self.error,
                "data": self.data,
            },
            default=str,
        )


# =============================================================================
# INPUT MODELS (Pydantic - used to generate OpenAI tool schemas)
# =============================================================================


class ParseExpenseInput(BaseModel):
    """Parse natural language expense into a transaction preview."""

    payee: str = Field(description="Merchant or payee name (e.g., 'BigBasket', 'Swiggy')")
    amount: Decimal = Field(gt=0, description="Positive amount of the expense")
    expense_account: str = Field(description="Expense account path like 'Expenses:Food:Groceries'")
    payment_account: str = Field(
        default="Assets:Cash",
        description="Payment source like 'Assets:Cash', 'Assets:Bank:HDFC'",
    )
    currency: str = Field(default="INR", description="Currency code")
    transaction_date: str = Field(
        default="today", description="Date or relative date like 'yesterday', 'last Monday'"
    )
    note: str | None = Field(default=None, description="Optional note for the transaction")
    is_recurring: bool = Field(default=False, description="Is this a recurring expense?")
    recurring_name: str | None = Field(default=None, description="Name for recurring expense")
    recurring_period: str | None = Field(
        default=None, description="Period: 'monthly', 'weekly', etc."
    )


class ParseIncomeInput(BaseModel):
    """Parse income/earnings into a transaction preview."""

    payee: str = Field(description="Source of income (e.g., 'Employer', 'HDFC Bank Interest')")
    amount: Decimal = Field(gt=0, description="Amount received")
    income_account: str = Field(description="Income account like 'Income:Salary'")
    deposit_account: str = Field(description="Account where money was deposited")
    currency: str = Field(default="INR", description="Currency code")
    transaction_date: str = Field(default="today", description="Date or relative date")
    note: str | None = Field(default=None, description="Optional note")


class QueryBalanceInput(BaseModel):
    """Query account balances from the ledger."""

    account: str = Field(default="", description="Account pattern to query (empty for all)")
    period: str = Field(default="", description="Time period (e.g., 'this month', 'last 30 days')")


class ListAccountsInput(BaseModel):
    """List available accounts in the ledger."""

    account_type: Literal["all", "expenses", "assets", "liabilities", "income"] = Field(
        default="all", description="Filter by account type"
    )


class EditTransactionInput(BaseModel):
    """Edit an existing transaction."""

    transaction_id: str = Field(description="Transaction ID (8-char hex from gullak_id)")
    payee: str | None = Field(default=None, description="New payee name")
    amount: Decimal | None = Field(default=None, gt=0, description="New amount")
    expense_account: str | None = Field(default=None, description="New expense account")
    payment_account: str | None = Field(default=None, description="New payment account")
    currency: str | None = Field(default=None, description="New currency")
    date: str | None = Field(default=None, description="New date")
    note: str | None = Field(default=None, description="New note")


class DeleteTransactionInput(BaseModel):
    """Delete a transaction."""

    transaction_id: str = Field(description="Transaction ID (8-char hex)")


class GetRecentTransactionsInput(BaseModel):
    """Get recent transactions."""

    limit: int = Field(default=5, ge=1, le=20, description="Number of transactions to return")
    account: str | None = Field(default=None, description="Filter by account pattern")


class LearnPayeeMappingInput(BaseModel):
    """Remember that a payee should always use a specific account."""

    payee: str = Field(description="Payee/merchant name")
    account: str = Field(description="Expense account to associate")


class ImportCsvInput(BaseModel):
    """Import transactions from a CSV file."""

    file_path: str = Field(description="Path to CSV file")
    payment_account: str = Field(description="Bank/card account for transactions")
    default_expense_account: str = Field(
        default="Expenses:Unknown", description="Default expense account"
    )


class SetBudgetInput(BaseModel):
    """Set monthly budget targets."""

    budgets: list[dict[str, Any]] = Field(description="List of {account, amount} entries")
    funding_account: str = Field(default="Assets:Checking", description="Account to fund from")


class AddCreditCardInput(BaseModel):
    """Add a credit card to track."""

    name: str = Field(description="Card name (e.g., 'HDFC', 'Amex')")
    credit_limit: int = Field(gt=0, description="Credit limit")
    statement_end_day: int = Field(default=1, ge=1, le=31, description="Statement closing day")
    due_day: int = Field(default=15, ge=1, le=31, description="Payment due day")
    network: Literal["visa", "mastercard", "amex", "rupay", "diners"] = Field(default="visa")


class SetAllocationTargetsInput(BaseModel):
    """Set asset allocation targets for portfolio rebalancing."""

    targets: list[dict[str, Any]] = Field(description="List of {name, target, accounts} entries")


# =============================================================================
# TOOL EXECUTORS
# =============================================================================


def execute_parse_expense(state: ToolState, input: ParseExpenseInput) -> ToolResult:
    """Create a pending expense transaction."""
    try:
        txn_date = state.parse_date(input.transaction_date)
        currency = input.currency or state.default_currency

        # Suggest account if needed
        expense_account = input.expense_account
        if not expense_account or expense_account == "Expenses:Unknown":
            expense_account = state.suggest_account(input.payee, input.amount)

        # Handle recurring
        recurring_name = None
        recurring_period = None
        if input.is_recurring or input.recurring_name:
            recurring_name = input.recurring_name or input.payee
            recurring_period = input.recurring_period

        txn = Transaction.create_expense(
            date=txn_date,
            payee=input.payee,
            amount=input.amount,
            expense_account=expense_account,
            payment_account=input.payment_account,
            currency=currency,
            note=input.note,
            recurring_name=recurring_name,
            recurring_period=recurring_period,
        )

        pending = PendingTransaction(
            id=txn.gullak_id,
            transaction=txn,
            source_text=f"{input.payee} - {input.amount} {currency}",
            thread_id=state.current_thread_id,
        )

        state.add_pending(pending)

        return ToolResult(
            success=True,
            is_pending=True,
            message=f"Created pending expense: {input.payee} for {input.amount} {currency}",
            data={
                "id": pending.id,
                "preview": pending.ledger_preview,
                "transaction": {
                    "date": str(txn.date),
                    "payee": txn.payee,
                    "amount": float(input.amount),
                    "currency": currency,
                    "expense_account": expense_account,
                    "payment_account": input.payment_account,
                },
            },
        )

    except Exception as e:
        logger.exception(f"Error parsing expense: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_parse_income(state: ToolState, input: ParseIncomeInput) -> ToolResult:
    """Create a pending income transaction."""
    try:
        txn_date = state.parse_date(input.transaction_date)
        currency = input.currency or state.default_currency

        txn = Transaction.create_income(
            date=txn_date,
            payee=input.payee,
            amount=input.amount,
            income_account=input.income_account,
            deposit_account=input.deposit_account,
            currency=currency,
            note=input.note,
        )

        pending = PendingTransaction(
            id=txn.gullak_id,
            transaction=txn,
            source_text=f"Income: {input.payee} - {input.amount} {currency}",
            thread_id=state.current_thread_id,
        )

        state.add_pending(pending)

        return ToolResult(
            success=True,
            is_pending=True,
            message=f"Created pending income: {input.payee} for {input.amount} {currency}",
            data={
                "id": pending.id,
                "preview": pending.ledger_preview,
                "transaction": {
                    "date": str(txn.date),
                    "payee": txn.payee,
                    "amount": float(input.amount),
                    "currency": currency,
                    "income_account": input.income_account,
                    "deposit_account": input.deposit_account,
                },
            },
        )

    except Exception as e:
        logger.exception(f"Error parsing income: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_query_balance(state: ToolState, input: QueryBalanceInput) -> ToolResult:
    """Query ledger balances."""
    if state.validator is None:
        return ToolResult(success=False, error="Validator not configured", data={})

    async def _query():
        return await state.validator.get_balance(
            state.ledger_path,
            account=input.account,
            period=input.period,
        )

    try:
        # Handle async execution
        try:
            asyncio.get_running_loop()
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, _query())
                success, result = future.result()
        except RuntimeError:
            success, result = asyncio.run(_query())

        if success and result.strip():
            return ToolResult(
                success=True,
                message="Balance query successful.",
                data={"balance": result.strip()},
            )
        elif success:
            msg = f"No transactions found for {input.account or 'all accounts'}"
            if input.period:
                msg += f" in {input.period}"
            return ToolResult(success=True, message=msg, data={})
        else:
            return ToolResult(success=False, error=result, data={})

    except Exception as e:
        logger.exception(f"Error querying balance: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_list_accounts(state: ToolState, input: ListAccountsInput) -> ToolResult:
    """List ledger accounts."""
    try:
        accounts = state.get_accounts(input.account_type)
        return ToolResult(
            success=True,
            message=f"Found {len(accounts)} {input.account_type} accounts.",
            data={"accounts": accounts, "count": len(accounts)},
        )
    except Exception as e:
        logger.exception(f"Error listing accounts: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_edit_transaction(state: ToolState, input: EditTransactionInput) -> ToolResult:
    """Edit an existing transaction."""
    if not input.transaction_id:
        return ToolResult(success=False, error="transaction_id is required", data={})

    updates = {}
    if input.payee is not None:
        updates["payee"] = input.payee
    if input.amount is not None:
        updates["amount"] = input.amount
    if input.expense_account is not None:
        updates["expense_account"] = input.expense_account
    if input.payment_account is not None:
        updates["payment_account"] = input.payment_account
    if input.currency is not None:
        updates["currency"] = input.currency
    if input.date is not None:
        updates["date"] = state.parse_date(input.date)
    if input.note is not None:
        updates["note"] = input.note

    if not updates:
        return ToolResult(success=False, error="No updates provided", data={})

    async def _do_update():
        writer = LedgerWriter(state.ledger_path, state.validator, settings.paisa_url)
        return await writer.update_transaction(input.transaction_id, updates)

    try:
        try:
            asyncio.get_running_loop()
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, _do_update())
                updated_txn = future.result()
        except RuntimeError:
            updated_txn = asyncio.run(_do_update())

        if updated_txn is None:
            return ToolResult(
                success=False,
                error=f"Transaction {input.transaction_id} not found",
                data={},
            )

        return ToolResult(
            success=True,
            message="Transaction updated successfully.",
            data={
                "id": updated_txn.gullak_id,
                "date": str(updated_txn.date),
                "payee": updated_txn.payee,
                "amount": float(updated_txn.total_amount),
                "preview": updated_txn.to_ledger(),
            },
        )

    except Exception as e:
        logger.exception(f"Error editing transaction: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_delete_transaction(state: ToolState, input: DeleteTransactionInput) -> ToolResult:
    """Delete a transaction."""
    if not input.transaction_id:
        return ToolResult(success=False, error="transaction_id is required", data={})

    # Find the transaction first
    transactions = state.parser.parse_file(state.ledger_path)
    target = None
    for txn in transactions:
        if txn.gullak_id == input.transaction_id:
            target = txn
            break

    if target is None:
        return ToolResult(
            success=False,
            error=f"Transaction {input.transaction_id} not found",
            data={},
        )

    async def _do_delete():
        writer = LedgerWriter(state.ledger_path, state.validator, settings.paisa_url)
        return await writer.delete_transaction(input.transaction_id)

    try:
        try:
            asyncio.get_running_loop()
            with concurrent.futures.ThreadPoolExecutor() as pool:
                future = pool.submit(asyncio.run, _do_delete())
                deleted = future.result()
        except RuntimeError:
            deleted = asyncio.run(_do_delete())

        if not deleted:
            return ToolResult(
                success=False,
                error=f"Failed to delete transaction {input.transaction_id}",
                data={},
            )

        return ToolResult(
            success=True,
            message=f"Transaction '{target.payee}' deleted successfully.",
            data={
                "id": target.gullak_id,
                "date": str(target.date),
                "payee": target.payee,
                "amount": float(target.total_amount),
            },
        )

    except Exception as e:
        logger.exception(f"Error deleting transaction: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_get_recent_transactions(
    state: ToolState, input: GetRecentTransactionsInput
) -> ToolResult:
    """Get recent transactions."""
    try:
        if not state.ledger_path.exists():
            return ToolResult(
                success=True, message="No transactions yet.", data={"transactions": []}
            )

        transactions = state.parser.parse_file(state.ledger_path)

        if input.account:
            transactions = [
                t
                for t in transactions
                if any(input.account.lower() in p.account.lower() for p in t.postings)
            ]

        transactions = sorted(transactions, key=lambda t: t.date, reverse=True)[: input.limit]

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

        return ToolResult(
            success=True,
            message=f"Found {len(result)} recent transactions.",
            data={"transactions": result, "count": len(result)},
        )

    except Exception as e:
        logger.exception(f"Error getting recent transactions: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_learn_payee_mapping(state: ToolState, input: LearnPayeeMappingInput) -> ToolResult:
    """Learn a payee->account mapping."""
    payee = input.payee.strip()
    account = input.account.strip()

    if not payee or not account:
        return ToolResult(success=False, error="Both payee and account are required", data={})

    if state.memory is None:
        return ToolResult(success=False, error="Memory not configured", data={})

    state.memory.add_mapping(payee, account)
    logger.info(f"Learned payee mapping: {payee} -> {account}")

    return ToolResult(
        success=True,
        message=f"Will remember: {payee} -> {account}",
        data={"payee": payee, "account": account},
    )


def execute_import_csv(state: ToolState, input: ImportCsvInput) -> ToolResult:
    """Import transactions from CSV."""
    file_path = Path(input.file_path)

    if not file_path.exists():
        return ToolResult(success=False, error=f"File not found: {file_path}", data={})

    try:
        existing_hashes: set[str] = set()
        if state.ledger_path.exists():
            existing_txns = state.parser.parse_file(state.ledger_path)
            existing_hashes = CSVProcessor.get_existing_hashes(existing_txns)

        processor = CSVProcessor(existing_hashes)
        result = processor.process_file(
            file_path,
            default_account=input.default_expense_account,
            payment_account=input.payment_account,
        )

        if result.errors:
            return ToolResult(success=False, error="; ".join(result.errors), data={})

        pending_ids = []
        for imp_txn in result.transactions:
            # Suggest account
            suggested_account = input.default_expense_account
            if state.memory:
                suggested = state.memory.suggest_account(imp_txn.payee)
                if suggested:
                    suggested_account = suggested

            if suggested_account == input.default_expense_account:
                pattern_suggestion = suggest_category(
                    imp_txn.payee,
                    float(imp_txn.amount),
                    imp_txn.is_credit,
                )
                if pattern_suggestion:
                    suggested_account = pattern_suggestion

            txn = imp_txn.to_transaction(
                expense_account=suggested_account,
                payment_account=input.payment_account,
            )

            pending = PendingTransaction(
                id=txn.gullak_id,
                transaction=txn,
                source_text=f"CSV import row {imp_txn.source_row}: {imp_txn.payee}",
                thread_id=state.current_thread_id,
            )

            state.add_pending(pending)
            pending_ids.append(pending.id)

        return ToolResult(
            success=True,
            message=f"Imported {len(result.transactions)} transactions. {len(result.duplicates)} duplicates skipped.",
            data={
                "total_rows": result.total_rows,
                "imported": len(result.transactions),
                "duplicates": len(result.duplicates),
                "skipped": result.skipped_rows,
                "template": result.template_used,
                "pending_ids": pending_ids,
            },
        )

    except Exception as e:
        logger.exception(f"Error importing CSV: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_set_budget(state: ToolState, input: SetBudgetInput) -> ToolResult:
    """Set monthly budgets."""
    if not input.budgets:
        return ToolResult(success=False, error="No budget entries provided", data={})

    entries = []
    for b in input.budgets:
        entries.append(BudgetEntry(account=b["account"], amount=Decimal(str(b["amount"]))))

    budget = PeriodicBudget(entries=entries, funding_account=input.funding_account)
    ledger_text = budget.to_ledger()

    try:
        if state.ledger_path.exists():
            content = state.ledger_path.read_text()
            if "~ Monthly" in content:
                # Remove existing budget
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
            state.ledger_path.parent.mkdir(parents=True, exist_ok=True)
            new_content = ledger_text + "\n"

        state.ledger_path.write_text(new_content)

        return ToolResult(
            success=True,
            message=f"Budget set for {len(entries)} categories.",
            data={"preview": ledger_text, "entries": len(entries)},
        )

    except Exception as e:
        logger.exception(f"Error setting budget: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_add_credit_card(state: ToolState, input: AddCreditCardInput) -> ToolResult:
    """Add a credit card."""
    name = input.name.strip()
    if not name:
        return ToolResult(success=False, error="Card name is required", data={})

    if input.credit_limit <= 0:
        return ToolResult(success=False, error="Credit limit must be positive", data={})

    account = f"Liabilities:CreditCard:{name.replace(' ', '')}"

    try:
        config_path = state.ledger_path.parent / "paisa.yaml"
        manager = PaisaConfigManager(config_path)

        card = manager.add_credit_card(
            account=account,
            credit_limit=input.credit_limit,
            statement_end_day=input.statement_end_day,
            due_day=input.due_day,
            network=input.network,
        )

        return ToolResult(
            success=True,
            message=f"Credit card '{name}' added. Use account '{account}'.",
            data={
                "name": name,
                "account": account,
                "credit_limit": input.credit_limit,
                "statement_end_day": card.statement_end_day,
                "due_day": card.due_day,
                "network": card.network,
            },
        )

    except Exception as e:
        logger.exception(f"Error adding credit card: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_set_allocation_targets(
    state: ToolState, input: SetAllocationTargetsInput
) -> ToolResult:
    """Set asset allocation targets."""
    if not input.targets:
        return ToolResult(success=False, error="No allocation targets provided", data={})

    total = sum(t["target"] for t in input.targets)
    if total != 100:
        return ToolResult(
            success=False, error=f"Allocation targets must sum to 100, got {total}", data={}
        )

    try:
        config_path = state.ledger_path.parent / "paisa.yaml"
        manager = PaisaConfigManager(config_path)

        targets = []
        for t in input.targets:
            name = t["name"]
            target_pct = t["target"]
            accounts = t.get("accounts") or [f"Assets:{name}:*"]
            targets.append(AllocationTarget(name=name, target=target_pct, accounts=accounts))

        manager.set_allocation_targets(targets)

        return ToolResult(
            success=True,
            message=f"Allocation set: {', '.join(f'{t.name} {t.target}%' for t in targets)}.",
            data={
                "targets": [
                    {"name": t.name, "target": t.target, "accounts": t.accounts} for t in targets
                ]
            },
        )

    except Exception as e:
        logger.exception(f"Error setting allocation targets: {e}")
        return ToolResult(success=False, error=str(e), data={})


# =============================================================================
# TOOL REGISTRY
# =============================================================================


@dataclass
class ToolDefinition:
    """Definition of a tool for the agent."""

    name: str
    description: str
    input_model: type[BaseModel]
    executor: Callable[[ToolState, Any], ToolResult]


# All available tools
TOOLS: dict[str, ToolDefinition] = {
    "parse_expense": ToolDefinition(
        name="parse_expense",
        description="""Parse natural language expense and create a transaction preview.
Use when user mentions spending: "chai 50 rupees", "ordered from Swiggy 350",
"paid rent 15000", "petrol 2000 from ICICI card".""",
        input_model=ParseExpenseInput,
        executor=execute_parse_expense,
    ),
    "parse_income": ToolDefinition(
        name="parse_income",
        description="""Parse income/earnings and create a transaction preview.
Use when user mentions receiving: "salary credited 75000", "FD interest 5000",
"got refund from Amazon", "dividend from stocks".""",
        input_model=ParseIncomeInput,
        executor=execute_parse_income,
    ),
    "query_balance": ToolDefinition(
        name="query_balance",
        description="""Query account balances from the ledger.
Use when user asks about spending or balances: "How much on food?", "What's my balance?".""",
        input_model=QueryBalanceInput,
        executor=execute_query_balance,
    ),
    "list_accounts": ToolDefinition(
        name="list_accounts",
        description="""List available accounts in the ledger.
Use to help categorize expenses or show account structure.""",
        input_model=ListAccountsInput,
        executor=execute_list_accounts,
    ),
    "edit_transaction": ToolDefinition(
        name="edit_transaction",
        description="""Edit an existing transaction.
Use when user says "change that", "fix the amount", "actually it was 400".""",
        input_model=EditTransactionInput,
        executor=execute_edit_transaction,
    ),
    "delete_transaction": ToolDefinition(
        name="delete_transaction",
        description="""Delete a transaction.
Use when user says "delete that", "remove it", "that was a mistake".""",
        input_model=DeleteTransactionInput,
        executor=execute_delete_transaction,
    ),
    "get_recent_transactions": ToolDefinition(
        name="get_recent_transactions",
        description="""Get recent transactions from the ledger.
Use to find transaction IDs for editing/deleting or when user asks "what did I spend?".""",
        input_model=GetRecentTransactionsInput,
        executor=execute_get_recent_transactions,
    ),
    "learn_payee_mapping": ToolDefinition(
        name="learn_payee_mapping",
        description="""Remember that a payee should always use a specific account.
Use when user says "Swiggy should always be Food:Delivery".""",
        input_model=LearnPayeeMappingInput,
        executor=execute_learn_payee_mapping,
    ),
    "import_csv": ToolDefinition(
        name="import_csv",
        description="""Import transactions from a CSV file.
Use when user uploads a bank statement or CSV file.""",
        input_model=ImportCsvInput,
        executor=execute_import_csv,
    ),
    "set_budget": ToolDefinition(
        name="set_budget",
        description="""Set monthly budget targets.
Use when user wants spending limits: "budget 15k for rent, 10k for food".""",
        input_model=SetBudgetInput,
        executor=execute_set_budget,
    ),
    "add_credit_card": ToolDefinition(
        name="add_credit_card",
        description="""Add a credit card to track.
Use when user mentions adding a credit card: "add my HDFC card with 1.5L limit".""",
        input_model=AddCreditCardInput,
        executor=execute_add_credit_card,
    ),
    "set_allocation_targets": ToolDefinition(
        name="set_allocation_targets",
        description="""Set asset allocation targets for portfolio rebalancing.
Use when user mentions allocation: "I want 60% equity and 40% debt".""",
        input_model=SetAllocationTargetsInput,
        executor=execute_set_allocation_targets,
    ),
}


def get_openai_tools() -> list[dict[str, Any]]:
    """Generate OpenAI-compatible tool definitions from Pydantic models."""
    tools = []
    for name, tool_def in TOOLS.items():
        # Get JSON schema from Pydantic model
        schema = tool_def.input_model.model_json_schema()

        # Remove title from schema (OpenAI doesn't need it)
        schema.pop("title", None)

        tools.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": tool_def.description,
                    "parameters": schema,
                },
            }
        )
    return tools


def execute_tool(name: str, arguments: dict[str, Any], state: ToolState) -> ToolResult:
    """Execute a tool by name with given arguments."""
    tool_def = TOOLS.get(name)
    if not tool_def:
        return ToolResult(success=False, error=f"Unknown tool: {name}", data={})

    try:
        # Parse and validate input
        input_obj = tool_def.input_model.model_validate(arguments)
        # Execute
        return tool_def.executor(state, input_obj)
    except Exception as e:
        logger.exception(f"Error executing tool {name}: {e}")
        return ToolResult(success=False, error=str(e), data={})
