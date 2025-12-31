"""Pytest configuration and fixtures."""

import tempfile
from pathlib import Path

import pytest


@pytest.fixture
def temp_ledger_path():
    """Create a temporary ledger file path."""
    with tempfile.NamedTemporaryFile(suffix=".ledger", delete=False) as f:
        yield Path(f.name)
    # Cleanup
    Path(f.name).unlink(missing_ok=True)


@pytest.fixture
def sample_ledger_content():
    """Sample ledger content for testing."""
    return """
2024/01/15 * BigBasket
    ; gullak:id abc123
    Expenses:Food:Groceries  500.00 INR
    Assets:Cash             -500.00 INR

2024/01/16 Swiggy - Lunch
    ; gullak:id def456
    ; Quick lunch
    Expenses:Food:Delivery   350.00 INR
    Assets:Bank:HDFC        -350.00 INR

2024/01/17 * Shell Petrol
    Expenses:Transport:Fuel  1500.00 INR
    Liabilities:CreditCard:HDFC
"""


@pytest.fixture
def sample_ledger_file(temp_ledger_path, sample_ledger_content):
    """Create a sample ledger file."""
    temp_ledger_path.write_text(sample_ledger_content)
    return temp_ledger_path
