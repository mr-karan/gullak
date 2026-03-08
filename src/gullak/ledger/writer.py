import asyncio
import logging
import re
from decimal import Decimal
from pathlib import Path

import httpx

from .models import Posting, Transaction
from .validator import LedgerValidator

logger = logging.getLogger(__name__)

# Characters that could inject ledger directives or comments when embedded in text fields
_UNSAFE_CHARS = re.compile(r"[\n\r\x00-\x08\x0b\x0c\x0e-\x1f]")


def _sanitize_ledger_text(value: str | None) -> str | None:
    """Strip newlines and control characters from text that will be written into the ledger.

    Prevents injection of extra postings, comments, or directives via payee/note/tag values.
    """
    if value is None:
        return None
    return _UNSAFE_CHARS.sub(" ", value).strip()


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
        self._write_lock = asyncio.Lock()

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

    async def _validate_and_append(
        self, ledger_text: str, validate: bool, error_prefix: str = "Content"
    ) -> None:
        """Common logic for validating and appending content.

        All writes are serialized through _write_lock to prevent races
        between concurrent confirm/cancel/budget/undo operations.
        """
        async with self._write_lock:
            if validate:
                current_content = self._read_file()
                if current_content:
                    temp_content = current_content.rstrip() + "\n\n" + ledger_text + "\n"
                else:
                    temp_content = ledger_text + "\n"

                is_valid, error = await self.validator.validate_content(temp_content)
                if not is_valid:
                    raise ValueError(f"{error_prefix} would create invalid ledger: {error}")

            self._append_to_file(ledger_text)
        await self._sync_paisa()

    async def append_transaction(self, txn: Transaction, validate: bool = True) -> bool:
        """Append a transaction to the ledger file."""
        ledger_text = txn.to_ledger()
        current_content = self._read_file()

        if txn.gullak_id and f"gullak:id {txn.gullak_id}" in current_content:
            raise ValueError(f"Transaction {txn.gullak_id} already exists in ledger")

        await self._validate_and_append(ledger_text, validate, "Transaction")
        return True

    async def append_transactions(
        self, transactions: list[Transaction], validate: bool = True
    ) -> int:
        """Append multiple transactions to the ledger file."""
        if not transactions:
            return 0

        ledger_text = "\n\n".join(txn.to_ledger() for txn in transactions)
        await self._validate_and_append(ledger_text, validate, "Transactions")
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

        Uses span-based removal: finds the exact line range of the transaction
        block (header line through last non-empty line containing gullak:id)
        and removes only those lines, preserving all surrounding content.

        Returns:
            True if transaction was found and deleted
        """
        async with self._write_lock:
            content = self._read_file()
            if not content:
                return False

            lines = content.split("\n")
            txn_start, txn_end = self._find_transaction_span(lines, gullak_id)

            if txn_start is None:
                return False

            new_lines = lines[:txn_start] + lines[txn_end:]
            cleaned = self._clean_empty_lines("\n".join(new_lines))
            self.path.write_text(cleaned)
        await self._sync_paisa()
        return True

    @staticmethod
    def _find_transaction_span(lines: list[str], gullak_id: str) -> tuple[int | None, int | None]:
        """Find the start and end line indices for a transaction block.

        Returns (start, end) where lines[start:end] is the full transaction.
        Returns (None, None) if not found.
        """
        marker = f"gullak:id {gullak_id}"
        marker_line = None

        for i, line in enumerate(lines):
            if marker in line:
                marker_line = i
                break

        if marker_line is None:
            return None, None

        # Walk backwards from the marker to find the transaction header (date line)
        txn_start = marker_line
        for i in range(marker_line - 1, -1, -1):
            line = lines[i]
            if not line.strip():
                break
            if re.match(r"^\d{4}[-/]\d{2}[-/]\d{2}", line):
                txn_start = i
                break

        # Walk forwards from the marker to find the end of the transaction block
        txn_end = marker_line + 1
        for i in range(marker_line + 1, len(lines)):
            if not lines[i].strip():
                txn_end = i
                break
            txn_end = i + 1

        return txn_start, txn_end

    def _clean_empty_lines(self, content: str) -> str:
        """Remove excessive empty lines, keeping max 2 consecutive."""
        # Replace 3+ consecutive newlines with 2
        cleaned = re.sub(r"\n{3,}", "\n\n", content)
        # Ensure file ends with single newline
        return cleaned.rstrip() + "\n" if cleaned.strip() else ""

    async def update_transaction(self, gullak_id: str, updates: dict) -> Transaction | None:
        """
        Update a transaction by its gullak ID using span-based editing.

        Finds the exact line range of the target transaction, parses only that
        block, applies updates, and replaces just those lines — preserving all
        other content (comments, directives, price entries) in the file.

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

        lines = content.split("\n")
        txn_start, txn_end = self._find_transaction_span(lines, gullak_id)

        if txn_start is None:
            return None

        # Parse only the target transaction block
        block_text = "\n".join(lines[txn_start:txn_end])
        parser = LedgerParser()
        parsed = parser.parse_string(block_text)
        if not parsed:
            return None

        target_txn = parsed[0]

        # Apply updates
        updated_data = {
            "date": updates.get("date", target_txn.date),
            "payee": _sanitize_ledger_text(updates["payee"]) if "payee" in updates else target_txn.payee,
            "status": target_txn.status,
            "note": _sanitize_ledger_text(updates["note"]) if "note" in updates else target_txn.note,
            "tags": target_txn.tags,
            "gullak_id": gullak_id,
            "source": target_txn.source,
            "source_user": target_txn.source_user,
        }

        if "postings" in updates:
            updated_data["postings"] = updates["postings"]
        elif (
            "amount" in updates
            or "expense_account" in updates
            or "payment_account" in updates
            or "currency" in updates
        ):
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

        async with self._write_lock:
            # Re-read inside lock to get latest content
            content = self._read_file()
            lines = content.split("\n")
            txn_start, txn_end = self._find_transaction_span(lines, gullak_id)
            if txn_start is None:
                return None

            # Splice updated transaction into the file
            replacement_lines = updated_txn.to_ledger().split("\n")
            new_lines = lines[:txn_start] + replacement_lines + lines[txn_end:]
            new_content = "\n".join(new_lines)

            # Validate
            is_valid, error = await self.validator.validate_content(new_content)
            if not is_valid:
                raise ValueError(f"Update would create invalid ledger: {error}")

            self.path.write_text(new_content)
        await self._sync_paisa()
        return updated_txn
