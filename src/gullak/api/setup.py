"""Setup/onboarding API endpoints."""

from enum import Enum
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/setup", tags=["setup"])


class SetupStep(str, Enum):
    """Setup wizard steps."""
    WELCOME = "welcome"
    CURRENCY = "currency"
    ACCOUNTS = "accounts"
    CATEGORIES = "categories"
    COMPLETE = "complete"


class SetupStatus(BaseModel):
    """Current setup status."""
    is_complete: bool
    current_step: SetupStep
    preferences: dict[str, Any]


class SetupPreferences(BaseModel):
    """User preferences from setup."""
    currency: str = "INR"
    timezone: str = "Asia/Kolkata"
    bank_accounts: list[str] = []
    credit_cards: list[str] = []
    income_sources: list[str] = []


class SetupStepRequest(BaseModel):
    """Request to update setup step."""
    step: SetupStep
    data: dict[str, Any] = {}


class SetupStepResponse(BaseModel):
    """Response for setup step."""
    success: bool
    next_step: SetupStep | None
    message: str


# Default account templates
DEFAULT_EXPENSE_ACCOUNTS = [
    "Expenses:Food:Groceries",
    "Expenses:Food:Restaurants",
    "Expenses:Food:Delivery",
    "Expenses:Transport:Fuel",
    "Expenses:Transport:Rides",
    "Expenses:Transport:PublicTransit",
    "Expenses:Housing:Rent",
    "Expenses:Housing:Utilities",
    "Expenses:Entertainment:Subscriptions",
    "Expenses:Entertainment:Movies",
    "Expenses:Shopping",
    "Expenses:Health",
]

CURRENCY_OPTIONS = [
    {"code": "INR", "name": "Indian Rupee", "symbol": "₹"},
    {"code": "USD", "name": "US Dollar", "symbol": "$"},
    {"code": "EUR", "name": "Euro", "symbol": "€"},
    {"code": "GBP", "name": "British Pound", "symbol": "£"},
]

TIMEZONE_OPTIONS = [
    {"value": "Asia/Kolkata", "label": "India (IST)"},
    {"value": "America/New_York", "label": "US Eastern"},
    {"value": "America/Los_Angeles", "label": "US Pacific"},
    {"value": "Europe/London", "label": "UK"},
    {"value": "UTC", "label": "UTC"},
]


def _check_setup_complete(ledger_path: Path) -> bool:
    """Check if setup has been completed."""
    if not ledger_path.exists():
        return False

    content = ledger_path.read_text()
    return "; gullak:setup_complete" in content


def _get_preferences_from_ledger(ledger_path: Path) -> dict[str, Any]:
    """Extract preferences from ledger comments."""
    preferences: dict[str, Any] = {
        "currency": "INR",
        "timezone": "Asia/Kolkata",
        "bank_accounts": [],
        "credit_cards": [],
        "expense_categories": [],
        "income_sources": [],
        "asset_accounts": [],
    }

    if not ledger_path.exists():
        return preferences

    content = ledger_path.read_text()

    for line in content.split("\n"):
        line = line.strip()
        if line.startswith("; gullak:currency "):
            # Line format: "; gullak:currency INR" -> split()[-1] = "INR"
            preferences["currency"] = line.split()[-1]
        elif line.startswith("; gullak:timezone "):
            # Line format: "; gullak:timezone Asia/Kolkata"
            preferences["timezone"] = line.split()[-1]
        elif line.startswith("account Assets:Bank:"):
            account = line.replace("account ", "").strip()
            bank_name = account.split(":")[-1]
            if bank_name not in preferences["bank_accounts"]:
                preferences["bank_accounts"].append(bank_name)
        elif line.startswith("account Assets:Cash"):
            if "Cash" not in preferences["asset_accounts"]:
                preferences["asset_accounts"].append("Cash")
        elif line.startswith("account Liabilities:CreditCard:"):
            account = line.replace("account ", "").strip()
            card_name = account.split(":")[-1]
            if card_name not in preferences["credit_cards"]:
                preferences["credit_cards"].append(card_name)
        elif line.startswith("account Expenses:"):
            account = line.replace("account ", "").strip()
            if account not in preferences["expense_categories"]:
                preferences["expense_categories"].append(account)
        elif line.startswith("account Income:"):
            account = line.replace("account ", "").strip()
            source = account.replace("Income:", "")
            if source not in preferences["income_sources"]:
                preferences["income_sources"].append(source)

    return preferences


@router.get("/status")
async def get_setup_status(request: Request) -> SetupStatus:
    """Get current setup status."""
    settings = request.app.state.settings
    ledger_path = settings.ledger_path

    is_complete = _check_setup_complete(ledger_path)
    preferences = _get_preferences_from_ledger(ledger_path)

    # Determine current step based on what's been set up
    if is_complete:
        current_step = SetupStep.COMPLETE
    elif not ledger_path.exists():
        current_step = SetupStep.WELCOME
    elif not preferences.get("bank_accounts"):
        current_step = SetupStep.ACCOUNTS
    else:
        current_step = SetupStep.CATEGORIES

    return SetupStatus(
        is_complete=is_complete,
        current_step=current_step,
        preferences=preferences,
    )


