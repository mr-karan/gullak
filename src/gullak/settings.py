"""Configuration management for Gullak."""

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="GULLAK_",
        env_file=".env",
        env_file_encoding="utf-8",
    )

    # Anthropic API (no prefix - uses standard ANTHROPIC_API_KEY)
    anthropic_api_key: str | None = Field(default=None, validation_alias="ANTHROPIC_API_KEY")
    anthropic_model: str = "claude-sonnet-4-20250514"

    # Ledger configuration
    data_dir: Path = Path("./data")
    ledger_file: str = "main.ledger"
    ledger_cli: Literal["ledger", "hledger"] = "ledger"
    default_currency: str = "INR"
    timezone: str = "Asia/Kolkata"

    # Application
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    @property
    def ledger_path(self) -> Path:
        """Full path to the ledger file."""
        return self.data_dir / self.ledger_file

    def ensure_data_dir(self) -> None:
        """Create data directory if it doesn't exist."""
        self.data_dir.mkdir(parents=True, exist_ok=True)


# Global settings instance
settings = Settings()
