"""Tests for ledger module."""

from datetime import date
from decimal import Decimal

import pytest

from gullak.ledger.models import Posting, Transaction, TransactionStatus
from gullak.ledger.parser import LedgerParser


class TestTransaction:
    """Test Transaction model."""

    def test_create_expense(self):
        """Test creating a simple expense transaction."""
        txn = Transaction.create_expense(
            date=date(2024, 1, 15),
            payee="BigBasket",
            amount=Decimal("500"),
            expense_account="Expenses:Food:Groceries",
            payment_account="Assets:Cash",
            currency="INR",
        )

        assert txn.date == date(2024, 1, 15)
        assert txn.payee == "BigBasket"
        assert len(txn.postings) == 2
        assert txn.postings[0].amount == Decimal("500")
        assert txn.postings[1].amount == Decimal("-500")
        assert txn.total_amount == Decimal("500")

    def test_to_ledger_format(self):
        """Test converting transaction to ledger format."""
        txn = Transaction.create_expense(
            date=date(2024, 1, 15),
            payee="Test Payee",
            amount=Decimal("100"),
            expense_account="Expenses:Test",
            payment_account="Assets:Cash",
        )

        ledger = txn.to_ledger()
        assert "2024/01/15" in ledger
        assert "Test Payee" in ledger
        assert "Expenses:Test" in ledger
        assert "Assets:Cash" in ledger
        assert "gullak:id" in ledger


class TestPosting:
    """Test Posting model."""

    def test_to_ledger_format(self):
        """Test converting posting to ledger format."""
        posting = Posting(
            account="Expenses:Food:Groceries",
            amount=Decimal("500.50"),
            currency="INR",
        )

        ledger = posting.to_ledger()
        assert "Expenses:Food:Groceries" in ledger
        assert "500.50" in ledger
        assert "INR" in ledger


class TestLedgerParser:
    """Test LedgerParser."""

    def test_parse_empty_file(self, temp_ledger_path):
        """Test parsing empty file."""
        temp_ledger_path.write_text("")
        parser = LedgerParser()
        transactions = parser.parse_file(temp_ledger_path)
        assert transactions == []

    def test_parse_simple_transaction(self, sample_ledger_file):
        """Test parsing a file with transactions."""
        parser = LedgerParser()
        transactions = parser.parse_file(sample_ledger_file)

        assert len(transactions) == 3

        # Check first transaction
        txn = transactions[0]
        assert txn.date == date(2024, 1, 15)
        assert txn.payee == "BigBasket"
        assert txn.status == TransactionStatus.CLEARED
        assert txn.gullak_id == "abc123"
        assert len(txn.postings) == 2

    def test_extract_accounts(self, sample_ledger_file):
        """Test extracting unique accounts."""
        parser = LedgerParser()
        accounts = parser.extract_accounts(sample_ledger_file)

        assert "Expenses:Food:Groceries" in accounts
        assert "Expenses:Food:Delivery" in accounts
        assert "Expenses:Transport:Fuel" in accounts
        assert "Assets:Cash" in accounts
        assert "Assets:Bank:HDFC" in accounts

    def test_extract_payees(self, sample_ledger_file):
        """Test extracting unique payees."""
        parser = LedgerParser()
        payees = parser.extract_payees(sample_ledger_file)

        assert "BigBasket" in payees
        assert "Swiggy - Lunch" in payees
        assert "Shell Petrol" in payees

    def test_parse_transaction_with_note(self, sample_ledger_file):
        """Test parsing transaction with note."""
        parser = LedgerParser()
        transactions = parser.parse_file(sample_ledger_file)

        # Second transaction has a note
        txn = transactions[1]
        assert txn.note == "Quick lunch"
