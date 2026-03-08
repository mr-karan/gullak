"""Transaction tools: parse, edit, delete."""

import logging
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field

from gullak.agent.tool_state import ToolState
from gullak.agent.tools_base import ToolDefinition, ToolResult
from gullak.ledger.models import Transaction

logger = logging.getLogger(__name__)


class ParseExpenseInput(BaseModel):
    """Parse natural language expense into a transaction."""

    payee: str = Field(description="Merchant or payee name (e.g., 'BigBasket', 'Swiggy')")
    amount: Decimal | None = Field(
        default=None,
        description="Positive amount of the expense. "
        "Set to null/omit if the user did not mention an amount — do NOT guess.",
    )
    expense_account: str = Field(description="Expense account path like 'Expenses:Food:Groceries'")
    payment_account: str | None = Field(
        default=None,
        description="Payment source like 'Assets:Cash', 'Assets:Bank:HDFC'. "
        "Leave empty if not specified by the user.",
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
    """Parse income/earnings into a transaction."""

    payee: str = Field(description="Source of income (e.g., 'Employer', 'HDFC Bank Interest')")
    amount: Decimal = Field(gt=0, description="Amount received")
    income_account: str = Field(description="Income account like 'Income:Salary'")
    deposit_account: str = Field(description="Account where money was deposited")
    currency: str = Field(default="INR", description="Currency code")
    transaction_date: str = Field(default="today", description="Date or relative date")
    note: str | None = Field(default=None, description="Optional note")


class EditTransactionInput(BaseModel):
    """Edit an existing transaction in the ledger."""

    transaction_id: str = Field(description="Transaction ID (8-char hex from gullak_id)")
    payee: str | None = Field(default=None, description="New payee name")
    amount: Decimal | None = Field(default=None, gt=0, description="New amount")
    expense_account: str | None = Field(default=None, description="New expense account")
    payment_account: str | None = Field(default=None, description="New payment account")
    currency: str | None = Field(default=None, description="New currency")
    date: str | None = Field(default=None, description="New date")
    note: str | None = Field(default=None, description="New note")


class EditLastTransactionInput(BaseModel):
    """Edit the most recently saved transaction in this thread."""

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


def _build_transaction_updates(state: ToolState, input: Any) -> dict[str, Any]:
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
        updates["date"] = state.parse_date(input.date)
    if input.note is not None:
        updates["note"] = input.note
    return updates


async def execute_parse_expense(state: ToolState, input: ParseExpenseInput) -> ToolResult:
    """Create and save an expense transaction immediately."""
    if input.amount is None or input.amount <= 0:
        return ToolResult(
            success=True,
            message=f"Noted {input.payee}, but I need the amount. How much was it?",
            data={"needs_amount": True, "payee": input.payee},
        )

    try:
        txn_date = state.parse_date(input.transaction_date)
        currency = input.currency or state.default_currency

        suggested_expense, suggested_payment = state.suggest_accounts(
            input.payee, input.amount
        )

        expense_account = input.expense_account
        if not expense_account or expense_account == "Expenses:Unknown":
            expense_account = suggested_expense

        payment_account = input.payment_account
        if not payment_account:
            payment_account = suggested_payment or "Assets:Cash"

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
            payment_account=payment_account,
            currency=currency,
            note=input.note,
            recurring_name=recurring_name,
            recurring_period=recurring_period,
            source=state.get_source(),
            source_user=state.get_source_user(),
        )

        # Write immediately using shared writer
        if not state.writer:
            return ToolResult(success=False, error="Writer not initialized", data={})
        await state.writer.append_transaction(txn)

        # Track for edit_last_transaction
        thread_id = state.get_thread_id()
        source_user = state.get_source_user()
        state.set_last_confirmed(thread_id, txn.gullak_id, source_user)

        # Learn payee mapping
        if state.memory and txn.postings and txn.postings[0].account.startswith("Expenses:"):
            payment_acc = txn.postings[1].account if len(txn.postings) > 1 else None
            state.memory.add_mapping(txn.payee, expense_account, payment_acc)

        return ToolResult(
            success=True,
            message=f"Saved: {input.payee} for {input.amount} {currency}",
            data={
                "id": txn.gullak_id,
                "preview": txn.to_ledger(),
                "transaction": {
                    "date": str(txn.date),
                    "payee": txn.payee,
                    "amount": float(input.amount),
                    "currency": currency,
                    "expense_account": expense_account,
                    "payment_account": payment_account,
                },
            },
        )

    except Exception as e:
        logger.exception(f"Error parsing expense: {e}")
        return ToolResult(success=False, error=str(e), data={})


