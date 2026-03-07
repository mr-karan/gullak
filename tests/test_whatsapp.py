"""Tests for WhatsApp message handling: noise filter, message dedup, timestamp parsing."""

from datetime import datetime, timezone

import pytest

from gullak.api.whatsapp import (
    _extract_message_time,
    _is_duplicate_message,
    _is_noise_message,
    _processed_messages,
)


class TestNoiseFilter:
    """Test that noise messages are correctly identified."""

    @pytest.mark.parametrize("message", [
        "hi", "hello", "hey", "good morning", "good night", "gm", "gn",
        "thanks", "thank you", "ok thanks", "bye",
        "haha", "lol", "hmm", "acha", "theek hai", "sahi hai",
    ])
    def test_noise_messages(self, message):
        assert _is_noise_message(message) is True

    @pytest.mark.parametrize("message", [
        "Hi!", "HELLO!", "Thanks!!", "bye...",
    ])
    def test_noise_with_punctuation(self, message):
        assert _is_noise_message(message) is True

    @pytest.mark.parametrize("message", [
        "chai 50", "swiggy 350", "rent 25000", "uber 150 upi",
        "paid 200 for groceries", "salary credited 75000",
        "50", "1k", "5k", "10k",
    ])
    def test_financial_messages_not_noise(self, message):
        assert _is_noise_message(message) is False

    @pytest.mark.parametrize("message", [
        "upi", "cc", "emi", "sip", "fd", "atm",
    ])
    def test_finance_keywords_not_noise(self, message):
        assert _is_noise_message(message) is False

    def test_emoji_noise(self):
        assert _is_noise_message("👍") is True
        assert _is_noise_message("🙏") is True

    def test_long_message_not_noise(self):
        assert _is_noise_message("can you check my expenses for this month") is False

    def test_empty_not_noise(self):
        # Empty strings should not be flagged as noise (they're handled separately)
        assert _is_noise_message("") is True  # empty after strip


class TestMessageDedup:
    """Test message deduplication cache."""

    def setup_method(self):
        _processed_messages.clear()

    def test_first_message_not_duplicate(self):
        assert _is_duplicate_message("msg_001") is False

    def test_second_same_message_is_duplicate(self):
        _is_duplicate_message("msg_002")
        assert _is_duplicate_message("msg_002") is True

    def test_different_messages_not_duplicates(self):
        _is_duplicate_message("msg_003")
        assert _is_duplicate_message("msg_004") is False


class TestTimestampParsing:
    """Test WhatsApp message timestamp extraction."""

    def test_unix_seconds(self):
        payload = {"timestamp": "1709234567"}
        result = _extract_message_time(payload)
        assert result is not None
        assert isinstance(result, datetime)
        assert result.tzinfo == timezone.utc

    def test_unix_milliseconds(self):
        payload = {"messageTimestampMs": "1709234567000"}
        result = _extract_message_time(payload)
        assert result is not None
        # Should be same as seconds version (divided by 1000)
        assert result.year >= 2024

    def test_no_timestamp(self):
        result = _extract_message_time({})
        assert result is None

    def test_invalid_timestamp(self):
        result = _extract_message_time({"timestamp": "not_a_number"})
        assert result is None

    def test_message_timestamp_key(self):
        payload = {"messageTimestamp": "1709234567"}
        result = _extract_message_time(payload)
        assert result is not None
