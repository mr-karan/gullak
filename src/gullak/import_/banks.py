"""Indian bank statement templates."""

import contextlib
from datetime import datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from .templates import ImportTemplate


class HDFCSavingsTemplate(ImportTemplate):
    """HDFC Bank savings account statement template."""

    def __init__(self):
        self.name = "hdfc_savings"
        self.description = "HDFC Bank Savings Account Statement"
        # Common HDFC column names
        self.date_columns = ["Date", "Transaction Date", "Txn Date"]
        self.narration_columns = ["Narration", "Description", "Particulars"]
        self.debit_columns = ["Withdrawal Amt.", "Withdrawal", "Debit", "Debit Amount"]
        self.credit_columns = ["Deposit Amt.", "Deposit", "Credit", "Credit Amount"]
        self.balance_columns = ["Closing Balance", "Balance"]

    def detect(self, headers: list[str]) -> bool:
        """Detect HDFC format by column names."""
        headers_lower = [h.lower().strip() for h in headers]

        has_date = any(c.lower() in headers_lower for c in self.date_columns)
        has_narration = any(c.lower() in headers_lower for c in self.narration_columns)
        has_debit = any(c.lower() in headers_lower for c in self.debit_columns)

        # HDFC-specific: often has "Withdrawal Amt." and "Deposit Amt."
        hdfc_specific = (
            "withdrawal amt." in headers_lower
            or "deposit amt." in headers_lower
            or ("narration" in headers_lower and "closing balance" in headers_lower)
        )

        return has_date and has_narration and has_debit and hdfc_specific

    def parse_row(self, row: dict[str, Any]) -> dict | None:
        """Parse HDFC savings statement row."""
        try:
            # Find columns (case-insensitive)
            row_lower = {k.lower().strip(): v for k, v in row.items()}

            # Get date
            date_str = None
            for col in self.date_columns:
                if col.lower() in row_lower:
                    date_str = row_lower[col.lower()]
                    break

            if not date_str or not date_str.strip():
                return None

            # Get narration
            narration = ""
            for col in self.narration_columns:
                if col.lower() in row_lower:
                    narration = row_lower[col.lower()]
                    break

            # Get amounts
            debit = Decimal("0")
            credit = Decimal("0")

            for col in self.debit_columns:
                if col.lower() in row_lower:
                    val = row_lower[col.lower()]
                    if val and val.strip():
                        with contextlib.suppress(InvalidOperation):
                            debit = Decimal(val.replace(",", "").strip())
                    break

            for col in self.credit_columns:
                if col.lower() in row_lower:
                    val = row_lower[col.lower()]
                    if val and val.strip():
                        with contextlib.suppress(InvalidOperation):
                            credit = Decimal(val.replace(",", "").strip())
                    break

            if debit == 0 and credit == 0:
                return None

            # Parse date (HDFC uses DD/MM/YY or DD/MM/YYYY or DD-MM-YYYY)
            txn_date = None
            for fmt in ["%d/%m/%y", "%d/%m/%Y", "%d-%m-%Y", "%d-%m-%y", "%Y-%m-%d"]:
                try:
                    txn_date = datetime.strptime(date_str.strip(), fmt).date()
                    break
                except ValueError:
                    continue

            if txn_date is None:
                return None

            is_credit = credit > 0
            amount = credit if is_credit else debit

            return {
                "date": txn_date,
                "payee": narration.strip(),
                "amount": abs(amount),
                "is_credit": is_credit,
                "currency": "INR",
                "note": None,
            }
        except Exception:
            return None


class HDFCCreditCardTemplate(ImportTemplate):
    """HDFC Bank credit card statement template."""

    def __init__(self):
        self.name = "hdfc_credit_card"
        self.description = "HDFC Bank Credit Card Statement"

    def detect(self, headers: list[str]) -> bool:
        headers_lower = [h.lower().strip() for h in headers]
        # HDFC CC often has: Date, Transaction Description/Details, Amount
        return (
            "date" in headers_lower
            and any(
                c in headers_lower for c in ["transaction description", "description", "details"]
            )
            and "amount" in headers_lower
        )

    def parse_row(self, row: dict[str, Any]) -> dict | None:
        try:
            row_lower = {k.lower().strip(): v for k, v in row.items()}

            date_str = row_lower.get("date", "")
            description = (
                row_lower.get("transaction description")
                or row_lower.get("description")
                or row_lower.get("details")
                or ""
            )
            amount_str = row_lower.get("amount", "")

            if not date_str or not amount_str:
                return None

            # Parse date
            txn_date = None
            for fmt in ["%d/%m/%y", "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"]:
                try:
                    txn_date = datetime.strptime(date_str.strip(), fmt).date()
                    break
                except ValueError:
                    continue

            if txn_date is None:
                return None

            # Parse amount (negative = credit, positive = debit for CC)
            amount = Decimal(amount_str.replace(",", "").strip())
            is_credit = amount < 0  # Refunds/credits are negative

            return {
                "date": txn_date,
                "payee": description.strip(),
                "amount": abs(amount),
                "is_credit": is_credit,
                "currency": "INR",
                "note": None,
            }
        except Exception:
            return None