async def execute_parse_income(state: ToolState, input: ParseIncomeInput) -> ToolResult:
    """Create and save an income transaction immediately."""
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
            source=state.get_source(),
            source_user=state.get_source_user(),
        )

        # Write immediately using shared writer
        if not state.writer:
            return ToolResult(success=False, error="Writer not initialized", data={})
        await state.writer.append_transaction(txn)

        # Track for edit_last_transaction
        thread_id = state.get_thread_id()
        source_user = state.get_source_user()
        state.set_last_confirmed(thread_id, txn.gullak_id, source_user)

        return ToolResult(
            success=True,
            message=f"Saved income: {input.payee} for {input.amount} {currency}",
            data={
                "id": txn.gullak_id,
                "preview": txn.to_ledger(),
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


async def execute_edit_transaction(state: ToolState, input: EditTransactionInput) -> ToolResult:
    """Edit an existing transaction in the ledger."""
    if not input.transaction_id:
        return ToolResult(success=False, error="transaction_id is required", data={})

    updates = _build_transaction_updates(state, input)

    if not updates:
        return ToolResult(success=False, error="No updates provided", data={})

    try:
        if not state.writer:
            return ToolResult(success=False, error="Writer not initialized", data={})
        updated_txn = await state.writer.update_transaction(input.transaction_id, updates)

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


async def execute_edit_last_transaction(
    state: ToolState, input: EditLastTransactionInput
) -> ToolResult:
    """Edit the most recently saved transaction for this thread/user."""
    thread_id = state.get_thread_id()
    source_user = state.get_source_user()
    transaction_id = state.get_last_confirmed(thread_id, source_user)
    if not transaction_id:
        return ToolResult(
            success=False,
            error="No recently saved transaction found for this thread",
            data={},
        )

    updates = _build_transaction_updates(state, input)
    if not updates:
        return ToolResult(success=False, error="No updates provided", data={})

    try:
        if not state.writer:
            return ToolResult(success=False, error="Writer not initialized", data={})
        updated_txn = await state.writer.update_transaction(transaction_id, updates)

        if updated_txn is None:
            return ToolResult(
                success=False,
                error=f"Transaction {transaction_id} not found",
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
        logger.exception(f"Error editing last transaction: {e}")
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
        if not state.writer:
            return ToolResult(success=False, error="Writer not initialized", data={})
        deleted = await state.writer.delete_transaction(input.transaction_id)

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


# Tool definitions for this module
TRANSACTION_TOOLS: dict[str, ToolDefinition] = {
    "parse_expense": ToolDefinition(
        name="parse_expense",
        description="""Parse natural language expense and save it to the ledger.
Use when user mentions spending: "chai 50 rupees", "ordered from Swiggy 350",
"paid rent 15000", "petrol 2000 from ICICI card".
The transaction is saved immediately — no confirmation needed.""",
        input_model=ParseExpenseInput,
        executor=execute_parse_expense,
        is_async=True,
    ),
    "parse_income": ToolDefinition(
        name="parse_income",
        description="""Parse income/earnings and save it to the ledger.
Use when user mentions receiving: "salary credited 75000", "FD interest 5000",
"got refund from Amazon", "dividend from stocks".
The transaction is saved immediately — no confirmation needed.""",
        input_model=ParseIncomeInput,
        executor=execute_parse_income,
        is_async=True,
    ),
    "edit_transaction": ToolDefinition(
        name="edit_transaction",
        description="""Edit an existing transaction in the ledger.

Use this when the user wants to modify a saved transaction and provides a transaction ID.
Use get_recent_transactions first if you don't have the ID.

For the most recent transaction, prefer edit_last_transaction instead.""",
        input_model=EditTransactionInput,
        executor=execute_edit_transaction,
        is_async=True,
    ),
    "edit_last_transaction": ToolDefinition(
        name="edit_last_transaction",
        description="""Edit the most recently saved transaction in this thread.

Use when user says "actually", "change that", "make it X", "update the amount",
"it was paid by X card", "change category to Y", "from kotak", "using upi"
RIGHT AFTER a transaction was just created.

This is the preferred tool for immediate corrections — no transaction ID needed.

DO NOT use parse_expense when user wants to modify the last transaction — that creates
a duplicate. Use edit_last_transaction instead.""",
        input_model=EditLastTransactionInput,
        executor=execute_edit_last_transaction,
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
}
