"""Tests for transaction tool executors: parse_expense, parse_income, edit, delete."""

from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from gullak.agent.tool_state import ToolState
from gullak.agent.tools_transactions import (
    DeleteTransactionInput,
    EditLastTransactionInput,
    ParseExpenseInput,
    ParseIncomeInput,
    execute_delete_transaction,
    execute_edit_last_transaction,
    execute_parse_expense,
    execute_parse_income,
)
from gullak.ledger.models import Transaction


@pytest.fixture
def mock_writer():
    """Mock LedgerWriter injected via state.writer."""
    writer = MagicMock()
    writer.append_transaction = AsyncMock(return_value=True)
    writer.update_transaction = AsyncMock(return_value=None)
    writer.delete_transaction = AsyncMock(return_value=True)
    return writer


@pytest.fixture
def state(temp_ledger_path, mock_writer):
    temp_ledger_path.write_text("")
    s = ToolState(ledger_path=temp_ledger_path, default_currency="INR")
    s.writer = mock_writer
    return s


class TestParseExpense:
    async def test_basic_expense(self, state, mock_writer):
        result = await execute_parse_expense(
            state,
            ParseExpenseInput(
                payee="Swiggy",
                amount=Decimal("350"),
                expense_account="Expenses:Food:Delivery",
                payment_account="Assets:Bank:HDFC:UPI",
            ),
        )
        assert result.success is True
        assert result.data["transaction"]["payee"] == "Swiggy"
        assert result.data["transaction"]["amount"] == 350.0
        assert "id" in result.data
        mock_writer.append_transaction.assert_awaited_once()

    async def test_null_amount_asks_user(self, state, mock_writer):
        result = await execute_parse_expense(
            state,
            ParseExpenseInput(
                payee="Chai",
                amount=None,
                expense_account="Expenses:Food:Snacks",
            ),
        )
        assert result.success is True
        assert result.data.get("needs_amount") is True
        mock_writer.append_transaction.assert_not_awaited()

    async def test_zero_amount_asks_user(self, state, mock_writer):
        result = await execute_parse_expense(
            state,
            ParseExpenseInput(
                payee="Chai",
                amount=Decimal("0"),
                expense_account="Expenses:Food:Snacks",
            ),
        )
        assert result.success is True
        assert result.data.get("needs_amount") is True

    async def test_default_payment_account(self, state, mock_writer):
        result = await execute_parse_expense(
            state,
            ParseExpenseInput(
                payee="Chai",
                amount=Decimal("50"),
                expense_account="Expenses:Food:Snacks",
                payment_account=None,
            ),
        )
        assert result.success is True
        assert result.data["transaction"]["payment_account"] == "Assets:Cash"

    async def test_recurring_expense(self, state, mock_writer):
        result = await execute_parse_expense(
            state,
            ParseExpenseInput(
                payee="Netflix",
                amount=Decimal("649"),
                expense_account="Expenses:Entertainment:Streaming",
                payment_account="Assets:Bank:HDFC",
                is_recurring=True,
                recurring_name="Netflix",
                recurring_period="monthly",
            ),
        )
        assert result.success is True
        preview = result.data["preview"]
        assert "Recurring" in preview
        assert "Netflix" in preview

    async def test_tracks_last_confirmed(self, state, mock_writer):
        state.set_thread_id("test-thread")
        result = await execute_parse_expense(
            state,
            ParseExpenseInput(
                payee="Chai",
                amount=Decimal("50"),
                expense_account="Expenses:Food:Snacks",
            ),
        )
        assert result.success is True
        last_id = state.get_last_confirmed("test-thread")
        assert last_id == result.data["id"]

    async def test_custom_currency(self, state, mock_writer):
        result = await execute_parse_expense(
            state,
            ParseExpenseInput(
                payee="Starbucks",
                amount=Decimal("5.50"),
                expense_account="Expenses:Food:Coffee",
                payment_account="Assets:Cash",
                currency="USD",
            ),
        )
        assert result.success is True
        assert result.data["transaction"]["currency"] == "USD"

    async def test_with_note(self, state, mock_writer):
        result = await execute_parse_expense(
            state,
            ParseExpenseInput(
                payee="Restaurant",
                amount=Decimal("1200"),
                expense_account="Expenses:Food:Restaurants",
                payment_account="Assets:Cash",
                note="Team dinner",
            ),
        )
        assert result.success is True
        assert "Team dinner" in result.data["preview"]


