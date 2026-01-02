"""Configuration management for Gullak."""

from pathlib import Path
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables.

    Inference configuration follows Karakeep-style naming:
    - Provider API keys: No prefix (industry standard names)
    - Inference config: GULLAK_INFERENCE_* prefix
    - App config: GULLAK_* prefix

    Supported providers (in priority order):
    1. OpenRouter - Multi-provider gateway (recommended)
    2. OpenAI - Direct OpenAI access
    3. Google - Gemini models
    4. Anthropic - Claude models
    5. Ollama - Local inference
    """

    model_config = SettingsConfigDict(
        env_prefix="GULLAK_",
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",  # Allow extra env vars
    )

    # ==========================================================================
    # Provider API Keys (no prefix - industry standard names)
    # ==========================================================================
    # OpenRouter - recommended for multi-provider access
    openrouter_api_key: str | None = Field(default=None, validation_alias="OPENROUTER_API_KEY")

    # Direct provider access
    openai_api_key: str | None = Field(default=None, validation_alias="OPENAI_API_KEY")
    openai_base_url: str | None = Field(default=None, validation_alias="OPENAI_BASE_URL")
    google_api_key: str | None = Field(default=None, validation_alias="GOOGLE_API_KEY")
    anthropic_api_key: str | None = Field(default=None, validation_alias="ANTHROPIC_API_KEY")
    ollama_base_url: str | None = Field(default=None, validation_alias="OLLAMA_BASE_URL")

    # ==========================================================================
    # Inference Configuration
    # ==========================================================================
    inference_model: str = Field(
        default="openrouter/google/gemini-2.0-flash-001",
        description="Model identifier in LiteLLM format. Examples: "
        "openrouter/anthropic/claude-3.5-sonnet, openrouter/google/gemini-2.0-flash-001, "
        "gpt-4o, gemini/gemini-2.0-flash, claude-sonnet-4-20250514",
    )
    inference_context_length: int = Field(
        default=8192,
        description="Max tokens to pass to the model. Larger = better quality but more expensive.",
    )

    # ==========================================================================
    # Ledger Configuration
    # ==========================================================================
    data_dir: Path = Path("./data")
    ledger_file: str = "main.ledger"
    ledger_cli: Literal["ledger", "hledger"] = "ledger"
    default_currency: str = "INR"
    timezone: str = "Asia/Kolkata"

    # ==========================================================================
    # Integrations
    # ==========================================================================
    paisa_url: str = Field(
        default="http://localhost:7500",
        description="Internal Paisa URL for backend API sync (e.g., http://paisa:7500 in Docker)",
    )
    paisa_external_url: str | None = Field(
        default=None,
        description="Browser-accessible Paisa URL for 'Open Paisa' link. Falls back to paisa_url.",
    )

    # WhatsApp Integration
    whatsapp_bridge_url: str = "http://whatsapp-bridge:3000"
    whatsapp_api_key: str | None = Field(default=None, validation_alias="GULLAK_WHATSAPP_API_KEY")
    whatsapp_allowed_numbers: list[str] = Field(
        default_factory=list,
        description="List of allowed phone numbers (e.g., 919999999999) that can interact with the bot",
    )
    whatsapp_group_require_mention: bool = Field(
        default=False,
        description="If true, only process group messages that mention @gullak",
    )

    # ==========================================================================
    # Media Processing (Receipt OCR)
    # ==========================================================================
    media_max_image_size: int = Field(
        default=5 * 1024 * 1024,
        description="Maximum image file size in bytes (default 5MB)",
    )
    media_max_pdf_size: int = Field(
        default=10 * 1024 * 1024,
        description="Maximum PDF file size in bytes (default 10MB)",
    )

    # ==========================================================================
    # Application
    # ==========================================================================
    debug: bool = False
    host: str = "0.0.0.0"
    port: int = 8000

    @property
    def ledger_path(self) -> Path:
        """Full path to the ledger file."""
        return self.data_dir / self.ledger_file

    @property
    def inference_api_key(self) -> str | None:
        """Get API key based on model provider.

        Auto-detects provider from model name and returns appropriate key.
        Priority: OpenRouter > OpenAI > Google > Anthropic
        """
        model = self.inference_model.lower()

        # OpenRouter models
        if model.startswith("openrouter/"):
            return self.openrouter_api_key

        # Direct provider models
        if model.startswith("gemini/") or model.startswith("google/"):
            return self.google_api_key
        if model.startswith("anthropic/") or model.startswith("claude"):
            return self.anthropic_api_key
        if model.startswith("ollama"):
            return None  # Ollama doesn't need API key

        # OpenAI and OpenAI-compatible (default)
        return self.openai_api_key

    @property
    def inference_base_url(self) -> str | None:
        """Get base URL based on model provider."""
        model = self.inference_model.lower()

        # OpenRouter uses default LiteLLM handling
        if model.startswith("openrouter/"):
            return None  # LiteLLM knows OpenRouter's URL

        if model.startswith("ollama"):
            return self.ollama_base_url or "http://localhost:11434"

        # OpenAI-compatible custom endpoint
        return self.openai_base_url

    def ensure_data_dir(self) -> None:
        """Create data directory if it doesn't exist."""
        self.data_dir.mkdir(parents=True, exist_ok=True)


# Global settings instance
settings = Settings()
