"""Tests for payee mapping behavior in transaction parsing."""

from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock

import pytest

from gullak.agent.tool_state import ToolState
from gullak.agent.tools_transactions import ParseExpenseInput, execute_parse_expense


def _write_payee_mapping(ledger_path, mapping_line: str) -> None:
    ledger_path.write_text(mapping_line + "\n")


@pytest.fixture
def mock_writer():
    """Mock LedgerWriter injected via state.writer."""
    writer = MagicMock()
    writer.append_transaction = AsyncMock(return_value=True)
    return writer


async def test_parse_expense_applies_payment_mapping_when_missing(temp_ledger_path, mock_writer):
    _write_payee_mapping(
        temp_ledger_path,
        "; gullak:payee_map Swiggy=Expenses:Food:Delivery|Liabilities:CreditCard:Axis",
    )
    state = ToolState(ledger_path=temp_ledger_path, default_currency="INR")
    state.writer = mock_writer

    result = await execute_parse_expense(
        state,
        ParseExpenseInput(
            payee="Swiggy",
            amount=Decimal("350"),
            expense_account="Expenses:Unknown",
            payment_account=None,
        ),
    )

    assert result.success is True
    assert result.data["transaction"]["expense_account"] == "Expenses:Food:Delivery"
    assert result.data["transaction"]["payment_account"] == "Liabilities:CreditCard:Axis"


async def test_parse_expense_keeps_explicit_payment_account(temp_ledger_path, mock_writer):
    _write_payee_mapping(
        temp_ledger_path,
        "; gullak:payee_map Swiggy=Expenses:Food:Delivery|Liabilities:CreditCard:Axis",
    )
    state = ToolState(ledger_path=temp_ledger_path, default_currency="INR")
    state.writer = mock_writer

    result = await execute_parse_expense(
        state,
        ParseExpenseInput(
            payee="Swiggy",
            amount=Decimal("350"),
            expense_account="Expenses:Food:Delivery",
            payment_account="Assets:Cash",
        ),
    )

    assert result.success is True
    assert result.data["transaction"]["payment_account"] == "Assets:Cash"
