"""Import templates for different CSV formats."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import Any


@dataclass
class ImportTemplate(ABC):
    """Base class for import templates."""

    name: str
    description: str

    @abstractmethod
    def parse_row(self, row: dict[str, Any]) -> dict | None:
        """
        Parse a CSV row into transaction data.

        Returns dict with: date, payee, amount, currency, note
        Returns None to skip the row.
        """
        pass

    @abstractmethod
    def detect(self, headers: list[str]) -> bool:
        """Check if this template matches the CSV headers."""
        pass


class GenericTemplate(ImportTemplate):
    """Generic CSV template with configurable column names."""

    def __init__(
        self,
        date_column: str = "Date",
        description_column: str = "Description",
        amount_column: str = "Amount",
        date_format: str = "%Y-%m-%d",
        currency: str = "INR",
    ):
        self.name = "generic"
        self.description = "Generic CSV with Date, Description, Amount columns"
        self.date_column = date_column
        self.description_column = description_column
        self.amount_column = amount_column
        self.date_format = date_format
        self.currency = currency

    def detect(self, headers: list[str]) -> bool:
        """Check if headers match expected columns."""
        headers_lower = [h.lower() for h in headers]
        return (
            self.date_column.lower() in headers_lower
            and self.description_column.lower() in headers_lower
            and self.amount_column.lower() in headers_lower
        )

    def parse_row(self, row: dict[str, Any]) -> dict | None:
        """Parse a generic CSV row."""
        try:
            # Get values (case-insensitive)
            row_lower = {k.lower(): v for k, v in row.items()}

            date_str = row_lower.get(self.date_column.lower(), "")
            description = row_lower.get(self.description_column.lower(), "")
            amount_str = row_lower.get(self.amount_column.lower(), "")

            if not date_str or not amount_str:
                return None

            # Parse date
            txn_date: date
            try:
                txn_date = datetime.strptime(date_str.strip(), self.date_format).date()
            except ValueError:
                # Try common formats
                for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%Y/%m/%d"]:
                    try:
                        txn_date = datetime.strptime(date_str.strip(), fmt).date()
                        break
                    except ValueError:
                        continue
                else:
                    return None

            # Parse amount
            amount_str = amount_str.replace(",", "").replace("\u20b9", "").replace("$", "").strip()
            amount = Decimal(amount_str)

            return {
                "date": txn_date,
                "payee": description.strip(),
                "amount": abs(amount),  # Always positive
                "is_credit": amount > 0,  # Positive = credit/income
                "currency": self.currency,
                "note": None,
            }
        except Exception:
            return None


class DebitCreditTemplate(ImportTemplate):
    """Template for CSVs with separate Debit/Credit columns."""

    def __init__(
        self,
        date_column: str = "Date",
        description_column: str = "Description",
        debit_column: str = "Debit",
        credit_column: str = "Credit",
        date_format: str = "%d/%m/%Y",
        currency: str = "INR",
    ):
        self.name = "debit_credit"
        self.description = "CSV with separate Debit and Credit columns"
        self.date_column = date_column
        self.description_column = description_column
        self.debit_column = debit_column
        self.credit_column = credit_column
        self.date_format = date_format
        self.currency = currency

    def detect(self, headers: list[str]) -> bool:
        headers_lower = [h.lower() for h in headers]
        return (
            self.date_column.lower() in headers_lower
            and self.debit_column.lower() in headers_lower
            and self.credit_column.lower() in headers_lower
        )

    def parse_row(self, row: dict[str, Any]) -> dict | None:
        try:
            row_lower = {k.lower(): v for k, v in row.items()}

            date_str = row_lower.get(self.date_column.lower(), "")
            description = row_lower.get(self.description_column.lower(), "")
            debit_str = row_lower.get(self.debit_column.lower(), "")
            credit_str = row_lower.get(self.credit_column.lower(), "")

            if not date_str:
                return None

            # Parse date
            txn_date: date
            try:
                txn_date = datetime.strptime(date_str.strip(), self.date_format).date()
            except ValueError:
                for fmt in ["%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"]:
                    try:
                        txn_date = datetime.strptime(date_str.strip(), fmt).date()
                        break
                    except ValueError:
                        continue
                else:
                    return None

            # Parse amounts
            debit = Decimal(debit_str.replace(",", "").strip() or "0")
            credit = Decimal(credit_str.replace(",", "").strip() or "0")

            if debit == 0 and credit == 0:
                return None

            is_credit = credit > 0
            amount = credit if is_credit else debit

            return {
                "date": txn_date,
                "payee": description.strip(),
                "amount": abs(amount),
                "is_credit": is_credit,
                "currency": self.currency,
                "note": None,
            }
        except Exception:
            return None
