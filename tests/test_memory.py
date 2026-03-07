"""Tests for PayeeMemory: mapping persistence, fuzzy matching, CRUD."""

import pytest

from gullak.ledger.memory import PayeeMemory


@pytest.fixture
def memory(temp_ledger_path):
    """PayeeMemory with some initial mappings."""
    temp_ledger_path.write_text(
        "; gullak:payee_map Swiggy=Expenses:Food:Delivery|Assets:Bank:HDFC:UPI\n"
        "; gullak:payee_map BigBasket=Expenses:Food:Groceries\n"
        "; gullak:payee_map Netflix=Expenses:Entertainment:Streaming\n"
        "; gullak:payee_map Uber=Expenses:Transport:Rides\n"
    )
    return PayeeMemory(temp_ledger_path)


@pytest.fixture
def empty_memory(temp_ledger_path):
    temp_ledger_path.write_text("")
    return PayeeMemory(temp_ledger_path)


class TestMappingLoad:
    def test_load_basic_mapping(self, memory):
        mapping = memory.get_mapping("swiggy")
        assert mapping is not None
        assert mapping.expense_account == "Expenses:Food:Delivery"
        assert mapping.payment_account == "Assets:Bank:HDFC:UPI"

    def test_load_mapping_without_payment(self, memory):
        mapping = memory.get_mapping("bigbasket")
        assert mapping is not None
        assert mapping.expense_account == "Expenses:Food:Groceries"
        assert mapping.payment_account is None

    def test_case_insensitive(self, memory):
        assert memory.get_mapping("SWIGGY") is not None
        assert memory.get_mapping("Swiggy") is not None

    def test_nonexistent_mapping(self, memory):
        assert memory.get_mapping("UnknownVendor") is None

    def test_empty_ledger(self, empty_memory):
        assert empty_memory.get_mapping("anything") is None


class TestSuggestion:
    def test_suggest_expense_account(self, memory):
        result = memory.suggest_account("Swiggy")
        assert result == "Expenses:Food:Delivery"

    def test_suggest_both_accounts(self, memory):
        expense, payment = memory.suggest_accounts("Swiggy")
        assert expense == "Expenses:Food:Delivery"
        assert payment == "Assets:Bank:HDFC:UPI"

    def test_fuzzy_match_substring(self, memory):
        """Substring matching: 'Swiggy Order' contains 'swiggy'."""
        result = memory.suggest_account("Swiggy Order")
        assert result == "Expenses:Food:Delivery"

    def test_fuzzy_match_similar(self, memory):
        """Similar names should match via SequenceMatcher."""
        result = memory.suggest_account("Swigy")  # typo
        # Should still match due to high similarity ratio
        assert result == "Expenses:Food:Delivery"

    def test_no_suggestion_for_unknown(self, memory):
        result = memory.suggest_account("CompletelyUnknownVendorXYZ")
        assert result is None


class TestMappingPersistence:
    def test_add_mapping(self, empty_memory, temp_ledger_path):
        empty_memory.add_mapping("Zepto", "Expenses:Food:Groceries", "Assets:Bank:ICICI:UPI")

        # Verify in-memory
        mapping = empty_memory.get_mapping("zepto")
        assert mapping is not None
        assert mapping.expense_account == "Expenses:Food:Groceries"

        # Verify persisted to file
        content = temp_ledger_path.read_text()
        assert "gullak:payee_map Zepto=Expenses:Food:Groceries|Assets:Bank:ICICI:UPI" in content

    def test_update_existing_mapping(self, memory, temp_ledger_path):
        memory.add_mapping("Swiggy", "Expenses:Food:DiningOut", "Assets:Cash")

        mapping = memory.get_mapping("swiggy")
        assert mapping.expense_account == "Expenses:Food:DiningOut"
        assert mapping.payment_account == "Assets:Cash"

        content = temp_ledger_path.read_text()
        assert content.count("gullak:payee_map Swiggy") == 1  # no duplicate

    def test_no_duplicate_write_for_same_mapping(self, memory, temp_ledger_path):
        original = temp_ledger_path.read_text()
        memory.add_mapping("Swiggy", "Expenses:Food:Delivery", "Assets:Bank:HDFC:UPI")
        # Should not write since mapping is identical
        assert temp_ledger_path.read_text() == original

    def test_remove_mapping(self, memory, temp_ledger_path):
        removed = memory.remove_mapping("Netflix")
        assert removed is True
        assert memory.get_mapping("netflix") is None
        assert "Netflix" not in temp_ledger_path.read_text()

    def test_remove_nonexistent(self, memory):
        assert memory.remove_mapping("DoesNotExist") is False

    def test_get_all_mappings(self, memory):
        all_mappings = memory.get_all_mappings()
        assert len(all_mappings) == 4
        assert "swiggy" in all_mappings
        assert "netflix" in all_mappings


class TestReload:
    def test_new_instance_loads_previous_mappings(self, temp_ledger_path):
        mem1 = PayeeMemory(temp_ledger_path)
        mem1.add_mapping("NewVendor", "Expenses:Test")

        mem2 = PayeeMemory(temp_ledger_path)
        assert mem2.get_mapping("newvendor") is not None
        assert mem2.get_mapping("newvendor").expense_account == "Expenses:Test"
