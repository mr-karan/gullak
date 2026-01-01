"""Data models for ledger transactions."""

from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Self
from uuid import uuid4

from pydantic import BaseModel, Field, computed_field


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
        # Format amount with 2 decimal places
        amount_str = f"{self.amount:,.2f}".replace(",", "_")
        return f"    {self.account}  {amount_str} {self.currency}"


class Transaction(BaseModel):
    """A complete ledger transaction with postings."""

    date: date
    payee: str
    postings: list[Posting]
    status: TransactionStatus = TransactionStatus.UNCLEARED
    note: str | None = None
    tags: dict[str, str] = Field(default_factory=dict)
    gullak_id: str = Field(default_factory=lambda: uuid4().hex[:8])

    def to_ledger(self) -> str:
        """Convert transaction to ledger format string."""
        # Header line: date [status] payee
        status_char = f" {self.status.value}" if self.status.value else ""
        header = f"{self.date.isoformat().replace('-', '/')}{status_char} {self.payee}"

        lines = [header]

        # Add gullak ID as comment
        lines.append(f"    ; gullak:id {self.gullak_id}")

        # Add optional note
        if self.note:
            lines.append(f"    ; {self.note}")

        # Add tags as comments
        for key, value in self.tags.items():
            lines.append(f"    ; {key}: {value}")

        # Add postings
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
    ) -> Self:
        """Create a simple expense transaction with two postings."""
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
    ) -> Self:
        """Create an income transaction (salary, interest, etc.)."""
        return cls(
            date=date,
            payee=payee,
            note=note,
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


class PendingTransaction(BaseModel):
    """A transaction awaiting user confirmation."""

    id: str
    transaction: Transaction
    source_text: str
    created_at: datetime = Field(default_factory=datetime.now)
    ledger_preview: str = ""

    def model_post_init(self, __context: object) -> None:
        if not self.ledger_preview:
            self.ledger_preview = self.transaction.to_ledger()


class BudgetEntry(BaseModel):
    """A single budget category with target amount."""

    account: str
    amount: Decimal
    currency: str = "INR"


class PeriodicBudget(BaseModel):
    """Periodic transaction for Paisa budget tracking."""

    period: str = "Monthly"
    start_date: date = Field(default_factory=date.today)
    entries: list[BudgetEntry] = Field(default_factory=list)
    funding_account: str = "Assets:Checking"

    def to_ledger(self) -> str:
        start = self.start_date.isoformat().replace("-", "/")
        lines = [f"~ {self.period} in {start}"]

        for entry in self.entries:
            amount_str = f"{entry.amount:,.2f}".replace(",", "_")
            lines.append(f"    {entry.account}  {amount_str} {entry.currency}")

        lines.append(f"    {self.funding_account}")
        return "\n".join(lines)
