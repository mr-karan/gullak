import re
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path


@dataclass
class PayeeMapping:
    expense_account: str
    payment_account: str | None = None


class PayeeMemory:
    PAYEE_MAP_PATTERN = re.compile(r";\s*gullak:payee_map\s+(.+?)=([^|\n]+)(?:\|(.+))?")

    def __init__(self, ledger_path: Path):
        self.path = ledger_path
        self._mappings: dict[str, PayeeMapping] = {}
        self._load_mappings()

    def _load_mappings(self) -> None:
        if not self.path.exists():
            return

        content = self.path.read_text()
        for match in self.PAYEE_MAP_PATTERN.finditer(content):
            payee = match.group(1).strip().lower()
            expense_account = match.group(2).strip()
            payment_account = match.group(3).strip() if match.group(3) else None
            self._mappings[payee] = PayeeMapping(expense_account, payment_account)

    def get_mapping(self, payee: str) -> PayeeMapping | None:
        return self._mappings.get(payee.lower().strip())

    def suggest_account(self, payee: str, threshold: float = 0.7) -> str | None:
        payee_lower = payee.lower().strip()

        if payee_lower in self._mappings:
            return self._mappings[payee_lower].expense_account

        best_match = None
        best_ratio = threshold

        for known_payee, mapping in self._mappings.items():
            if known_payee in payee_lower or payee_lower in known_payee:
                return mapping.expense_account

            ratio = SequenceMatcher(None, payee_lower, known_payee).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = mapping.expense_account

        return best_match

    def suggest_payment_account(self, payee: str, threshold: float = 0.7) -> str | None:
        payee_lower = payee.lower().strip()

        if payee_lower in self._mappings:
            return self._mappings[payee_lower].payment_account

        best_match = None
        best_ratio = threshold

        for known_payee, mapping in self._mappings.items():
            if known_payee in payee_lower or payee_lower in known_payee:
                return mapping.payment_account

            ratio = SequenceMatcher(None, payee_lower, known_payee).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = mapping.payment_account

        return best_match

    def suggest_accounts(self, payee: str, threshold: float = 0.7) -> tuple[str | None, str | None]:
        payee_lower = payee.lower().strip()

        if payee_lower in self._mappings:
            m = self._mappings[payee_lower]
            return m.expense_account, m.payment_account

        best_mapping = None
        best_ratio = threshold

        for known_payee, mapping in self._mappings.items():
            if known_payee in payee_lower or payee_lower in known_payee:
                return mapping.expense_account, mapping.payment_account

            ratio = SequenceMatcher(None, payee_lower, known_payee).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_mapping = mapping

        if best_mapping:
            return best_mapping.expense_account, best_mapping.payment_account
        return None, None

    def add_mapping(
        self, payee: str, expense_account: str, payment_account: str | None = None
    ) -> None:
        payee_lower = payee.lower().strip()

        existing = self._mappings.get(payee_lower)
        if existing:
            if (
                existing.expense_account == expense_account
                and existing.payment_account == payment_account
            ):
                return

        self._mappings[payee_lower] = PayeeMapping(expense_account, payment_account)
        self._save_mapping(payee, expense_account, payment_account)

    def _save_mapping(
        self, payee: str, expense_account: str, payment_account: str | None = None
    ) -> None:
        if not self.path.exists():
            return

        content = self.path.read_text()

        payee_escaped = re.escape(payee.lower().strip())
        pattern = re.compile(rf";\s*gullak:payee_map\s+{payee_escaped}=[^\n]+", re.IGNORECASE)

        if payment_account:
            new_line = f"; gullak:payee_map {payee}={expense_account}|{payment_account}"
        else:
            new_line = f"; gullak:payee_map {payee}={expense_account}"

        if pattern.search(content):
            content = pattern.sub(new_line, content)
            self.path.write_text(content)
        else:
            lines = content.split("\n")
            insert_idx = 0

            for i, line in enumerate(lines):
                if line.strip() and not line.strip().startswith(";"):
                    insert_idx = i
                    break
                insert_idx = i + 1

            lines.insert(insert_idx, new_line)
            self.path.write_text("\n".join(lines))

    def get_all_mappings(self) -> dict[str, PayeeMapping]:
        return dict(self._mappings)

    def remove_mapping(self, payee: str) -> bool:
        payee_lower = payee.lower().strip()

        if payee_lower not in self._mappings:
            return False

        del self._mappings[payee_lower]

        if self.path.exists():
            content = self.path.read_text()
            payee_escaped = re.escape(payee_lower)
            pattern = re.compile(
                rf";\s*gullak:payee_map\s+{payee_escaped}=[^\n]+\n?", re.IGNORECASE
            )
            content = pattern.sub("", content)
            self.path.write_text(content)

        return True
