"""Data models for ledger transactions."""

import re
from datetime import date
from decimal import Decimal
from enum import Enum
from typing import Self
from uuid import uuid4

from pydantic import BaseModel, Field, computed_field

# Characters that could inject ledger directives or comments
_UNSAFE_CHARS = re.compile(r"[\n\r\x00-\x08\x0b\x0c\x0e-\x1f]")


def _sanitize(value: str) -> str:
    """Strip newlines and control characters from text written into ledger format."""
    return _UNSAFE_CHARS.sub(" ", value).strip()


class TransactionStatus(str, Enum):
    """Transaction status in ledger format."""

    PENDING = "!"
    CLEARED = "*"
    UNCLEARED = ""


class Posting(BaseModel):
    """A single posting (line) within a transaction."""

    account: str  # e.g., "Expenses:Food:Groceries"
    amount: Decimal
    currency: str = "INR"

    def to_ledger(self) -> str:
        """Convert posting to ledger format."""
        # Format amount with 2 decimal places (no thousand separators - ledger doesn't support them)
        amount_str = f"{self.amount:.2f}"
        return f"    {_sanitize(self.account)}  {amount_str} {_sanitize(self.currency)}"


class TransactionSource(str, Enum):
    WEB = "web"
    WHATSAPP = "whatsapp"
    CSV = "csv"
    API = "api"


class Transaction(BaseModel):
    date: date
    payee: str
    postings: list[Posting]
    status: TransactionStatus = TransactionStatus.UNCLEARED
    note: str | None = None
    tags: dict[str, str] = Field(default_factory=dict)
    gullak_id: str = Field(default_factory=lambda: uuid4().hex[:8])
    source: TransactionSource | None = None
    source_user: str | None = None

    def to_ledger(self) -> str:
        status_char = f" {self.status.value}" if self.status.value else ""
        safe_payee = _sanitize(self.payee)
        header = f"{self.date.isoformat().replace('-', '/')}{status_char} {safe_payee}"

        lines = [header]

        lines.append(f"    ; gullak:id {self.gullak_id}")

        if self.source:
            lines.append(f"    ; gullak:source {self.source.value}")

        if self.source_user:
            lines.append(f"    ; gullak:user {_sanitize(self.source_user)}")

        if self.note:
            lines.append(f"    ; {_sanitize(self.note)}")

        for key, value in self.tags.items():
            lines.append(f"    ; {_sanitize(key)}: {_sanitize(value)}")

        for posting in self.postings:
            lines.append(posting.to_ledger())

        return "\n".join(lines)

    @classmethod
    def create_expense(
        cls,
        date: date,
        payee: str,
        amount: Decimal,
        expense_account: str,
        payment_account: str,
        currency: str = "INR",
        note: str | None = None,
        recurring_name: str | None = None,
        recurring_period: str | None = None,
        source: TransactionSource | None = None,
        source_user: str | None = None,
    ) -> Self:
        tags = {}
        if recurring_name:
            tags["Recurring"] = recurring_name
        if recurring_period:
            tags["Period"] = recurring_period

        return cls(
            date=date,
            payee=payee,
            note=note,
            tags=tags,
            source=source,
            source_user=source_user,
            postings=[
                Posting(account=expense_account, amount=amount, currency=currency),
                Posting(account=payment_account, amount=-amount, currency=currency),
            ],
        )

    @classmethod
    def create_income(
        cls,
        date: date,
        payee: str,
        amount: Decimal,
        income_account: str,
        deposit_account: str,
        currency: str = "INR",
        note: str | None = None,
        source: TransactionSource | None = None,
        source_user: str | None = None,
    ) -> Self:
        return cls(
            date=date,
            payee=payee,
            note=note,
            source=source,
            source_user=source_user,
            postings=[
                Posting(account=income_account, amount=-amount, currency=currency),
                Posting(account=deposit_account, amount=amount, currency=currency),
            ],
        )

    @computed_field
    @property
    def total_amount(self) -> Decimal:
        """Total positive amount (sum of positive postings)."""
        return sum(p.amount for p in self.postings if p.amount > 0)



class BudgetEntry(BaseModel):
    """A single budget category with target amount."""

    account: str
    amount: Decimal
    currency: str = "INR"


class PeriodicBudget(BaseModel):
    """Periodic transaction for Paisa budget tracking."""

    period: str = "Monthly"
    start_date: date = Field(default_factory=date.today)
    end_date: date | None = None
    entries: list[BudgetEntry] = Field(default_factory=list)
    funding_account: str = "Assets:Checking"

    def to_ledger(self) -> str:
        start = self.start_date.isoformat()
        if self.end_date:
            end = self.end_date.isoformat()
        else:
            year = self.start_date.year
            month = self.start_date.month + 2
            if month > 12:
                month -= 12
                year += 1
            end = date(year, month, 1).isoformat()

        lines = [f"~ {self.period} from {start} to {end}"]

        for entry in self.entries:
            lines.append(f"    {entry.account}  {entry.amount:.0f} {entry.currency}")

        lines.append(f"    {self.funding_account}")
        return "\n".join(lines)
