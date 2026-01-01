"""Paisa.yaml configuration manager."""

from pathlib import Path

import yaml
from pydantic import BaseModel, Field


class CreditCardConfig(BaseModel):
    """Credit card configuration for Paisa."""

    account: str
    credit_limit: int
    statement_end_day: int = 1
    due_day: int = 15
    network: str = "visa"
    number: str = ""
    expiration_date: str = ""


class CommodityPrice(BaseModel):
    """Price provider configuration."""

    provider: str = "in-mfapi"
    code: str = ""


class CommodityConfig(BaseModel):
    """Commodity/investment configuration."""

    name: str
    type: str = "mutualfund"
    price: CommodityPrice = Field(default_factory=CommodityPrice)
    harvest: int = 365
    tax_category: str = "equity65"


class AllocationTarget(BaseModel):
    """Asset allocation target."""

    name: str
    target: int
    accounts: list[str] = Field(default_factory=list)


class SavingsGoal(BaseModel):
    """Savings goal configuration."""

    name: str
    icon: str = "mdi:piggy-bank"
    target: int
    target_date: str
    rate: int = 10
    accounts: list[str] = Field(default_factory=list)


class ScheduleALEntry(BaseModel):
    """Schedule AL tax reporting entry."""

    code: str
    accounts: list[str] = Field(default_factory=list)


class PaisaConfig(BaseModel):
    """Complete Paisa configuration."""

    journal_path: str = "main.ledger"
    db_path: str = "paisa.db"
    default_currency: str = "INR"
    locale: str = "en-IN"
    time_zone: str = "Asia/Kolkata"
    financial_year_starting_month: int = 4
    ledger_cli: str = "ledger"
    strict: str = "no"  # Paisa expects "yes" or "no" as string

    budget: dict[str, str] = Field(default_factory=lambda: {"rollover": "yes"})
    credit_cards: list[CreditCardConfig] = Field(default_factory=list)
    commodities: list[CommodityConfig] = Field(default_factory=list)
    allocation_targets: list[AllocationTarget] = Field(default_factory=list)
    schedule_al: list[ScheduleALEntry] = Field(default_factory=list)
    goals: dict[str, list[SavingsGoal]] = Field(default_factory=dict)


class PaisaConfigManager:
    """Manages paisa.yaml configuration file."""

    def __init__(self, config_path: Path):
        self.config_path = config_path
        self._config: PaisaConfig | None = None

    def load(self) -> PaisaConfig:
        """Load config from file or create default."""
        if self.config_path.exists():
            try:
                data = yaml.safe_load(self.config_path.read_text()) or {}
                self._config = PaisaConfig.model_validate(data)
            except Exception:
                self._config = PaisaConfig()
        else:
            self._config = PaisaConfig()
        return self._config

    def save(self) -> None:
        """Save config to file."""
        if self._config is None:
            self._config = PaisaConfig()

        self.config_path.parent.mkdir(parents=True, exist_ok=True)

        data = self._config.model_dump(exclude_none=True, exclude_defaults=False)
        clean_data = self._clean_empty(data)

        yaml_str = yaml.dump(
            clean_data, default_flow_style=False, sort_keys=False, allow_unicode=True
        )
        self.config_path.write_text(yaml_str)

    def _clean_empty(self, data: dict) -> dict:
        """Remove empty lists and dicts."""
        result = {}
        for k, v in data.items():
            if isinstance(v, dict):
                cleaned = self._clean_empty(v)
                if cleaned:
                    result[k] = cleaned
            elif isinstance(v, list):
                if v:
                    result[k] = v
            elif v is not None and v != "":
                result[k] = v
        return result

    @property
    def config(self) -> PaisaConfig:
        if self._config is None:
            self._config = self.load()
        return self._config

    def add_credit_card(
        self,
        account: str,
        credit_limit: int,
        statement_end_day: int = 1,
        due_day: int = 15,
        network: str = "visa",
    ) -> CreditCardConfig:
        """Add a credit card configuration."""
        existing = [c for c in self.config.credit_cards if c.account != account]

        card = CreditCardConfig(
            account=account,
            credit_limit=credit_limit,
            statement_end_day=statement_end_day,
            due_day=due_day,
            network=network,
        )
        existing.append(card)
        self.config.credit_cards = existing
        self.save()
        return card

    def remove_credit_card(self, account: str) -> bool:
        """Remove a credit card by account name."""
        original_len = len(self.config.credit_cards)
        self.config.credit_cards = [c for c in self.config.credit_cards if c.account != account]
        if len(self.config.credit_cards) < original_len:
            self.save()
            return True
        return False

    def set_allocation_targets(self, targets: list[AllocationTarget]) -> None:
        """Set asset allocation targets."""
        self.config.allocation_targets = targets
        self.save()

    def add_allocation_target(
        self, name: str, target: int, accounts: list[str]
    ) -> AllocationTarget:
        """Add or update an allocation target."""
        existing = [t for t in self.config.allocation_targets if t.name != name]

        new_target = AllocationTarget(name=name, target=target, accounts=accounts)
        existing.append(new_target)
        self.config.allocation_targets = existing
        self.save()
        return new_target

    def add_savings_goal(
        self,
        name: str,
        target: int,
        target_date: str,
        accounts: list[str],
        rate: int = 10,
    ) -> SavingsGoal:
        """Add a savings goal."""
        if "savings" not in self.config.goals:
            self.config.goals["savings"] = []

        existing = [g for g in self.config.goals["savings"] if g.name != name]

        goal = SavingsGoal(
            name=name,
            target=target,
            target_date=target_date,
            accounts=accounts,
            rate=rate,
        )
        existing.append(goal)
        self.config.goals["savings"] = existing
        self.save()
        return goal

    def setup_schedule_al(self) -> None:
        """Set up default Schedule AL entries for Indian tax reporting."""
        self.config.schedule_al = [
            ScheduleALEntry(code="bank", accounts=["Assets:Checking:*", "Assets:Savings:*"]),
            ScheduleALEntry(code="share", accounts=["Assets:Equity:*"]),
            ScheduleALEntry(code="liability", accounts=["Liabilities:*"]),
        ]
        self.save()

    def update_basic_settings(
        self,
        currency: str | None = None,
        timezone: str | None = None,
        journal_path: str | None = None,
    ) -> None:
        """Update basic configuration settings."""
        if currency:
            self.config.default_currency = currency
        if timezone:
            self.config.time_zone = timezone
        if journal_path:
            self.config.journal_path = journal_path
        self.save()
