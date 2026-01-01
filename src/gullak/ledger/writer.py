import logging
import re
from decimal import Decimal
from pathlib import Path

import httpx

from .models import Posting, Transaction
from .validator import LedgerValidator

logger = logging.getLogger(__name__)


class LedgerWriter:
    def __init__(
        self,
        ledger_path: Path,
        validator: LedgerValidator | None = None,
        paisa_url: str | None = None,
    ):
        self.path = ledger_path
        self.validator = validator or LedgerValidator()
        self.paisa_url = paisa_url

    async def _sync_paisa(self) -> None:
        if not self.paisa_url:
            logger.debug("Paisa sync skipped - no paisa_url configured")
            return
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.post(
                    f"{self.paisa_url}/api/sync",
                    json={"journal": True, "prices": False, "portfolios": False},
                )
                result = response.json()
                if response.status_code == 200 and result.get("success"):
                    logger.info(f"Paisa sync successful: {result}")
                else:
                    logger.warning(
                        f"Paisa sync failed: status={response.status_code} response={result}"
                    )
        except httpx.RequestError as e:
            logger.warning(f"Could not sync with Paisa (not running?): {e}")

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

        self._append_to_file(ledger_text)
        await self._sync_paisa()
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
        await self._sync_paisa()
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
            cleaned = self._clean_empty_lines("\n".join(new_lines))
            self.path.write_text(cleaned)
            await self._sync_paisa()

        return found

    def _clean_empty_lines(self, content: str) -> str:
        """Remove excessive empty lines, keeping max 2 consecutive."""
        # Replace 3+ consecutive newlines with 2
        cleaned = re.sub(r"\n{3,}", "\n\n", content)
        # Ensure file ends with single newline
        return cleaned.rstrip() + "\n" if cleaned.strip() else ""

    async def update_transaction(self, gullak_id: str, updates: dict) -> Transaction | None:
        """
        Update a transaction by its gullak ID.

        Args:
            gullak_id: The gullak:id of the transaction to update
            updates: Dictionary with fields to update (payee, date, postings, note)

        Returns:
            Updated Transaction object, or None if not found
        """
        from .parser import LedgerParser

        content = self._read_file()
        if not content:
            return None

        # Parse existing transactions
        parser = LedgerParser()
        transactions = parser.parse_string(content)

        # Find transaction to update
        target_idx = None
        target_txn = None
        for i, txn in enumerate(transactions):
            if txn.gullak_id == gullak_id:
                target_idx = i
                target_txn = txn
                break

        if target_txn is None:
            return None

        # Apply updates to create new transaction
        updated_data = {
            "date": updates.get("date", target_txn.date),
            "payee": updates.get("payee", target_txn.payee),
            "status": target_txn.status,
            "note": updates.get("note", target_txn.note),
            "tags": target_txn.tags,
            "gullak_id": gullak_id,  # Keep same ID
        }

        # Handle postings update
        if "postings" in updates:
            updated_data["postings"] = updates["postings"]
        elif (
            "amount" in updates
            or "expense_account" in updates
            or "payment_account" in updates
            or "currency" in updates
        ):
            # Partial posting update - rebuild postings
            old_postings = target_txn.postings
            if len(old_postings) >= 2:
                expense_posting = old_postings[0]
                payment_posting = old_postings[1]

                new_amount = Decimal(str(updates.get("amount", expense_posting.amount)))
                new_currency = updates.get("currency", expense_posting.currency)
                new_expense_account = updates.get("expense_account", expense_posting.account)
                new_payment_account = updates.get("payment_account", payment_posting.account)

                updated_data["postings"] = [
                    Posting(account=new_expense_account, amount=new_amount, currency=new_currency),
                    Posting(account=new_payment_account, amount=-new_amount, currency=new_currency),
                ]
            else:
                updated_data["postings"] = old_postings
        else:
            updated_data["postings"] = target_txn.postings

        updated_txn = Transaction(**updated_data)

        # Rebuild file content
        transactions[target_idx] = updated_txn
        new_content = self._rebuild_ledger_content(content, transactions)

        # Validate new content
        is_valid, error = await self.validator.validate_content(new_content)
        if not is_valid:
            raise ValueError(f"Update would create invalid ledger: {error}")

        self.path.write_text(new_content)
        await self._sync_paisa()
        return updated_txn

    def _rebuild_ledger_content(
        self, original_content: str, transactions: list[Transaction]
    ) -> str:
        """Rebuild ledger content preserving non-transaction parts."""
        # Extract header comments (lines before first transaction)
        lines = original_content.split("\n")
        header_lines = []
        for line in lines:
            if re.match(r"^\d{4}[-/]\d{2}[-/]\d{2}", line):
                break
            header_lines.append(line)

        # Build new content
        parts = []
        if header_lines:
            parts.append("\n".join(header_lines).rstrip())

        for txn in transactions:
            parts.append(txn.to_ledger())

        return "\n\n".join(parts) + "\n"
