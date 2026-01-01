"""Pytest configuration and fixtures."""

import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def temp_ledger_path():
    """Create a temporary ledger file path."""
    with tempfile.NamedTemporaryFile(suffix=".ledger", delete=False) as f:
        yield Path(f.name)
    # Cleanup
    Path(f.name).unlink(missing_ok=True)


@pytest.fixture
def temp_db_path():
    """Create a temporary database file path."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        yield Path(f.name)
    # Cleanup
    Path(f.name).unlink(missing_ok=True)


@pytest.fixture
def temp_data_dir(tmp_path):
    """Create a temporary data directory with ledger file."""
    ledger_file = tmp_path / "main.ledger"
    ledger_file.write_text("")
    return tmp_path


@pytest.fixture
async def client(temp_data_dir):
    """Create an async HTTP client with properly initialized app."""
    with patch.dict(
        "os.environ",
        {
            "GULLAK_DATA_DIR": str(temp_data_dir),
            "GULLAK_LEDGER_PATH": str(temp_data_dir / "main.ledger"),
            "ANTHROPIC_API_KEY": "test-key",
        },
    ):
        from contextlib import asynccontextmanager

        from gullak.agent import GullakAgent
        from gullak.ledger.parser import LedgerParser
        from gullak.ledger.validator import LedgerValidator

        @asynccontextmanager
        async def test_lifespan(app):
            app.state.settings = type(
                "Settings",
                (),
                {
                    "ledger_path": temp_data_dir / "main.ledger",
                    "default_currency": "INR",
                    "timezone": "Asia/Kolkata",
                    "ledger_cli": "ledger",
                    "data_dir": temp_data_dir,
                },
            )()
            app.state.parser = LedgerParser()
            app.state.validator = LedgerValidator(cli_path="ledger")
            app.state.agent = GullakAgent(
                ledger_path=temp_data_dir / "main.ledger",
                default_currency="INR",
                timezone="Asia/Kolkata",
                ledger_cli="ledger",
            )
            yield

        from fastapi import FastAPI

        from gullak.api import chat_router, ledger_router, setup_router, threads_router

        app = FastAPI(lifespan=test_lifespan)
        app.include_router(chat_router, prefix="/api")
        app.include_router(ledger_router, prefix="/api")
        app.include_router(setup_router, prefix="/api")
        app.include_router(threads_router, prefix="/api")

        @app.get("/health")
        async def health():
            return {"status": "healthy", "version": "2.0.0"}

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac


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
