"""Shared state for Gullak tools with dependency injection."""

import json
import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import TYPE_CHECKING

from gullak.ledger.categories import suggest_category
from gullak.ledger.memory import PayeeMemory
from gullak.ledger.models import PendingTransaction
from gullak.ledger.parser import LedgerParser
from gullak.ledger.validator import LedgerValidator

if TYPE_CHECKING:
    from gullak.ledger.writer import LedgerWriter

logger = logging.getLogger(__name__)


class ToolState:
    """
    Shared state accessible by all tool executors.

    This class manages:
    - Ledger path and configuration
    - Pending transactions (preview before confirm)
    - Payee memory for auto-categorization
    - Parser and validator instances
    - Thread context for multi-conversation support

    Injected into tool executors for clean dependency management.
    """

    def __init__(
        self,
        ledger_path: Path,
        default_currency: str = "INR",
        parser: LedgerParser | None = None,
        validator: LedgerValidator | None = None,
    ):
        self.ledger_path = ledger_path
        self.default_currency = default_currency
        self.parser = parser or LedgerParser()
        self.validator = validator or LedgerValidator()
        self.memory = PayeeMemory(ledger_path)
        self.current_thread_id: str | None = None

        self._pending: dict[str, PendingTransaction] = {}
        self._load_pending()

    # -------------------------------------------------------------------------
    # Pending Transaction Management
    # -------------------------------------------------------------------------

    def _get_pending_file(self) -> Path:
        """Get path to pending transactions file."""
        return self.ledger_path.parent / ".pending.json"

    def _load_pending(self) -> None:
        """Load pending transactions from disk."""
        pending_file = self._get_pending_file()
        if not pending_file.exists():
            return

        try:
            data = json.loads(pending_file.read_text())
            for k, v in data.items():
                self._pending[k] = PendingTransaction.model_validate(v)
            logger.debug(f"Loaded {len(self._pending)} pending transactions")
        except (json.JSONDecodeError, Exception) as e:
            logger.warning(f"Error loading pending transactions: {e}")

    def _save_pending(self) -> None:
        """Persist pending transactions to disk."""
        pending_file = self._get_pending_file()

        if not self._pending:
            if pending_file.exists():
                pending_file.unlink()
            return

        data = {k: v.model_dump(mode="json") for k, v in self._pending.items()}
        pending_file.write_text(json.dumps(data, indent=2, default=str))

    def add_pending(self, pending: PendingTransaction) -> None:
        """Add a pending transaction."""
        self._pending[pending.id] = pending
        self._save_pending()
        logger.info(f"Added pending transaction: {pending.id}")

    def get_pending(self, thread_id: str | None = None) -> dict[str, PendingTransaction]:
        """Get pending transactions, optionally filtered by thread_id."""
        if thread_id is None:
            return self._pending.copy()
        return {k: v for k, v in self._pending.items() if v.thread_id == thread_id}

    def clear_pending(self, txn_id: str) -> PendingTransaction | None:
        """Remove and return a pending transaction."""
        result = self._pending.pop(txn_id, None)
        if result:
            self._save_pending()
            logger.info(f"Cleared pending transaction: {txn_id}")
        return result

    def update_pending(self, txn_id: str, updates: dict) -> PendingTransaction | None:
        """Update a pending transaction's fields."""
        pending = self._pending.get(txn_id)
        if not pending:
            return None

        txn = pending.transaction

        # Apply updates to transaction
        if "payee" in updates:
            txn.payee = updates["payee"]
        if "date" in updates:
            txn.date = self.parse_date(updates["date"])
        if "amount" in updates and txn.postings:
            new_amount = Decimal(str(updates["amount"]))
            txn.postings[0].amount = new_amount
            if len(txn.postings) > 1:
                txn.postings[1].amount = -new_amount
        if "expense_account" in updates and txn.postings:
            txn.postings[0].account = updates["expense_account"]
        if "payment_account" in updates and len(txn.postings) > 1:
            txn.postings[1].account = updates["payment_account"]
        if "currency" in updates and txn.postings:
            for posting in txn.postings:
                posting.currency = updates["currency"]
        if "note" in updates:
            txn.note = updates["note"]

        # Regenerate preview
        pending.transaction = txn
        self._save_pending()

        return pending

    # -------------------------------------------------------------------------
    # Date Parsing
    # -------------------------------------------------------------------------

    def parse_date(self, date_str: str) -> date:
        """Parse date string, handling relative dates like 'yesterday', 'last Monday'."""
        if not date_str:
            return date.today()

        date_str = date_str.lower().strip()
        today = date.today()

        # Relative dates
        if date_str in ("today", "now"):
            return today
        if date_str == "yesterday":
            return today - timedelta(days=1)
        if date_str == "tomorrow":
            return today + timedelta(days=1)

        # "X days ago"
        if "days ago" in date_str:
            try:
                days = int(date_str.split()[0])
                return today - timedelta(days=days)
            except (ValueError, IndexError):
                pass

        # "last <weekday>"
        weekdays = {
            "monday": 0,
            "tuesday": 1,
            "wednesday": 2,
            "thursday": 3,
            "friday": 4,
            "saturday": 5,
            "sunday": 6,
        }
        for day_name, day_num in weekdays.items():
            if day_name in date_str:
                days_ago = (today.weekday() - day_num) % 7
                if days_ago == 0:
                    days_ago = 7  # "last Monday" means previous Monday
                return today - timedelta(days=days_ago)

        # ISO format
        try:
            return date.fromisoformat(date_str)
        except ValueError:
            pass

        # Other common formats
        for fmt in ("%Y/%m/%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y"):
            try:
                return datetime.strptime(date_str, fmt).date()
            except ValueError:
                continue

        logger.warning(f"Could not parse date '{date_str}', defaulting to today")
        return today

    # -------------------------------------------------------------------------
    # Account Suggestion
    # -------------------------------------------------------------------------

    def suggest_account(self, payee: str, amount: Decimal | None = None) -> str:
        """Suggest expense account based on payee using memory and patterns."""
        # Check payee memory first
        if self.memory:
            suggested = self.memory.suggest_account(payee)
            if suggested:
                return suggested

        # Fall back to pattern matching
        pattern_suggestion = suggest_category(
            payee,
            float(amount) if amount else 0.0,
        )
        return pattern_suggestion or "Expenses:Other"

    # -------------------------------------------------------------------------
    # Account Listing
    # -------------------------------------------------------------------------

    def get_accounts(self, account_type: str = "all") -> list[str]:
        """Get accounts from ledger, optionally filtered by type."""
        if not self.ledger_path.exists():
            return []

        accounts = self.parser.extract_accounts(self.ledger_path)

        prefix_map = {
            "expenses": "Expenses:",
            "assets": "Assets:",
            "liabilities": "Liabilities:",
            "income": "Income:",
        }

        if account_type != "all" and account_type in prefix_map:
            prefix = prefix_map[account_type]
            accounts = {a for a in accounts if a.startswith(prefix)}

        return sorted(accounts)

    # -------------------------------------------------------------------------
    # Thread Context
    # -------------------------------------------------------------------------

    def set_thread_id(self, thread_id: str | None) -> None:
        """Set the current thread context for pending transactions."""
        self.current_thread_id = thread_id

    def get_thread_id(self) -> str | None:
        """Get the current thread context."""
        return self.current_thread_id
