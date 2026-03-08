"""Tests for settings parsing, especially comma-separated env values."""

from unittest.mock import patch

import pytest


class TestWhatsAppAllowedNumbers:
    """Test that whatsapp_allowed_numbers accepts multiple formats."""

    def test_comma_separated(self):
        with patch.dict("os.environ", {"GULLAK_WHATSAPP_ALLOWED_NUMBERS": "918851607899,919650318721"}):
            from gullak.settings import Settings
            s = Settings()
            assert s.whatsapp_allowed_numbers_list == ["918851607899", "919650318721"]

    def test_json_array(self):
        with patch.dict("os.environ", {"GULLAK_WHATSAPP_ALLOWED_NUMBERS": '["918851607899","919650318721"]'}):
            from gullak.settings import Settings
            s = Settings()
            assert s.whatsapp_allowed_numbers_list == ["918851607899", "919650318721"]

    def test_single_number(self):
        with patch.dict("os.environ", {"GULLAK_WHATSAPP_ALLOWED_NUMBERS": "918851607899"}):
            from gullak.settings import Settings
            s = Settings()
            assert s.whatsapp_allowed_numbers_list == ["918851607899"]

    def test_empty_string_raises(self):
        """Empty allowlist must prevent app from starting (fail-closed)."""
        from pydantic import ValidationError
        with patch.dict("os.environ", {"GULLAK_WHATSAPP_ALLOWED_NUMBERS": ""}):
            from gullak.settings import Settings
            with pytest.raises(ValidationError, match="GULLAK_WHATSAPP_ALLOWED_NUMBERS"):
                Settings()

    def test_not_set_raises(self):
        """Missing allowlist must prevent app from starting (fail-closed)."""
        from pydantic import ValidationError
        env = {k: v for k, v in __import__("os").environ.items() if "WHATSAPP_ALLOWED" not in k}
        with patch.dict("os.environ", env, clear=True):
            from gullak.settings import Settings
            with pytest.raises((ValidationError, Exception)):
                Settings(_env_file=None)

    def test_comma_separated_with_spaces(self):
        with patch.dict("os.environ", {"GULLAK_WHATSAPP_ALLOWED_NUMBERS": "918851607899, 919650318721"}):
            from gullak.settings import Settings
            s = Settings()
            assert s.whatsapp_allowed_numbers_list == ["918851607899", "919650318721"]


class TestSettingsDefaults:
    """Test default settings values."""

    def test_default_currency(self):
        from gullak.settings import Settings
        s = Settings()
        assert s.default_currency == "INR"

    def test_default_timezone(self):
        from gullak.settings import Settings
        s = Settings()
        assert s.timezone == "Asia/Kolkata"

    def test_ledger_path(self):
        from gullak.settings import Settings
        s = Settings()
        assert str(s.ledger_path).endswith("main.ledger")

    def test_effective_vision_model_fallback(self):
        from gullak.settings import Settings
        s = Settings()
        assert s.effective_vision_model == s.inference_model
