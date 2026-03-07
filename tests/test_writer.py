"""Tests for LedgerWriter: append, update, delete transactions."""

from datetime import date
from decimal import Decimal
from unittest.mock import AsyncMock, patch

import pytest

from gullak.ledger.models import Transaction
from gullak.ledger.writer import LedgerWriter


@pytest.fixture
def writer(temp_ledger_path):
    """Create a LedgerWriter with mocked validator and no Paisa sync."""
    w = LedgerWriter(temp_ledger_path, paisa_url=None)
    # Mock validator to always pass
    w.validator = AsyncMock()
    w.validator.validate_content = AsyncMock(return_value=(True, ""))
    return w


@pytest.fixture
def sample_txn():
    """Create a sample expense transaction."""
    return Transaction.create_expense(
        date=date(2026, 2, 15),
        payee="Swiggy",
        amount=Decimal("350"),
        expense_account="Expenses:Food:Delivery",
        payment_account="Assets:Bank:HDFC:UPI",
    )


@pytest.fixture
def sample_income():
    """Create a sample income transaction."""
    return Transaction.create_income(
        date=date(2026, 2, 1),
        payee="Employer",
        amount=Decimal("75000"),
        income_account="Income:Salary",
        deposit_account="Assets:Bank:HDFC",
    )


class TestAppendTransaction:
    async def test_append_to_empty_file(self, writer, sample_txn, temp_ledger_path):
        temp_ledger_path.write_text("")
        result = await writer.append_transaction(sample_txn)
        assert result is True

        content = temp_ledger_path.read_text()
        assert "Swiggy" in content
        assert "350.00" in content
        assert "Expenses:Food:Delivery" in content
        assert f"gullak:id {sample_txn.gullak_id}" in content

    async def test_append_to_existing_file(self, writer, sample_txn, temp_ledger_path):
        temp_ledger_path.write_text(
            "2026/01/01 Old Transaction\n"
            "    ; gullak:id old12345\n"
            "    Expenses:Food  100.00 INR\n"
            "    Assets:Cash  -100.00 INR\n"
        )
        result = await writer.append_transaction(sample_txn)
        assert result is True

        content = temp_ledger_path.read_text()
        assert "Old Transaction" in content
        assert "Swiggy" in content

    async def test_duplicate_id_raises(self, writer, sample_txn, temp_ledger_path):
        temp_ledger_path.write_text(f"    ; gullak:id {sample_txn.gullak_id}\n")
        with pytest.raises(ValueError, match="already exists"):
            await writer.append_transaction(sample_txn)

    async def test_append_multiple(self, writer, temp_ledger_path):
        temp_ledger_path.write_text("")
        txns = [
            Transaction.create_expense(
                date=date(2026, 2, i),
                payee=f"Vendor {i}",
                amount=Decimal(str(100 * i)),
                expense_account="Expenses:Food",
                payment_account="Assets:Cash",
            )
            for i in range(1, 4)
        ]
        count = await writer.append_transactions(txns)
        assert count == 3

        content = temp_ledger_path.read_text()
        assert "Vendor 1" in content
        assert "Vendor 2" in content
        assert "Vendor 3" in content

    async def test_append_empty_list(self, writer):
        count = await writer.append_transactions([])
        assert count == 0

    async def test_append_income(self, writer, sample_income, temp_ledger_path):
        temp_ledger_path.write_text("")
        await writer.append_transaction(sample_income)
        content = temp_ledger_path.read_text()
        assert "Employer" in content
        assert "Income:Salary" in content
        assert "75000.00" in content


class TestDeleteTransaction:
    async def test_delete_existing(self, writer, sample_txn, temp_ledger_path):
        temp_ledger_path.write_text("")
        await writer.append_transaction(sample_txn)

        deleted = await writer.delete_transaction(sample_txn.gullak_id)
        assert deleted is True

        content = temp_ledger_path.read_text()
        assert sample_txn.gullak_id not in content

    async def test_delete_nonexistent(self, writer, temp_ledger_path):
        temp_ledger_path.write_text("")
        deleted = await writer.delete_transaction("nonexist")
        assert deleted is False

    async def test_delete_preserves_other_transactions(self, writer, temp_ledger_path):
        temp_ledger_path.write_text("")
        txn1 = Transaction.create_expense(
            date=date(2026, 2, 1), payee="Keep This",
            amount=Decimal("100"), expense_account="Expenses:A", payment_account="Assets:Cash",
        )
        txn2 = Transaction.create_expense(
            date=date(2026, 2, 2), payee="Delete This",
            amount=Decimal("200"), expense_account="Expenses:B", payment_account="Assets:Cash",
        )
        await writer.append_transactions([txn1, txn2])

        await writer.delete_transaction(txn2.gullak_id)

        content = temp_ledger_path.read_text()
        assert "Keep This" in content
        assert "Delete This" not in content

    async def test_delete_empty_file(self, writer, temp_ledger_path):
        temp_ledger_path.write_text("")
        assert await writer.delete_transaction("any") is False


