"""Shared state for Gullak tools with dependency injection."""

import json
import logging
from contextvars import ContextVar
from datetime import date, datetime, timedelta
from decimal import Decimal
from pathlib import Path
from typing import TYPE_CHECKING
from zoneinfo import ZoneInfo

from gullak.ledger.categories import suggest_category
from gullak.ledger.memory import PayeeMemory
from gullak.ledger.models import PendingTransaction, TransactionSource
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
        timezone: str = "Asia/Kolkata",
    ):
        self.ledger_path = ledger_path
        self.default_currency = default_currency
        self.parser = parser or LedgerParser()
        self.validator = validator or LedgerValidator()
        self.writer: LedgerWriter | None = None
        self.memory = PayeeMemory(ledger_path)
        self._memory_mtime: float | None = self._get_ledger_mtime()
        self._thread_id: ContextVar[str | None] = ContextVar("gullak_thread_id", default=None)
        self._source: ContextVar[TransactionSource | None] = ContextVar(
            "gullak_source", default=None
        )
        self._source_user: ContextVar[str | None] = ContextVar("gullak_source_user", default=None)
        self._timezone = ZoneInfo(timezone)
        self._now: ContextVar[datetime | None] = ContextVar("gullak_time_context", default=None)
        self._last_confirmed_by_thread: dict[str, str] = {}

        self._pending: dict[str, PendingTransaction] = {}
        self._last_created_id: str | None = None
        self._load_pending()

    def _get_ledger_mtime(self) -> float | None:
        try:
            return self.ledger_path.stat().st_mtime if self.ledger_path.exists() else None
        except OSError:
            return None

    def _refresh_memory_if_stale(self) -> None:
        """Reload payee memory if the ledger file has been modified externally."""
        current_mtime = self._get_ledger_mtime()
        if current_mtime != self._memory_mtime:
            self.memory = PayeeMemory(self.ledger_path)
            self._memory_mtime = current_mtime

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
        self._pending[pending.id] = pending
        self._last_created_id = pending.id
        self._save_pending()
        logger.info(f"Added pending transaction: {pending.id}")

    def get_pending(self, thread_id: str | None = None) -> dict[str, PendingTransaction]:
        if thread_id is None:
            return self._pending.copy()
        return {k: v for k, v in self._pending.items() if v.thread_id == thread_id}

    def get_last_pending(self) -> PendingTransaction | None:
        thread_id = self.get_thread_id()

        if self._last_created_id and self._last_created_id in self._pending:
            pending = self._pending[self._last_created_id]
            if thread_id is None or pending.thread_id == thread_id:
                return pending

        thread_pending = self.get_pending(thread_id=thread_id)
        if not thread_pending:
            return None

        return max(thread_pending.values(), key=lambda p: p.created_at)

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

        # Regenerate preview from updated transaction
        pending.transaction = txn
        pending.ledger_preview = txn.to_ledger()
        self._save_pending()

        return pending

    # -------------------------------------------------------------------------
    # Date Parsing
    # -------------------------------------------------------------------------

    def set_time_context(self, now: datetime | None) -> None:
        """Set a per-request time context for relative date parsing."""
        if now is None:
            self._now.set(None)
            return
        if now.tzinfo is None:
            now = now.replace(tzinfo=self._timezone)
        else:
            now = now.astimezone(self._timezone)
        self._now.set(now)

    def _today(self) -> date:
        now = self._now.get()
        if now is not None:
            return now.date()
        return datetime.now(self._timezone).date()

    def parse_date(self, date_str: str) -> date:
        """Parse date string, handling relative dates like 'yesterday', 'last Monday'."""
        if not date_str:
            return self._today()

        date_str = date_str.lower().strip()
        today = self._today()

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
        self._refresh_memory_if_stale()
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

    def suggest_accounts(self, payee: str, amount: Decimal | None = None) -> tuple[str, str | None]:
        """
        Suggest both expense and payment accounts based on payee.

        Returns:
            Tuple of (expense_account, payment_account).
            payment_account may be None if not learned.
        """
        self._refresh_memory_if_stale()
        expense_account: str | None = None
        payment_account: str | None = None

        # Check payee memory for both accounts
        if self.memory:
            expense_account, payment_account = self.memory.suggest_accounts(payee)

        # Fall back to pattern matching for expense account
        if not expense_account:
            pattern_suggestion = suggest_category(
                payee,
                float(amount) if amount else 0.0,
            )
            expense_account = pattern_suggestion or "Expenses:Other"

        return expense_account, payment_account

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
        self._thread_id.set(thread_id)

    def get_thread_id(self) -> str | None:
        return self._thread_id.get()

    def set_last_confirmed(self, thread_id: str | None, transaction_id: str) -> None:
        if not thread_id or not transaction_id:
            return
        self._last_confirmed_by_thread[thread_id] = transaction_id

    def get_last_confirmed(self, thread_id: str | None) -> str | None:
        if not thread_id:
            return None
        return self._last_confirmed_by_thread.get(thread_id)

    def get_source(self) -> TransactionSource | None:
        return self._source.get()

    def get_source_user(self) -> str | None:
        return self._source_user.get()

    def set_source_context(
        self,
        source: TransactionSource | None,
        source_user: str | None = None,
    ) -> None:
        self._source.set(source)
        self._source_user.set(source_user)
