"""Tests for ToolState: date parsing, account suggestions, thread context."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from gullak.agent.tool_state import ToolState


@pytest.fixture
def state(temp_ledger_path):
    """Create a ToolState with empty ledger."""
    temp_ledger_path.write_text("")
    return ToolState(ledger_path=temp_ledger_path, default_currency="INR")


@pytest.fixture
def state_with_mappings(temp_ledger_path):
    """Create a ToolState with payee mappings."""
    temp_ledger_path.write_text(
        "; gullak:payee_map Swiggy=Expenses:Food:Delivery|Assets:Bank:HDFC:UPI\n"
        "; gullak:payee_map BigBasket=Expenses:Food:Groceries\n"
        "; gullak:payee_map Netflix=Expenses:Entertainment:Streaming\n"
    )
    return ToolState(ledger_path=temp_ledger_path, default_currency="INR")


class TestDateParsing:
    """Test relative and absolute date parsing."""

    def test_today(self, state):
        result = state.parse_date("today")
        assert result == date.today()

    def test_yesterday(self, state):
        result = state.parse_date("yesterday")
        assert result == date.today() - timedelta(days=1)

    def test_tomorrow(self, state):
        result = state.parse_date("tomorrow")
        assert result == date.today() + timedelta(days=1)

    def test_days_ago(self, state):
        result = state.parse_date("3 days ago")
        assert result == date.today() - timedelta(days=3)

    def test_iso_format(self, state):
        result = state.parse_date("2026-02-15")
        assert result == date(2026, 2, 15)

    def test_slash_format(self, state):
        result = state.parse_date("2026/02/15")
        assert result == date(2026, 2, 15)

    def test_empty_defaults_to_today(self, state):
        result = state.parse_date("")
        assert result == date.today()

    def test_last_monday(self, state):
        result = state.parse_date("last monday")
        assert result.weekday() == 0  # Monday
        assert result < date.today()

    def test_invalid_defaults_to_today(self, state):
        result = state.parse_date("gibberish")
        assert result == date.today()

    def test_time_context_overrides_today(self, state):
        """Test that set_time_context affects relative dates."""
        fixed = datetime(2026, 1, 15, 10, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
        state.set_time_context(fixed)
        assert state.parse_date("today") == date(2026, 1, 15)
        assert state.parse_date("yesterday") == date(2026, 1, 14)

    def test_time_context_reset(self, state):
        fixed = datetime(2026, 1, 15, 10, 0, tzinfo=ZoneInfo("Asia/Kolkata"))
        state.set_time_context(fixed)
        state.set_time_context(None)
        assert state.parse_date("today") == date.today()


class TestAccountSuggestion:
    """Test account suggestion from payee memory and patterns."""

    def test_suggest_from_memory(self, state_with_mappings):
        result = state_with_mappings.suggest_account("Swiggy")
        assert result == "Expenses:Food:Delivery"

    def test_suggest_from_pattern(self, state):
        result = state.suggest_account("Uber ride")
        assert "Transport" in result

    def test_suggest_both_accounts(self, state_with_mappings):
        expense, payment = state_with_mappings.suggest_accounts("Swiggy")
        assert expense == "Expenses:Food:Delivery"
        assert payment == "Assets:Bank:HDFC:UPI"

    def test_suggest_expense_only_mapping(self, state_with_mappings):
        expense, payment = state_with_mappings.suggest_accounts("BigBasket")
        assert expense == "Expenses:Food:Groceries"
        assert payment is None

    def test_suggest_unknown_payee(self, state):
        # With no amount, falls back to amount heuristic (0 → Snacks) or pattern
        result = state.suggest_account("Random Unknown Shop", amount=Decimal("50000"))
        assert result == "Expenses:Other"

    def test_fuzzy_match(self, state_with_mappings):
        """Fuzzy matching should find close payees."""
        result = state_with_mappings.suggest_account("Swiggy Order")
        assert result == "Expenses:Food:Delivery"


class TestThreadContext:
    """Test thread-based state management."""

    def test_set_and_get_thread_id(self, state):
        state.set_thread_id("thread-123")
        assert state.get_thread_id() == "thread-123"

    def test_last_confirmed_per_thread(self, state):
        state.set_last_confirmed("thread-1", "abc12345")
        state.set_last_confirmed("thread-2", "def67890")

        assert state.get_last_confirmed("thread-1") == "abc12345"
        assert state.get_last_confirmed("thread-2") == "def67890"

    def test_last_confirmed_none_for_unknown_thread(self, state):
        assert state.get_last_confirmed("nonexistent") is None

    def test_last_confirmed_overwrites(self, state):
        state.set_last_confirmed("thread-1", "first")
        state.set_last_confirmed("thread-1", "second")
        assert state.get_last_confirmed("thread-1") == "second"


class TestAccountListing:
    """Test get_accounts functionality."""

    def test_empty_ledger(self, state):
        assert state.get_accounts() == []

    def test_filter_by_type(self, temp_ledger_path):
        temp_ledger_path.write_text(
            "2026/01/01 Test\n"
            "    Expenses:Food  100 INR\n"
            "    Assets:Cash  -100 INR\n"
            "\n"
            "2026/01/02 Income\n"
            "    Income:Salary  -50000 INR\n"
            "    Assets:Bank:HDFC  50000 INR\n"
        )
        state = ToolState(ledger_path=temp_ledger_path)

        expense_accounts = state.get_accounts("expenses")
        assert "Expenses:Food" in expense_accounts
        assert all(a.startswith("Expenses:") for a in expense_accounts)

        asset_accounts = state.get_accounts("assets")
        assert "Assets:Cash" in asset_accounts
        assert all(a.startswith("Assets:") for a in asset_accounts)


class TestMemoryRefresh:
    """Test mtime-based memory refresh."""

    def test_refresh_on_external_change(self, temp_ledger_path):
        temp_ledger_path.write_text(
            "; gullak:payee_map Swiggy=Expenses:Food:Delivery\n"
        )
        state = ToolState(ledger_path=temp_ledger_path)
        assert state.suggest_account("Swiggy") == "Expenses:Food:Delivery"

        # Simulate external change
        temp_ledger_path.write_text(
            "; gullak:payee_map Swiggy=Expenses:Food:DiningOut\n"
        )
        # Force stale check
        state._memory_mtime = 0
        assert state.suggest_account("Swiggy") == "Expenses:Food:DiningOut"
