"""Tests for budget tool: set_budget with tagged block replacement."""

from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from gullak.agent.tool_state import ToolState
from gullak.agent.tools_config import SetBudgetInput, execute_set_budget
from gullak.ledger.models import PeriodicBudget, BudgetEntry


@pytest.fixture
def state(temp_ledger_path):
    temp_ledger_path.write_text("")
    s = ToolState(ledger_path=temp_ledger_path, default_currency="INR")
    s.validator = AsyncMock()
    s.validator.validate_content = AsyncMock(return_value=(True, ""))
    return s


class TestBudgetModel:
    def test_to_ledger_includes_tag(self):
        budget = PeriodicBudget(
            entries=[BudgetEntry(account="Expenses:Food", amount=Decimal("10000"))],
            funding_account="Assets:Checking",
        )
        text = budget.to_ledger()
        assert "; gullak:budget" in text
        assert "~ Monthly" in text
        assert "Expenses:Food" in text
        assert "10000" in text

    def test_multiple_entries(self):
        budget = PeriodicBudget(
            entries=[
                BudgetEntry(account="Expenses:Food", amount=Decimal("10000")),
                BudgetEntry(account="Expenses:Transport", amount=Decimal("5000")),
            ],
        )
        text = budget.to_ledger()
        assert "Expenses:Food" in text
        assert "Expenses:Transport" in text


class TestSetBudget:
    async def test_empty_budgets_rejected(self, state):
        result = await execute_set_budget(state, SetBudgetInput(budgets=[]))
        assert result.success is False

    async def test_basic_budget_creation(self, state, temp_ledger_path):
        result = await execute_set_budget(
            state,
            SetBudgetInput(
                budgets=[
                    {"account": "Expenses:Food", "amount": 10000},
                    {"account": "Expenses:Transport", "amount": 5000},
                ],
            ),
        )
        assert result.success is True
        content = temp_ledger_path.read_text()
        assert "~ Monthly" in content
        assert "gullak:budget" in content
        assert "Expenses:Food" in content
        assert "Expenses:Transport" in content

    async def test_replaces_tagged_budget(self, state, temp_ledger_path):
        """Setting budget twice should replace the first one."""
        await execute_set_budget(
            state,
            SetBudgetInput(budgets=[{"account": "Expenses:Food", "amount": 10000}]),
        )
        await execute_set_budget(
            state,
            SetBudgetInput(budgets=[{"account": "Expenses:Food", "amount": 15000}]),
        )

        content = temp_ledger_path.read_text()
        # Should only have ONE budget block
        assert content.count("gullak:budget") == 1
        assert "15000" in content

    async def test_preserves_non_budget_periodic(self, state, temp_ledger_path):
        """Non-gullak periodic transactions should be preserved."""
        temp_ledger_path.write_text(
            "~ Monthly from 2026-01-01 to 2026-03-01\n"
            "    Expenses:Rent  25000 INR\n"
            "    Assets:Checking\n"
            "\n"
        )

        result = await execute_set_budget(
            state,
            SetBudgetInput(budgets=[{"account": "Expenses:Food", "amount": 10000}]),
        )
        assert result.success is True

        content = temp_ledger_path.read_text()
        # Both should exist: the manual periodic AND the new budget
        assert "Expenses:Rent" in content
        assert "Expenses:Food" in content
        assert content.count("~ Monthly") == 2

    async def test_preserves_transactions(self, state, temp_ledger_path):
        """Existing transactions should be preserved when setting budget."""
        temp_ledger_path.write_text(
            "2026/02/15 Swiggy\n"
            "    ; gullak:id abc12345\n"
            "    Expenses:Food:Delivery  350.00 INR\n"
            "    Assets:Cash  -350.00 INR\n"
        )

        result = await execute_set_budget(
            state,
            SetBudgetInput(budgets=[{"account": "Expenses:Food", "amount": 10000}]),
        )
        assert result.success is True

        content = temp_ledger_path.read_text()
        assert "Swiggy" in content
        assert "gullak:budget" in content

    async def test_validation_failure_rolls_back(self, state, temp_ledger_path):
        """If validation fails, the file should not be modified."""
        temp_ledger_path.write_text("original content\n")
        state.validator.validate_content = AsyncMock(
            return_value=(False, "Invalid ledger")
        )

        result = await execute_set_budget(
            state,
            SetBudgetInput(budgets=[{"account": "Expenses:Food", "amount": 10000}]),
        )
        assert result.success is False
        assert "Invalid ledger" in result.error

        content = temp_ledger_path.read_text()
        assert content == "original content\n"