class TestUpdateTransaction:
    async def test_update_payee(self, writer, sample_txn, temp_ledger_path):
        temp_ledger_path.write_text("")
        await writer.append_transaction(sample_txn)

        updated = await writer.update_transaction(sample_txn.gullak_id, {"payee": "Zomato"})
        assert updated is not None
        assert updated.payee == "Zomato"

        content = temp_ledger_path.read_text()
        assert "Zomato" in content
        assert "Swiggy" not in content

    async def test_update_amount(self, writer, sample_txn, temp_ledger_path):
        temp_ledger_path.write_text("")
        await writer.append_transaction(sample_txn)

        updated = await writer.update_transaction(
            sample_txn.gullak_id, {"amount": Decimal("500")}
        )
        assert updated is not None
        assert updated.total_amount == Decimal("500")

    async def test_update_account(self, writer, sample_txn, temp_ledger_path):
        temp_ledger_path.write_text("")
        await writer.append_transaction(sample_txn)

        updated = await writer.update_transaction(
            sample_txn.gullak_id, {"expense_account": "Expenses:Food:Restaurants"}
        )
        assert updated is not None
        content = temp_ledger_path.read_text()
        assert "Expenses:Food:Restaurants" in content

    async def test_update_payment_account(self, writer, sample_txn, temp_ledger_path):
        temp_ledger_path.write_text("")
        await writer.append_transaction(sample_txn)

        updated = await writer.update_transaction(
            sample_txn.gullak_id, {"payment_account": "Assets:Cash"}
        )
        assert updated is not None
        content = temp_ledger_path.read_text()
        assert "Assets:Cash" in content

    async def test_update_nonexistent(self, writer, temp_ledger_path):
        temp_ledger_path.write_text("")
        result = await writer.update_transaction("nonexist", {"payee": "Test"})
        assert result is None

    async def test_update_preserves_other_transactions(self, writer, temp_ledger_path):
        temp_ledger_path.write_text("")
        txn1 = Transaction.create_expense(
            date=date(2026, 2, 1), payee="Unchanged",
            amount=Decimal("100"), expense_account="Expenses:A", payment_account="Assets:Cash",
        )
        txn2 = Transaction.create_expense(
            date=date(2026, 2, 2), payee="ToUpdate",
            amount=Decimal("200"), expense_account="Expenses:B", payment_account="Assets:Cash",
        )
        await writer.append_transactions([txn1, txn2])

        await writer.update_transaction(txn2.gullak_id, {"payee": "Updated"})

        content = temp_ledger_path.read_text()
        assert "Unchanged" in content
        assert "Updated" in content
        assert "ToUpdate" not in content


class TestTransactionSpan:
    """Test the span-finding logic."""

    def test_find_span_basic(self):
        lines = [
            "2026/02/15 Swiggy",
            "    ; gullak:id abc12345",
            "    Expenses:Food  350.00 INR",
            "    Assets:Cash  -350.00 INR",
            "",
            "2026/02/16 Zomato",
            "    ; gullak:id def67890",
            "    Expenses:Food  200.00 INR",
            "    Assets:Cash  -200.00 INR",
        ]
        start, end = LedgerWriter._find_transaction_span(lines, "abc12345")
        assert start == 0
        assert end == 4

    def test_find_span_not_found(self):
        lines = ["2026/02/15 Test", "    ; gullak:id abc", "    Expenses  100 INR"]
        start, end = LedgerWriter._find_transaction_span(lines, "nonexist")
        assert start is None
        assert end is None

    def test_find_span_at_end_of_file(self):
        lines = [
            "2026/02/15 First",
            "    ; gullak:id first",
            "    Expenses:Food  100.00 INR",
            "    Assets:Cash  -100.00 INR",
            "",
            "2026/02/16 Last",
            "    ; gullak:id last1",
            "    Expenses:Food  200.00 INR",
            "    Assets:Cash  -200.00 INR",
        ]
        start, end = LedgerWriter._find_transaction_span(lines, "last1")
        assert start == 5
        assert end == 9


class TestPaisaSync:
    """Test Paisa sync behavior."""

    async def test_sync_skipped_when_no_url(self, temp_ledger_path):
        writer = LedgerWriter(temp_ledger_path, paisa_url=None)
        # Should not raise
        await writer._sync_paisa()

    @patch("gullak.ledger.writer.httpx.AsyncClient")
    async def test_sync_called_with_url(self, mock_client_cls, temp_ledger_path):
        mock_client = AsyncMock()
        mock_response = AsyncMock()
        mock_response.status_code = 200
        mock_response.json = lambda: {"success": True}  # sync method, not async
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        writer = LedgerWriter(temp_ledger_path, paisa_url="http://paisa:7500")
        await writer._sync_paisa()

        mock_client.post.assert_awaited_once()