class ICICISavingsTemplate(ImportTemplate):
    """ICICI Bank savings account statement template."""

    def __init__(self):
        self.name = "icici_savings"
        self.description = "ICICI Bank Savings Account Statement"

    def detect(self, headers: list[str]) -> bool:
        headers_lower = [h.lower().strip() for h in headers]
        # ICICI: S No., Value Date, Transaction Date, Cheque Number, etc.
        icici_specific = (
            "value date" in headers_lower
            or "transaction remarks" in headers_lower
            or ("withdrawal amount" in headers_lower and "deposit amount" in headers_lower)
        )
        return icici_specific

    def parse_row(self, row: dict[str, Any]) -> dict | None:
        try:
            row_lower = {k.lower().strip(): v for k, v in row.items()}

            # Get date (prefer Transaction Date over Value Date)
            date_str = (
                row_lower.get("transaction date")
                or row_lower.get("value date")
                or row_lower.get("date")
                or ""
            )

            if not date_str or not date_str.strip():
                return None

            # Get description
            description = (
                row_lower.get("transaction remarks")
                or row_lower.get("remarks")
                or row_lower.get("particulars")
                or row_lower.get("description")
                or ""
            )

            # Get amounts
            withdrawal = (
                row_lower.get("withdrawal amount")
                or row_lower.get("withdrawal")
                or row_lower.get("debit")
                or ""
            )
            deposit = (
                row_lower.get("deposit amount")
                or row_lower.get("deposit")
                or row_lower.get("credit")
                or ""
            )

            debit = Decimal("0")
            credit = Decimal("0")

            if withdrawal and withdrawal.strip():
                with contextlib.suppress(InvalidOperation):
                    debit = Decimal(withdrawal.replace(",", "").strip())

            if deposit and deposit.strip():
                with contextlib.suppress(InvalidOperation):
                    credit = Decimal(deposit.replace(",", "").strip())

            if debit == 0 and credit == 0:
                return None

            # Parse date
            txn_date = None
            for fmt in ["%d-%m-%Y", "%d/%m/%Y", "%d-%m-%y", "%d/%m/%y", "%Y-%m-%d"]:
                try:
                    txn_date = datetime.strptime(date_str.strip(), fmt).date()
                    break
                except ValueError:
                    continue

            if txn_date is None:
                return None

            is_credit = credit > 0
            amount = credit if is_credit else debit

            return {
                "date": txn_date,
                "payee": description.strip(),
                "amount": abs(amount),
                "is_credit": is_credit,
                "currency": "INR",
                "note": None,
            }
        except Exception:
            return None


class SBITemplate(ImportTemplate):
    """State Bank of India statement template."""

    def __init__(self):
        self.name = "sbi"
        self.description = "State Bank of India Statement"

    def detect(self, headers: list[str]) -> bool:
        headers_lower = [h.lower().strip() for h in headers]
        # SBI: Txn Date, Value Date, Description, Ref No./Cheque No., etc.
        sbi_specific = (
            "txn date" in headers_lower
            or ("ref no./cheque no." in headers_lower)
            or (
                "debit" in headers_lower
                and "credit" in headers_lower
                and "balance" in headers_lower
            )
        )
        return sbi_specific

    def parse_row(self, row: dict[str, Any]) -> dict | None:
        try:
            row_lower = {k.lower().strip(): v for k, v in row.items()}

            date_str = (
                row_lower.get("txn date")
                or row_lower.get("value date")
                or row_lower.get("date")
                or ""
            )
            description = row_lower.get("description") or row_lower.get("particulars") or ""

            if not date_str or not date_str.strip():
                return None

            debit_str = row_lower.get("debit") or row_lower.get("withdrawal") or ""
            credit_str = row_lower.get("credit") or row_lower.get("deposit") or ""

            debit = Decimal("0")
            credit = Decimal("0")

            if debit_str and debit_str.strip():
                with contextlib.suppress(InvalidOperation):
                    debit = Decimal(debit_str.replace(",", "").strip())

            if credit_str and credit_str.strip():
                with contextlib.suppress(InvalidOperation):
                    credit = Decimal(credit_str.replace(",", "").strip())

            if debit == 0 and credit == 0:
                return None

            # Parse date
            txn_date = None
            for fmt in ["%d %b %Y", "%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"]:
                try:
                    txn_date = datetime.strptime(date_str.strip(), fmt).date()
                    break
                except ValueError:
                    continue

            if txn_date is None:
                return None

            is_credit = credit > 0
            amount = credit if is_credit else debit

            return {
                "date": txn_date,
                "payee": description.strip(),
                "amount": abs(amount),
                "is_credit": is_credit,
                "currency": "INR",
                "note": None,
            }
        except Exception:
            return None