class TestParseIncome:
    async def test_basic_income(self, state, mock_writer):
        result = await execute_parse_income(
            state,
            ParseIncomeInput(
                payee="Employer",
                amount=Decimal("75000"),
                income_account="Income:Salary",
                deposit_account="Assets:Bank:HDFC",
            ),
        )
        assert result.success is True
        assert result.data["transaction"]["amount"] == 75000.0
        assert result.data["transaction"]["income_account"] == "Income:Salary"
        mock_writer.append_transaction.assert_awaited_once()

    async def test_interest_income(self, state, mock_writer):
        result = await execute_parse_income(
            state,
            ParseIncomeInput(
                payee="HDFC Bank",
                amount=Decimal("500"),
                income_account="Income:Interest",
                deposit_account="Assets:Bank:HDFC",
            ),
        )
        assert result.success is True


class TestEditLastTransaction:
    async def test_no_recent_transaction(self, state, mock_writer):
        state.set_thread_id("test-thread")
        result = await execute_edit_last_transaction(
            state,
            EditLastTransactionInput(payee="Updated"),
        )
        assert result.success is False
        assert "No recently saved" in result.error

    async def test_no_updates_provided(self, state, mock_writer):
        state.set_thread_id("test-thread")
        state.set_last_confirmed("test-thread", "abc12345")
        result = await execute_edit_last_transaction(
            state,
            EditLastTransactionInput(),
        )
        assert result.success is False
        assert "No updates" in result.error

    async def test_edit_after_create(self, state, mock_writer):
        """Simulate create-then-edit flow."""
        state.set_thread_id("test-thread")

        # Create
        create_result = await execute_parse_expense(
            state,
            ParseExpenseInput(
                payee="Swiggy",
                amount=Decimal("350"),
                expense_account="Expenses:Food:Delivery",
            ),
        )
        assert create_result.success is True

        # Now mock update_transaction to return a transaction
        updated_txn = Transaction.create_expense(
            date=date(2026, 2, 15),
            payee="Swiggy",
            amount=Decimal("500"),
            expense_account="Expenses:Food:Delivery",
            payment_account="Assets:Cash",
        )
        mock_writer.update_transaction = AsyncMock(return_value=updated_txn)

        # Edit
        edit_result = await execute_edit_last_transaction(
            state,
            EditLastTransactionInput(amount=Decimal("500")),
        )
        assert edit_result.success is True
        mock_writer.update_transaction.assert_awaited_once()


class TestDeleteTransaction:
    async def test_delete_requires_id(self, state, mock_writer):
        result = await execute_delete_transaction(
            state,
            DeleteTransactionInput(transaction_id=""),
        )
        assert result.success is False

    async def test_delete_not_found(self, state, mock_writer, temp_ledger_path):
        temp_ledger_path.write_text("")
        result = await execute_delete_transaction(
            state,
            DeleteTransactionInput(transaction_id="nonexist"),
        )
        assert result.success is False

    async def test_delete_existing(self, state, mock_writer, temp_ledger_path):
        # Write a transaction to the ledger file so parser can find it
        txn = Transaction.create_expense(
            date=date(2026, 2, 15),
            payee="DeleteMe",
            amount=Decimal("100"),
            expense_account="Expenses:Test",
            payment_account="Assets:Cash",
        )
        temp_ledger_path.write_text(txn.to_ledger() + "\n")

        result = await execute_delete_transaction(
            state,
            DeleteTransactionInput(transaction_id=txn.gullak_id),
        )
        assert result.success is True
        assert result.data["payee"] == "DeleteMe"
