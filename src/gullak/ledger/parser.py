"""Parser for ledger-cli format files."""

import re
from datetime import date
from decimal import Decimal, InvalidOperation
from pathlib import Path

from .models import Posting, Transaction, TransactionStatus


class LedgerParser:
    """Parse ledger-format files into Transaction objects."""

    # Match transaction header: 2024/01/15 [*!] Payee name
    DATE_PATTERN = re.compile(
        r"^(\d{4}[-/]\d{2}[-/]\d{2})\s*([*!])?\s*(.+?)(?:\s*;\s*(.*))?$"
    )

    # Match posting: account  amount [currency]
    POSTING_PATTERN = re.compile(
        r"^\s{2,}([A-Za-z][^\d]*?)\s{2,}([-\d,_.]+)\s*(\w+)?(?:\s*;.*)?$"
    )

    # Match comment line
    COMMENT_PATTERN = re.compile(r"^\s*;\s*(.*)$")

    # Match gullak ID in comment
    GULLAK_ID_PATTERN = re.compile(r"gullak:id\s+(\w+)")

    # Match tag in comment: key: value
    TAG_PATTERN = re.compile(r"^(\w+):\s*(.+)$")

    def parse_file(self, path: Path) -> list[Transaction]:
        """Parse a ledger file and return list of transactions."""
        if not path.exists():
            return []

        content = path.read_text()
        return self.parse_string(content)

    def parse_string(self, content: str) -> list[Transaction]:
        """Parse ledger content string into transactions."""
        transactions: list[Transaction] = []
        current_txn: dict | None = None
        current_comments: list[str] = []

        for line in content.split("\n"):
            # Skip empty lines
            if not line.strip():
                if current_txn is not None:
                    # End of transaction
                    txn = self._build_transaction(current_txn, current_comments)
                    if txn:
                        transactions.append(txn)
                    current_txn = None
                    current_comments = []
                continue

            # Check for transaction header
            if match := self.DATE_PATTERN.match(line):
                # Save previous transaction
                if current_txn is not None:
                    txn = self._build_transaction(current_txn, current_comments)
                    if txn:
                        transactions.append(txn)

                # Start new transaction
                current_txn = {
                    "date": self._parse_date(match.group(1)),
                    "status": self._parse_status(match.group(2)),
                    "payee": match.group(3).strip(),
                    "postings": [],
                }
                current_comments = []
                continue

            # Check for posting
            if current_txn is not None and (match := self.POSTING_PATTERN.match(line)):
                posting = self._parse_posting(match)
                if posting:
                    current_txn["postings"].append(posting)
                continue

            # Check for comment within transaction
            if current_txn is not None and (match := self.COMMENT_PATTERN.match(line)):
                current_comments.append(match.group(1))

        # Handle last transaction
        if current_txn is not None:
            txn = self._build_transaction(current_txn, current_comments)
            if txn:
                transactions.append(txn)

        return transactions

    def extract_accounts(self, path: Path) -> set[str]:
        """Extract unique account names from ledger file."""
        accounts: set[str] = set()
        for txn in self.parse_file(path):
            for posting in txn.postings:
                accounts.add(posting.account)
                # Also add parent accounts
                parts = posting.account.split(":")
                for i in range(1, len(parts)):
                    accounts.add(":".join(parts[:i]))
        return accounts

    def extract_payees(self, path: Path) -> set[str]:
        """Extract unique payee names from ledger file."""
        return {txn.payee for txn in self.parse_file(path)}

    def _parse_date(self, date_str: str) -> date:
        """Parse date string (YYYY/MM/DD or YYYY-MM-DD)."""
        normalized = date_str.replace("/", "-")
        return date.fromisoformat(normalized)

    def _parse_status(self, status_char: str | None) -> TransactionStatus:
        """Parse status character to enum."""
        if status_char == "*":
            return TransactionStatus.CLEARED
        elif status_char == "!":
            return TransactionStatus.PENDING
        return TransactionStatus.UNCLEARED

    def _parse_posting(self, match: re.Match) -> Posting | None:
        """Parse posting from regex match."""
        account = match.group(1).strip()
        amount_str = match.group(2).replace(",", "").replace("_", "")
        currency = match.group(3) or "INR"

        try:
            amount = Decimal(amount_str)
        except InvalidOperation:
            return None

        return Posting(account=account, amount=amount, currency=currency)

    def _build_transaction(
        self, data: dict, comments: list[str]
    ) -> Transaction | None:
        """Build Transaction object from parsed data and comments."""
        if not data.get("postings"):
            return None

        # Extract gullak ID from comments
        gullak_id = None
        note = None
        tags: dict[str, str] = {}

        for comment in comments:
            # Check for gullak ID
            if match := self.GULLAK_ID_PATTERN.search(comment):
                gullak_id = match.group(1)
                continue

            # Check for tag
            if match := self.TAG_PATTERN.match(comment):
                key, value = match.groups()
                if key != "gullak":  # Skip gullak meta tags
                    tags[key] = value
                continue

            # Otherwise treat as note
            if note is None:
                note = comment

        txn_data = {
            "date": data["date"],
            "payee": data["payee"],
            "status": data["status"],
            "postings": data["postings"],
            "note": note,
            "tags": tags,
        }

        if gullak_id:
            txn_data["gullak_id"] = gullak_id

        return Transaction(**txn_data)
