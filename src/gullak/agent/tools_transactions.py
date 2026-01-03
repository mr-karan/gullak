"""Transaction tools: parse, edit, confirm, delete."""

import logging
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field

from gullak.agent.tool_state import ToolState
from gullak.agent.tools_base import ToolDefinition, ToolResult
from gullak.ledger.models import PendingTransaction, Transaction
from gullak.ledger.writer import LedgerWriter
from gullak.settings import settings

logger = logging.getLogger(__name__)


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


class EditPendingTransactionInput(BaseModel):
    """Edit a pending (not yet saved) transaction."""

    transaction_id: str | None = Field(
        default=None,
        description="Transaction ID. If not provided, edits the most recent pending transaction.",
    )
    payee: str | None = Field(default=None, description="New payee name")
    amount: Decimal | None = Field(default=None, gt=0, description="New amount")
    expense_account: str | None = Field(default=None, description="New expense account")
    payment_account: str | None = Field(default=None, description="New payment account")
    currency: str | None = Field(default=None, description="New currency")
    date: str | None = Field(default=None, description="New date")
    note: str | None = Field(default=None, description="New note")


class EditTransactionInput(BaseModel):
    """Edit an existing (already saved) transaction in the ledger."""

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


class ConfirmTransactionInput(BaseModel):
    """Confirm and save a pending transaction to the ledger."""

    transaction_id: str | None = Field(
        default=None,
        description="Transaction ID to confirm. If not provided, confirms the most recent.",
    )


class ConfirmAllTransactionsInput(BaseModel):
    """Confirm and save all pending transactions to the ledger."""

    pass


