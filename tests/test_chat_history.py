"""Tests for ChatHistory async SQLite storage."""

import pytest

from gullak.chat_history import ChatHistory


class TestChatHistory:
    """Test ChatHistory thread and message operations."""

    @pytest.fixture
    async def chat_history(self, temp_db_path):
        """Create a ChatHistory instance with temp database."""
        return ChatHistory(temp_db_path)

    async def test_create_thread(self, chat_history):
        thread_id = await chat_history.create_thread(title="Test Thread")

        assert thread_id is not None
        assert len(thread_id) == 12

    async def test_create_thread_with_custom_id(self, chat_history):
        thread_id = await chat_history.create_thread(thread_id="custom123", title="Custom")

        assert thread_id == "custom123"

    async def test_get_thread(self, chat_history):
        thread_id = await chat_history.create_thread(title="My Thread")
        thread = await chat_history.get_thread(thread_id)

        assert thread is not None
        assert thread["id"] == thread_id
        assert thread["title"] == "My Thread"
        assert thread["message_count"] == 0

    async def test_get_nonexistent_thread(self, chat_history):
        thread = await chat_history.get_thread("nonexistent")

        assert thread is None

    async def test_save_and_load_messages(self, chat_history):
        thread_id = await chat_history.create_thread()

        await chat_history.save_message(thread_id, "user", "Hello!")
        await chat_history.save_message(thread_id, "assistant", "Hi there!")

        messages = await chat_history.load_messages(thread_id)

        assert len(messages) == 2
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == "Hello!"
        assert messages[1]["role"] == "assistant"
        assert messages[1]["content"] == "Hi there!"

    async def test_auto_title_from_first_message(self, chat_history):
        thread_id = await chat_history.create_thread()
        await chat_history.save_message(thread_id, "user", "How do I track expenses?")

        thread = await chat_history.get_thread(thread_id)

        assert thread["title"] == "How do I track expenses?"

    async def test_auto_title_truncation(self, chat_history):
        thread_id = await chat_history.create_thread()
        long_message = "A" * 100
        await chat_history.save_message(thread_id, "user", long_message)

        thread = await chat_history.get_thread(thread_id)

        assert len(thread["title"]) == 53
        assert thread["title"].endswith("...")

    async def test_list_threads(self, chat_history):
        await chat_history.create_thread(title="Thread 1")
        await chat_history.create_thread(title="Thread 2")
        await chat_history.create_thread(title="Thread 3")

        threads = await chat_history.list_threads()

        assert len(threads) == 3

    async def test_list_threads_ordered_by_updated(self, chat_history):
        id1 = await chat_history.create_thread(title="Old Thread")
        id2 = await chat_history.create_thread(title="New Thread")
        await chat_history.save_message(id1, "user", "Update old thread")

        threads = await chat_history.list_threads()

        assert threads[0]["id"] == id1
        assert threads[1]["id"] == id2

    async def test_delete_thread(self, chat_history):
        thread_id = await chat_history.create_thread()
        await chat_history.save_message(thread_id, "user", "Test message")

        deleted = await chat_history.delete_thread(thread_id)

        assert deleted is True
        assert await chat_history.get_thread(thread_id) is None

    async def test_delete_nonexistent_thread(self, chat_history):
        deleted = await chat_history.delete_thread("nonexistent")

        assert deleted is False

    async def test_delete_all_threads(self, chat_history):
        await chat_history.create_thread(title="Thread 1")
        await chat_history.create_thread(title="Thread 2")

        count = await chat_history.delete_all_threads()

        assert count == 2
        assert await chat_history.list_threads() == []

    async def test_message_pagination(self, chat_history):
        thread_id = await chat_history.create_thread()
        for i in range(10):
            await chat_history.save_message(thread_id, "user", f"Message {i}")

        first_batch = await chat_history.load_messages(thread_id, limit=5)
        assert len(first_batch) == 5

        last_id = first_batch[0]["id"]
        second_batch = await chat_history.load_messages(thread_id, limit=5, before_id=last_id)
        assert len(second_batch) == 5

    async def test_json_content_storage(self, chat_history):
        thread_id = await chat_history.create_thread()
        content_blocks = [
            {"type": "text", "text": "Hello"},
            {"type": "tool_use", "id": "123", "name": "test"},
        ]
        await chat_history.save_message(thread_id, "assistant", content_blocks)

        messages = await chat_history.load_messages(thread_id)

        assert messages[0]["content"] == content_blocks

    async def test_thread_message_count(self, chat_history):
        thread_id = await chat_history.create_thread()
        await chat_history.save_message(thread_id, "user", "1")
        await chat_history.save_message(thread_id, "assistant", "2")
        await chat_history.save_message(thread_id, "user", "3")

        thread = await chat_history.get_thread(thread_id)

        assert thread["message_count"] == 3