@router.get("/options")
async def get_setup_options() -> dict[str, Any]:
    """Get available options for setup (currencies, timezones, etc.)."""
    return {
        "currencies": CURRENCY_OPTIONS,
        "timezones": TIMEZONE_OPTIONS,
        "default_expense_accounts": DEFAULT_EXPENSE_ACCOUNTS,
        "suggested_banks": ["HDFC", "ICICI", "SBI", "Axis", "Kotak"],
        "suggested_cards": ["HDFC", "ICICI", "Axis", "SBI", "Amex"],
    }


@router.post("/step")
async def update_setup_step(request: Request, body: SetupStepRequest) -> SetupStepResponse:
    """Update a setup step with user data."""
    settings = request.app.state.settings
    ledger_path = settings.ledger_path

    # Ensure data directory exists
    ledger_path.parent.mkdir(parents=True, exist_ok=True)

    if body.step == SetupStep.WELCOME:
        # Create initial ledger file with header
        currency = body.data.get("currency", "INR")
        timezone = body.data.get("timezone", "Asia/Kolkata")

        header = f"""; Gullak Ledger File
; gullak:version 2.0
; gullak:currency {currency}
; gullak:timezone {timezone}

"""
        ledger_path.write_text(header)

        return SetupStepResponse(
            success=True,
            next_step=SetupStep.ACCOUNTS,
            message="Great! Now let's set up your accounts.",
        )

    elif body.step == SetupStep.ACCOUNTS:
        # Add bank accounts and credit cards
        bank_accounts = body.data.get("bank_accounts", [])
        credit_cards = body.data.get("credit_cards", [])

        content = ledger_path.read_text() if ledger_path.exists() else ""

        # Check what already exists
        existing_banks = set()
        existing_cards = set()
        for line in content.split("\n"):
            if line.startswith("account Assets:Bank:"):
                existing_banks.add(line.split(":")[-1].strip())
            elif line.startswith("account Liabilities:CreditCard:"):
                existing_cards.add(line.split(":")[-1].strip())

        # Only add new accounts that don't exist
        new_accounts = []

        # Add Assets:Cash if not present
        if "account Assets:Cash" not in content:
            new_accounts.append("account Assets:Cash")

        for bank in bank_accounts:
            if bank not in existing_banks:
                new_accounts.append(f"account Assets:Bank:{bank}")

        for card in credit_cards:
            if card not in existing_cards:
                new_accounts.append(f"account Liabilities:CreditCard:{card}")

        # Add income accounts if this is first-time setup
        if "account Income:Salary" not in content:
            new_accounts.extend([
                "account Income:Salary",
                "account Income:Freelance",
                "account Income:Interest",
            ])

        if new_accounts:
            accounts_section = "\n" + "\n".join(new_accounts) + "\n"
            ledger_path.write_text(content + accounts_section)

        # Check if setup is already complete (settings mode)
        is_complete = _check_setup_complete(ledger_path)

        return SetupStepResponse(
            success=True,
            next_step=None if is_complete else SetupStep.CATEGORIES,
            message="Accounts updated!" if is_complete else "Accounts added! Now let's set up expense categories.",
        )

    elif body.step == SetupStep.CATEGORIES:
        # Add expense categories
        categories = body.data.get("categories", DEFAULT_EXPENSE_ACCOUNTS)

        content = ledger_path.read_text() if ledger_path.exists() else ""

        categories_section = "\n; Expense Categories\n"
        for cat in categories:
            categories_section += f"account {cat}\n"

        ledger_path.write_text(content + categories_section)

        return SetupStepResponse(
            success=True,
            next_step=SetupStep.COMPLETE,
            message="Categories set up! You're all ready to start tracking expenses.",
        )

    elif body.step == SetupStep.COMPLETE:
        # Mark setup as complete
        content = ledger_path.read_text() if ledger_path.exists() else ""

        if "; gullak:setup_complete" not in content:
            content += "\n; gullak:setup_complete\n"
            ledger_path.write_text(content)

        return SetupStepResponse(
            success=True,
            next_step=None,
            message="Setup complete! Start chatting to track your expenses.",
        )

    return SetupStepResponse(
        success=False,
        next_step=None,
        message="Unknown setup step",
    )


@router.post("/skip")
async def skip_setup(request: Request) -> SetupStepResponse:
    """Skip setup and use defaults."""
    settings = request.app.state.settings
    ledger_path = settings.ledger_path

    # Create a minimal ledger file with defaults
    default_ledger = """; Gullak Ledger File
; gullak:version 2.0
; gullak:currency INR
; gullak:timezone Asia/Kolkata
; gullak:setup_complete

; Default Accounts
account Assets:Cash
account Assets:Bank:Default
account Liabilities:CreditCard:Default
account Income:Salary

; Expense Categories
account Expenses:Food:Groceries
account Expenses:Food:Restaurants
account Expenses:Food:Delivery
account Expenses:Transport:Fuel
account Expenses:Transport:Rides
account Expenses:Housing:Rent
account Expenses:Housing:Utilities
account Expenses:Entertainment:Subscriptions
account Expenses:Shopping
account Expenses:Health

"""

    ledger_path.parent.mkdir(parents=True, exist_ok=True)
    ledger_path.write_text(default_ledger)

    return SetupStepResponse(
        success=True,
        next_step=None,
        message="Using default settings. You can always add more accounts later!",
    )