def execute_parse_expense(state: ToolState, input: ParseExpenseInput) -> ToolResult:
    """Create a pending expense transaction."""
    try:
        txn_date = state.parse_date(input.transaction_date)
        currency = input.currency or state.default_currency

        expense_account = input.expense_account
        if not expense_account or expense_account == "Expenses:Unknown":
            expense_account = state.suggest_account(input.payee, input.amount)

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
            source=state.current_source,
            source_user=state.current_source_user,
        )

        pending = PendingTransaction(
            id=txn.gullak_id,
            transaction=txn,
            source_text=f"{input.payee} - {input.amount} {currency}",
            thread_id=state.current_thread_id,
        )

        state.add_pending(pending)

        is_default_cash = input.payment_account == "Assets:Cash"
        is_small_amount = input.amount < 100
        auto_confirmable = not is_default_cash or is_small_amount

        return ToolResult(
            success=True,
            is_pending=True,
            message=f"Created pending expense: {input.payee} for {input.amount} {currency}",
            data={
                "id": pending.id,
                "preview": pending.ledger_preview,
                "auto_confirmable": auto_confirmable,
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
            source=state.current_source,
            source_user=state.current_source_user,
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


def execute_edit_pending_transaction(
    state: ToolState, input: EditPendingTransactionInput
) -> ToolResult:
    if input.transaction_id:
        pending = state.get_pending().get(input.transaction_id)
        if not pending:
            return ToolResult(
                success=False,
                error=f"Pending transaction {input.transaction_id} not found",
                data={},
            )
    else:
        pending = state.get_last_pending()
        if not pending:
            return ToolResult(
                success=False,
                error="No pending transactions to edit. Create a transaction first.",
                data={},
            )

    updates: dict[str, Any] = {}
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
        updates["date"] = input.date
    if input.note is not None:
        updates["note"] = input.note

    if not updates:
        return ToolResult(success=False, error="No updates provided", data={})

    updated = state.update_pending(pending.id, updates)
    if updated is None:
        return ToolResult(
            success=False,
            error=f"Failed to update pending transaction {pending.id}",
            data={},
        )

    txn = updated.transaction
    return ToolResult(
        success=True,
        is_pending=True,
        message=f"Updated pending transaction: {txn.payee} for {txn.total_amount} {txn.postings[0].currency if txn.postings else state.default_currency}",
        data={
            "id": updated.id,
            "preview": updated.ledger_preview,
            "transaction": {
                "date": str(txn.date),
                "payee": txn.payee,
                "amount": float(txn.total_amount),
                "currency": txn.postings[0].currency if txn.postings else state.default_currency,
                "expense_account": txn.postings[0].account if txn.postings else "",
                "payment_account": txn.postings[1].account if len(txn.postings) > 1 else "",
            },
        },
    )


async def execute_edit_transaction(state: ToolState, input: EditTransactionInput) -> ToolResult:
    """Edit an existing (committed) transaction in the ledger."""
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

    try:
        writer = LedgerWriter(state.ledger_path, state.validator, settings.paisa_url)
        updated_txn = await writer.update_transaction(input.transaction_id, updates)

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


async def execute_delete_transaction(state: ToolState, input: DeleteTransactionInput) -> ToolResult:
    """Delete a transaction."""
    if not input.transaction_id:
        return ToolResult(success=False, error="transaction_id is required", data={})

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

    try:
        writer = LedgerWriter(state.ledger_path, state.validator, settings.paisa_url)
        deleted = await writer.delete_transaction(input.transaction_id)

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


async def execute_confirm_transaction(
    state: ToolState, input: ConfirmTransactionInput
) -> ToolResult:
    if input.transaction_id:
        pending = state.get_pending().get(input.transaction_id)
        if not pending:
            return ToolResult(
                success=False,
                error=f"Pending transaction {input.transaction_id} not found",
                data={},
            )
    else:
        pending = state.get_last_pending()
        if not pending:
            return ToolResult(
                success=False,
                error="No pending transactions to confirm",
                data={},
            )

    try:
        writer = LedgerWriter(state.ledger_path, state.validator, settings.paisa_url)
        await writer.append_transaction(pending.transaction)
        state.clear_pending(pending.id)

        if state.memory:
            txn = pending.transaction
            if txn.postings and txn.postings[0].account.startswith("Expenses:"):
                expense_account = txn.postings[0].account
                payment_account = txn.postings[1].account if len(txn.postings) > 1 else None
                state.memory.add_mapping(txn.payee, expense_account, payment_account)

        return ToolResult(
            success=True,
            message=f"Confirmed and saved: {pending.transaction.payee} for {pending.transaction.total_amount}",
            data={
                "id": pending.id,
                "payee": pending.transaction.payee,
                "amount": float(pending.transaction.total_amount),
            },
        )
    except Exception as e:
        logger.exception(f"Error confirming transaction: {e}")
        return ToolResult(success=False, error=str(e), data={})


async def execute_confirm_all_transactions(
    state: ToolState, input: ConfirmAllTransactionsInput
) -> ToolResult:
    pending_all = state.get_pending(thread_id=state.current_thread_id)
    if not pending_all:
        return ToolResult(success=False, error="No pending transactions to confirm", data={})

    try:
        writer = LedgerWriter(state.ledger_path, state.validator, settings.paisa_url)
        confirmed_list = []

        for pending in pending_all.values():
            await writer.append_transaction(pending.transaction)
            state.clear_pending(pending.id)
            if state.memory:
                txn = pending.transaction
                if txn.postings and txn.postings[0].account.startswith("Expenses:"):
                    expense_account = txn.postings[0].account
                    payment_account = txn.postings[1].account if len(txn.postings) > 1 else None
                    state.memory.add_mapping(txn.payee, expense_account, payment_account)
            confirmed_list.append(pending)

        return ToolResult(
            success=True,
            message=f"Confirmed {len(confirmed_list)} transactions",
            data={
                "count": len(confirmed_list),
                "transactions": [
                    {
                        "id": c.id,
                        "payee": c.transaction.payee,
                        "amount": float(c.transaction.total_amount),
                    }
                    for c in confirmed_list
                ],
            },
        )
    except Exception as e:
        logger.exception(f"Error confirming transactions: {e}")
        return ToolResult(success=False, error=str(e), data={})


# Tool definitions for this module
TRANSACTION_TOOLS: dict[str, ToolDefinition] = {
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
    "edit_pending_transaction": ToolDefinition(
        name="edit_pending_transaction",
        description="""Edit a pending (not yet saved) transaction.

IMPORTANT: Use this tool when user wants to modify a transaction they JUST created in this conversation.
Trigger phrases: "actually", "wait", "change that", "make it X instead", "update the amount", 
"it was paid by X card", "change category to Y".

This is MUCH faster than edit_transaction and doesn't require a transaction ID - it automatically 
finds the most recent pending transaction in the current thread.

DO NOT use parse_expense when user wants to modify an existing pending transaction - that creates 
a duplicate. Use edit_pending_transaction instead.""",
        input_model=EditPendingTransactionInput,
        executor=execute_edit_pending_transaction,
    ),
    "edit_transaction": ToolDefinition(
        name="edit_transaction",
        description="""Edit an existing (already saved) transaction in the ledger.

Use this ONLY for transactions that have already been confirmed and saved to the ledger file.
Requires transaction_id - use get_recent_transactions first if you don't have it.

For transactions just created in this conversation, use edit_pending_transaction instead.""",
        input_model=EditTransactionInput,
        executor=execute_edit_transaction,
        is_async=True,
    ),
    "delete_transaction": ToolDefinition(
        name="delete_transaction",
        description="""Delete a transaction.
Use when user says "delete that", "remove it", "that was a mistake".""",
        input_model=DeleteTransactionInput,
        executor=execute_delete_transaction,
        is_async=True,
    ),
    "confirm_transaction": ToolDefinition(
        name="confirm_transaction",
        description="""Confirm and save a pending transaction to the ledger.

Use when user says "confirm", "save it", "yes", "looks good", "ok" after reviewing a transaction.
If no transaction_id provided, confirms the most recent pending transaction.

This permanently saves the transaction to the ledger file.""",
        input_model=ConfirmTransactionInput,
        executor=execute_confirm_transaction,
        is_async=True,
    ),
    "confirm_all_transactions": ToolDefinition(
        name="confirm_all_transactions",
        description="""Confirm and save ALL pending transactions to the ledger.

Use when user says "confirm all", "save all", "yes to all" to bulk-confirm pending transactions.""",
        input_model=ConfirmAllTransactionsInput,
        executor=execute_confirm_all_transactions,
        is_async=True,
    ),
}
