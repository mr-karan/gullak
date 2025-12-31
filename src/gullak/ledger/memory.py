"""Payee memory system for auto-categorization."""

import re
from pathlib import Path
from difflib import SequenceMatcher


class PayeeMemory:
    """
    Manage payee->account mappings stored in ledger comments.

    Format in ledger file:
    ; gullak:payee_map Swiggy=Expenses:Food:Delivery
    ; gullak:payee_map BigBasket=Expenses:Food:Groceries
    """

    PAYEE_MAP_PATTERN = re.compile(r";\s*gullak:payee_map\s+(.+?)=(.+)")

    def __init__(self, ledger_path: Path):
        self.path = ledger_path
        self._mappings: dict[str, str] = {}
        self._load_mappings()

    def _load_mappings(self) -> None:
        """Load payee mappings from ledger file."""
        if not self.path.exists():
            return

        content = self.path.read_text()
        for match in self.PAYEE_MAP_PATTERN.finditer(content):
            payee = match.group(1).strip().lower()
            account = match.group(2).strip()
            self._mappings[payee] = account

    def get_mapping(self, payee: str) -> str | None:
        """Get exact mapping for a payee."""
        return self._mappings.get(payee.lower().strip())

    def suggest_account(self, payee: str, threshold: float = 0.7) -> str | None:
        """
        Suggest an account using fuzzy matching.

        Args:
            payee: The payee name to match
            threshold: Minimum similarity ratio (0-1)

        Returns:
            Suggested account or None
        """
        payee_lower = payee.lower().strip()

        # Try exact match first
        if payee_lower in self._mappings:
            return self._mappings[payee_lower]

        # Try fuzzy matching
        best_match = None
        best_ratio = threshold

        for known_payee, account in self._mappings.items():
            # Check if payee contains known payee or vice versa
            if known_payee in payee_lower or payee_lower in known_payee:
                return account

            # Use sequence matcher for similarity
            ratio = SequenceMatcher(None, payee_lower, known_payee).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = account

        return best_match

    def add_mapping(self, payee: str, account: str) -> None:
        """
        Add a new payee mapping and persist to ledger.

        Args:
            payee: Payee name
            account: Account path (e.g., Expenses:Food:Delivery)
        """
        payee_lower = payee.lower().strip()

        # Already exists with same value
        if self._mappings.get(payee_lower) == account:
            return

        # Update in-memory mapping
        self._mappings[payee_lower] = account

        # Persist to file
        self._save_mapping(payee, account)

    def _save_mapping(self, payee: str, account: str) -> None:
        """Append mapping to ledger file."""
        if not self.path.exists():
            return

        content = self.path.read_text()

        # Check if mapping already exists and update it
        payee_escaped = re.escape(payee.lower().strip())
        pattern = re.compile(rf";\s*gullak:payee_map\s+{payee_escaped}=.+", re.IGNORECASE)

        new_line = f"; gullak:payee_map {payee}={account}"

        if pattern.search(content):
            # Update existing mapping
            content = pattern.sub(new_line, content)
            self.path.write_text(content)
        else:
            # Append new mapping at the top (after header comments)
            lines = content.split("\n")
            insert_idx = 0

            # Find position after initial comments
            for i, line in enumerate(lines):
                if line.strip() and not line.strip().startswith(";"):
                    insert_idx = i
                    break
                insert_idx = i + 1

            lines.insert(insert_idx, new_line)
            self.path.write_text("\n".join(lines))

    def get_all_mappings(self) -> dict[str, str]:
        """Get all payee mappings."""
        return dict(self._mappings)

    def remove_mapping(self, payee: str) -> bool:
        """Remove a payee mapping."""
        payee_lower = payee.lower().strip()

        if payee_lower not in self._mappings:
            return False

        del self._mappings[payee_lower]

        # Remove from file
        if self.path.exists():
            content = self.path.read_text()
            payee_escaped = re.escape(payee_lower)
            pattern = re.compile(rf";\s*gullak:payee_map\s+{payee_escaped}=.+\n?", re.IGNORECASE)
            content = pattern.sub("", content)
            self.path.write_text(content)

        return True
