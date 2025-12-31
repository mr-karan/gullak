"""Writer for ledger-cli format files."""

import asyncio
from pathlib import Path

from .models import Transaction
from .validator import LedgerValidator


class LedgerWriter:
    """Write transactions to ledger files."""

    def __init__(
        self,
        ledger_path: Path,
        validator: LedgerValidator | None = None,
    ):
        self.path = ledger_path
        self.validator = validator or LedgerValidator()

    async def append_transaction(self, txn: Transaction, validate: bool = True) -> bool:
        """
        Append a transaction to the ledger file.

        Args:
            txn: Transaction to append
            validate: Whether to validate with ledger-cli before writing

        Returns:
            True if successful

        Raises:
            ValueError: If transaction would create invalid ledger
            IOError: If file write fails
        """
        ledger_text = txn.to_ledger()

        if validate:
            # Read current content
            current_content = self._read_file()

            # Create temp content with new transaction
            if current_content:
                temp_content = current_content.rstrip() + "\n\n" + ledger_text + "\n"
            else:
                temp_content = ledger_text + "\n"

            # Validate
            is_valid, error = await self.validator.validate_content(temp_content)
            if not is_valid:
                raise ValueError(f"Transaction would create invalid ledger: {error}")

        # Append to file
        self._append_to_file(ledger_text)
        return True

    async def append_transactions(
        self, transactions: list[Transaction], validate: bool = True
    ) -> int:
        """
        Append multiple transactions to the ledger file.

        Returns:
            Number of transactions written
        """
        if not transactions:
            return 0

        # Build combined ledger text
        ledger_text = "\n\n".join(txn.to_ledger() for txn in transactions)

        if validate:
            current_content = self._read_file()
            if current_content:
                temp_content = current_content.rstrip() + "\n\n" + ledger_text + "\n"
            else:
                temp_content = ledger_text + "\n"

            is_valid, error = await self.validator.validate_content(temp_content)
            if not is_valid:
                raise ValueError(f"Transactions would create invalid ledger: {error}")

        self._append_to_file(ledger_text)
        return len(transactions)

    def _read_file(self) -> str:
        """Read current ledger file content."""
        if self.path.exists():
            return self.path.read_text()
        return ""

    def _append_to_file(self, content: str) -> None:
        """Append content to ledger file."""
        # Ensure parent directory exists
        self.path.parent.mkdir(parents=True, exist_ok=True)

        # Check if file exists and has content
        needs_separator = self.path.exists() and self.path.stat().st_size > 0

        with open(self.path, "a") as f:
            if needs_separator:
                f.write("\n\n")
            f.write(content)
            f.write("\n")

    async def delete_transaction(self, gullak_id: str) -> bool:
        """
        Delete a transaction by its gullak ID.

        This reads the entire file, removes the transaction, and rewrites.

        Returns:
            True if transaction was found and deleted
        """
        content = self._read_file()
        if not content:
            return False

        # Find and remove the transaction block
        lines = content.split("\n")
        new_lines: list[str] = []
        skip_until_empty = False
        found = False

        for line in lines:
            # Check if this transaction should be skipped
            if f"gullak:id {gullak_id}" in line:
                skip_until_empty = True
                found = True
                # Also remove the header line (previous non-empty line)
                while new_lines and new_lines[-1].strip():
                    new_lines.pop()
                continue

            if skip_until_empty:
                if not line.strip():
                    skip_until_empty = False
                continue

            new_lines.append(line)

        if found:
            # Clean up multiple consecutive empty lines
            cleaned = self._clean_empty_lines("\n".join(new_lines))
            self.path.write_text(cleaned)

        return found

    def _clean_empty_lines(self, content: str) -> str:
        """Remove excessive empty lines, keeping max 2 consecutive."""
        import re

        # Replace 3+ consecutive newlines with 2
        cleaned = re.sub(r"\n{3,}", "\n\n", content)
        # Ensure file ends with single newline
        return cleaned.rstrip() + "\n" if cleaned.strip() else ""
