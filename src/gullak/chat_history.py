"""Async SQLite-based chat history with thread support."""

import json
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import aiosqlite


class ChatHistory:
    """Async persistence for chat threads and messages."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._initialized = False

    async def _ensure_initialized(self) -> None:
        if self._initialized:
            return
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("PRAGMA journal_mode=WAL")
            await db.execute("PRAGMA synchronous=NORMAL")

            # Check if we need to migrate from old schema
            cursor = await db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'"
            )
            messages_exists = await cursor.fetchone() is not None

            if messages_exists:
                # Check if thread_id column exists
                cursor = await db.execute("PRAGMA table_info(messages)")
                columns = {row[1] for row in await cursor.fetchall()}
                if "thread_id" not in columns:
                    # Old schema - migrate by backing up and recreating
                    await db.execute("ALTER TABLE messages RENAME TO messages_old")
                    await db.commit()
                    messages_exists = False  # Force table recreation

            # Create threads table
            await db.execute("""
                CREATE TABLE IF NOT EXISTS threads (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)

            # Create messages table with proper schema
            await db.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    thread_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (thread_id) REFERENCES threads(id)
                )
            """)

            # Migrate old messages if backup exists
            cursor = await db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_old'"
            )
            if await cursor.fetchone():
                # Create default thread for old messages
                now = datetime.now().isoformat()
                await db.execute(
                    "INSERT OR IGNORE INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                    ("legacy", "Previous Conversations", now, now),
                )
                # Migrate old messages to legacy thread
                await db.execute(
                    """
                    INSERT INTO messages (thread_id, role, content, created_at)
                    SELECT 'legacy', role, content, COALESCE(created_at, ?)
                    FROM messages_old
                """,
                    (now,),
                )
                await db.execute("DROP TABLE messages_old")

            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_thread 
                ON messages(thread_id, id)
            """)
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_threads_updated
                ON threads(updated_at DESC)
            """)
            await db.commit()
        self._initialized = True

    @asynccontextmanager
    async def _get_db(self):
        await self._ensure_initialized()
        async with aiosqlite.connect(self.db_path) as db:
            db.row_factory = aiosqlite.Row
            yield db

    async def create_thread(self, thread_id: str | None = None, title: str | None = None) -> str:
        """Create a new thread. Returns thread_id."""
        if thread_id is None:
            thread_id = uuid4().hex[:12]
        now = datetime.now().isoformat()
        async with self._get_db() as db:
            await db.execute(
                "INSERT OR IGNORE INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (thread_id, title, now, now),
            )
            await db.commit()
        return thread_id

    async def update_thread_title(self, thread_id: str, title: str) -> None:
        """Update thread title."""
        now = datetime.now().isoformat()
        async with self._get_db() as db:
            await db.execute(
                "UPDATE threads SET title = ?, updated_at = ? WHERE id = ? AND title IS NULL",
                (title, now, thread_id),
            )
            await db.commit()

    async def save_message(
        self, thread_id: str, role: str, content: list[dict[str, Any]] | str
    ) -> None:
        """Save a message to the thread."""
        now = datetime.now().isoformat()
        content_str = json.dumps(content) if isinstance(content, list) else content

        async with self._get_db() as db:
            await db.execute(
                "INSERT OR IGNORE INTO threads (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (thread_id, None, now, now),
            )
            await db.execute(
                "UPDATE threads SET updated_at = ? WHERE id = ?",
                (now, thread_id),
            )
            await db.execute(
                "INSERT INTO messages (thread_id, role, content, created_at) VALUES (?, ?, ?, ?)",
                (thread_id, role, content_str, now),
            )
            await db.commit()

            # Auto-generate title from first user message
            if role == "user" and isinstance(content, str):
                cursor = await db.execute("SELECT title FROM threads WHERE id = ?", (thread_id,))
                row = await cursor.fetchone()
                if row and row["title"] is None:
                    title = content[:50].strip()
                    if len(content) > 50:
                        title += "..."
                    await db.execute(
                        "UPDATE threads SET title = ? WHERE id = ?",
                        (title, thread_id),
                    )
                    await db.commit()

    async def load_messages(
        self, thread_id: str, limit: int = 50, before_id: int | None = None
    ) -> list[dict[str, Any]]:
        """Load messages for a thread with optional pagination."""
        async with self._get_db() as db:
            if before_id:
                cursor = await db.execute(
                    """SELECT id, role, content FROM messages 
                       WHERE thread_id = ? AND id < ? 
                       ORDER BY id DESC LIMIT ?""",
                    (thread_id, before_id, limit),
                )
            else:
                cursor = await db.execute(
                    """SELECT id, role, content FROM messages 
                       WHERE thread_id = ? 
                       ORDER BY id DESC LIMIT ?""",
                    (thread_id, limit),
                )
            rows = await cursor.fetchall()

        messages = []
        for row in reversed(rows):
            content = row["content"]
            try:
                content = json.loads(content)
            except json.JSONDecodeError:
                pass
            messages.append({"id": row["id"], "role": row["role"], "content": content})
        return messages

    async def list_threads(self, limit: int = 50) -> list[dict[str, Any]]:
        """List threads ordered by most recently updated."""
        async with self._get_db() as db:
            cursor = await db.execute(
                """SELECT t.id, t.title, t.created_at, t.updated_at, 
                          COUNT(m.id) as message_count
                   FROM threads t
                   LEFT JOIN messages m ON t.id = m.thread_id
                   GROUP BY t.id
                   ORDER BY t.updated_at DESC
                   LIMIT ?""",
                (limit,),
            )
            rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def get_thread(self, thread_id: str) -> dict[str, Any] | None:
        """Get thread metadata."""
        async with self._get_db() as db:
            cursor = await db.execute(
                """SELECT t.id, t.title, t.created_at, t.updated_at,
                          COUNT(m.id) as message_count
                   FROM threads t
                   LEFT JOIN messages m ON t.id = m.thread_id
                   WHERE t.id = ?
                   GROUP BY t.id""",
                (thread_id,),
            )
            row = await cursor.fetchone()
        return dict(row) if row else None

    async def delete_thread(self, thread_id: str) -> bool:
        """Delete a thread and its messages."""
        async with self._get_db() as db:
            await db.execute("DELETE FROM messages WHERE thread_id = ?", (thread_id,))
            cursor = await db.execute("DELETE FROM threads WHERE id = ?", (thread_id,))
            await db.commit()
            return cursor.rowcount > 0

    async def delete_all_threads(self) -> int:
        """Delete all threads and messages."""
        async with self._get_db() as db:
            await db.execute("DELETE FROM messages")
            cursor = await db.execute("DELETE FROM threads")
            await db.commit()
            return cursor.rowcount

    async def clear_old_threads(self, keep_count: int = 100) -> int:
        """Delete oldest threads, keeping only the most recent ones."""
        async with self._get_db() as db:
            cursor = await db.execute(
                "SELECT id FROM threads ORDER BY updated_at DESC LIMIT ?",
                (keep_count,),
            )
            keep_ids = {row["id"] for row in await cursor.fetchall()}

            if not keep_ids:
                return 0

            placeholders = ",".join("?" * len(keep_ids))
            await db.execute(
                f"DELETE FROM messages WHERE thread_id NOT IN ({placeholders})",
                tuple(keep_ids),
            )
            cursor = await db.execute(
                f"DELETE FROM threads WHERE id NOT IN ({placeholders})",
                tuple(keep_ids),
            )
            await db.commit()
            return cursor.rowcount