class AxisBankTemplate(ImportTemplate):
    """Axis Bank statement template."""

    def __init__(self):
        self.name = "axis"
        self.description = "Axis Bank Statement"

    def detect(self, headers: list[str]) -> bool:
        headers_lower = [h.lower().strip() for h in headers]
        # Axis often has: Tran Date, CHQNO, PARTICULARS, DR, CR, BAL
        axis_specific = (
            "tran date" in headers_lower
            or ("dr" in headers_lower and "cr" in headers_lower)
            or "particulars" in headers_lower
        )
        return axis_specific

    def parse_row(self, row: dict[str, Any]) -> dict | None:
        try:
            row_lower = {k.lower().strip(): v for k, v in row.items()}

            date_str = (
                row_lower.get("tran date")
                or row_lower.get("date")
                or row_lower.get("transaction date")
                or ""
            )
            description = row_lower.get("particulars") or row_lower.get("description") or ""

            if not date_str or not date_str.strip():
                return None

            # Axis uses DR/CR or Debit/Credit
            debit_str = row_lower.get("dr") or row_lower.get("debit") or ""
            credit_str = row_lower.get("cr") or row_lower.get("credit") or ""

            debit = Decimal("0")
            credit = Decimal("0")

            if debit_str and debit_str.strip():
                with contextlib.suppress(InvalidOperation):
                    debit = Decimal(debit_str.replace(",", "").strip())

            if credit_str and credit_str.strip():
                with contextlib.suppress(InvalidOperation):
                    credit = Decimal(credit_str.replace(",", "").strip())

            if debit == 0 and credit == 0:
                return None

            # Parse date
            txn_date = None
            for fmt in ["%d-%m-%Y", "%d/%m/%Y", "%d-%m-%y", "%Y-%m-%d"]:
                try:
                    txn_date = datetime.strptime(date_str.strip(), fmt).date()
                    break
                except ValueError:
                    continue

            if txn_date is None:
                return None

            is_credit = credit > 0
            amount = credit if is_credit else debit

            return {
                "date": txn_date,
                "payee": description.strip(),
                "amount": abs(amount),
                "is_credit": is_credit,
                "currency": "INR",
                "note": None,
            }
        except Exception:
            return None


class KotakTemplate(ImportTemplate):
    """Kotak Mahindra Bank statement template."""

    def __init__(self):
        self.name = "kotak"
        self.description = "Kotak Mahindra Bank Statement"

    def detect(self, headers: list[str]) -> bool:
        headers_lower = [h.lower().strip() for h in headers]
        # Kotak often has similar columns to others
        return (
            "transaction date" in headers_lower
            and "description" in headers_lower
            and ("debit" in headers_lower or "withdrawal" in headers_lower)
        )

    def parse_row(self, row: dict[str, Any]) -> dict | None:
        try:
            row_lower = {k.lower().strip(): v for k, v in row.items()}

            date_str = row_lower.get("transaction date") or row_lower.get("date") or ""
            description = row_lower.get("description") or row_lower.get("particulars") or ""

            if not date_str or not date_str.strip():
                return None

            debit_str = row_lower.get("debit") or row_lower.get("withdrawal") or ""
            credit_str = row_lower.get("credit") or row_lower.get("deposit") or ""

            debit = Decimal("0")
            credit = Decimal("0")

            if debit_str and debit_str.strip():
                with contextlib.suppress(InvalidOperation):
                    debit = Decimal(debit_str.replace(",", "").strip())

            if credit_str and credit_str.strip():
                with contextlib.suppress(InvalidOperation):
                    credit = Decimal(credit_str.replace(",", "").strip())

            if debit == 0 and credit == 0:
                return None

            txn_date = None
            for fmt in ["%d-%m-%Y", "%d/%m/%Y", "%Y-%m-%d"]:
                try:
                    txn_date = datetime.strptime(date_str.strip(), fmt).date()
                    break
                except ValueError:
                    continue

            if txn_date is None:
                return None

            is_credit = credit > 0
            amount = credit if is_credit else debit

            return {
                "date": txn_date,
                "payee": description.strip(),
                "amount": abs(amount),
                "is_credit": is_credit,
                "currency": "INR",
                "note": None,
            }
        except Exception:
            return None


# All bank templates
BANK_TEMPLATES = [
    HDFCSavingsTemplate(),
    HDFCCreditCardTemplate(),
    ICICISavingsTemplate(),
    SBITemplate(),
    AxisBankTemplate(),
    KotakTemplate(),
]
