"""CSV import processor."""

import csv
import hashlib
from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal
from pathlib import Path

from gullak.ledger.models import Transaction, Posting

from .templates import ImportTemplate, GenericTemplate, DebitCreditTemplate
from .banks import BANK_TEMPLATES


@dataclass
class ImportedTransaction:
    """A transaction imported from CSV."""

    date: date
    payee: str
    amount: Decimal
    currency: str = "INR"
    is_credit: bool = False
    note: str | None = None
    source_row: int = 0
    content_hash: str = ""
    is_duplicate: bool = False
    suggested_account: str = ""

    def __post_init__(self) -> None:
        if not self.content_hash:
            self.content_hash = self._compute_hash()

    def _compute_hash(self) -> str:
        """Compute hash for duplicate detection."""
        content = f"{self.date}|{self.payee}|{self.amount}|{self.currency}"
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def to_transaction(
        self,
        expense_account: str,
        payment_account: str,
    ) -> Transaction:
        """Convert to a Transaction object."""
        if self.is_credit:
            # Income transaction
            return Transaction(
                date=self.date,
                payee=self.payee,
                note=self.note,
                postings=[
                    Posting(account=payment_account, amount=self.amount, currency=self.currency),
                    Posting(account=expense_account, amount=-self.amount, currency=self.currency),
                ],
            )
        else:
            # Expense transaction
            return Transaction(
                date=self.date,
                payee=self.payee,
                note=self.note,
                postings=[
                    Posting(account=expense_account, amount=self.amount, currency=self.currency),
                    Posting(account=payment_account, amount=-self.amount, currency=self.currency),
                ],
            )


@dataclass
class ImportResult:
    """Result of CSV import."""

    transactions: list[ImportedTransaction] = field(default_factory=list)
    duplicates: list[ImportedTransaction] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    template_used: str = ""
    total_rows: int = 0
    skipped_rows: int = 0


class CSVProcessor:
    """Process CSV files and extract transactions."""

    # Built-in templates - bank templates first for priority, then generic
    TEMPLATES: list[ImportTemplate] = BANK_TEMPLATES + [
        GenericTemplate(),
        DebitCreditTemplate(),
    ]

    def __init__(self, existing_hashes: set[str] | None = None):
        """
        Initialize processor.

        Args:
            existing_hashes: Set of content hashes from existing transactions
        """
        self.existing_hashes = existing_hashes or set()

    def process_file(
        self,
        file_path: Path,
        template: ImportTemplate | None = None,
        default_account: str = "Expenses:Unknown",
        payment_account: str = "Assets:Bank",
    ) -> ImportResult:
        """
        Process a CSV file and extract transactions.

        Args:
            file_path: Path to CSV file
            template: Template to use (auto-detect if None)
            default_account: Default expense account
            payment_account: Payment source account

        Returns:
            ImportResult with transactions and metadata
        """
        result = ImportResult()

        try:
            with open(file_path, "r", encoding="utf-8-sig") as f:
                # Detect delimiter
                sample = f.read(4096)
                f.seek(0)

                dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
                reader = csv.DictReader(f, dialect=dialect)

                headers = list(reader.fieldnames or [])

                # Auto-detect template if not provided
                if template is None:
                    template = self._detect_template(headers)

                if template is None:
                    result.errors.append(f"Could not detect CSV format. Headers: {headers}")
                    return result

                result.template_used = template.name

                # Process rows
                for row_num, row in enumerate(reader, start=2):  # Start at 2 (1 = header)
                    result.total_rows += 1

                    parsed = template.parse_row(row)
                    if parsed is None:
                        result.skipped_rows += 1
                        continue

                    txn = ImportedTransaction(
                        date=parsed["date"],
                        payee=parsed["payee"],
                        amount=parsed["amount"],
                        currency=parsed.get("currency", "INR"),
                        is_credit=parsed.get("is_credit", False),
                        note=parsed.get("note"),
                        source_row=row_num,
                        suggested_account=default_account,
                    )

                    # Check for duplicates
                    if txn.content_hash in self.existing_hashes:
                        txn.is_duplicate = True
                        result.duplicates.append(txn)
                    else:
                        result.transactions.append(txn)
                        self.existing_hashes.add(txn.content_hash)

        except Exception as e:
            result.errors.append(f"Error processing file: {e}")

        return result

    def _detect_template(self, headers: list[str]) -> ImportTemplate | None:
        """Auto-detect the best template for given headers."""
        for template in self.TEMPLATES:
            if template.detect(headers):
                return template
        return None

    @staticmethod
    def get_existing_hashes(transactions: list[Transaction]) -> set[str]:
        """Compute content hashes for existing transactions."""
        hashes: set[str] = set()
        for txn in transactions:
            content = f"{txn.date}|{txn.payee}|{txn.total_amount}|{txn.postings[0].currency if txn.postings else 'INR'}"
            hashes.add(hashlib.sha256(content.encode()).hexdigest()[:16])
        return hashes
