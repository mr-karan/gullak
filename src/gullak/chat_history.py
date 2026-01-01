import contextlib
import json
from contextlib import asynccontextmanager
from datetime import datetime
from pathlib import Path
from typing import Any

import aiosqlite


class _SQL:
    INSERT_THREAD = """
        INSERT OR IGNORE INTO threads (id, title, created_at, updated_at)
        VALUES (:id, :title, :created_at, :updated_at)
    """

    UPDATE_THREAD_TITLE = """
        UPDATE threads SET title = :title, updated_at = :updated_at
        WHERE id = :id AND title IS NULL
    """

    TOUCH_THREAD = "UPDATE threads SET updated_at = :updated_at WHERE id = :id"

    INSERT_MESSAGE = """
        INSERT INTO messages (thread_id, role, content, created_at)
        VALUES (:thread_id, :role, :content, :created_at)
    """

    GET_THREAD_TITLE = "SELECT title FROM threads WHERE id = :id"

    SET_THREAD_TITLE = "UPDATE threads SET title = :title WHERE id = :id"

    LOAD_MESSAGES = """
        SELECT id, role, content FROM messages
        WHERE thread_id = :thread_id
        ORDER BY id DESC LIMIT :limit
    """

    LOAD_MESSAGES_BEFORE = """
        SELECT id, role, content FROM messages
        WHERE thread_id = :thread_id AND id < :before_id
        ORDER BY id DESC LIMIT :limit
    """

    LIST_THREADS = """
        SELECT t.id, t.title, t.created_at, t.updated_at, COUNT(m.id) as message_count
        FROM threads t
        LEFT JOIN messages m ON t.id = m.thread_id
        GROUP BY t.id
        ORDER BY t.updated_at DESC
        LIMIT :limit
    """

    GET_THREAD = """
        SELECT t.id, t.title, t.created_at, t.updated_at, COUNT(m.id) as message_count
        FROM threads t
        LEFT JOIN messages m ON t.id = m.thread_id
        WHERE t.id = :id
        GROUP BY t.id
    """

    DELETE_THREAD_MESSAGES = "DELETE FROM messages WHERE thread_id = :thread_id"
    DELETE_THREAD = "DELETE FROM threads WHERE id = :id"

    DELETE_ALL_MESSAGES = "DELETE FROM messages"
    DELETE_ALL_THREADS = "DELETE FROM threads"

    CLEAR_OLD_MESSAGES = """
        DELETE FROM messages WHERE thread_id NOT IN (
            SELECT id FROM threads ORDER BY updated_at DESC LIMIT :keep_count
        )
    """

    CLEAR_OLD_THREADS = """
        DELETE FROM threads WHERE id NOT IN (
            SELECT id FROM threads ORDER BY updated_at DESC LIMIT :keep_count
        )
    """


class ChatHistory:
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
            await db.execute("PRAGMA foreign_keys=ON")

            cursor = await db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'"
            )
            messages_exists = await cursor.fetchone() is not None

            if messages_exists:
                cursor = await db.execute("PRAGMA table_info(messages)")
                columns = {row[1] for row in await cursor.fetchall()}
                if "thread_id" not in columns:
                    await db.execute("ALTER TABLE messages RENAME TO messages_old")
                    await db.commit()
                    messages_exists = False

            await db.execute("""
                CREATE TABLE IF NOT EXISTS threads (
                    id TEXT PRIMARY KEY,
                    title TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)

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

            cursor = await db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='messages_old'"
            )
            if await cursor.fetchone():
                now = datetime.now().isoformat()
                await db.execute(
                    _SQL.INSERT_THREAD,
                    {
                        "id": "legacy",
                        "title": "Previous Conversations",
                        "created_at": now,
                        "updated_at": now,
                    },
                )
                await db.execute(
                    """
                    INSERT INTO messages (thread_id, role, content, created_at)
                    SELECT 'legacy', role, content, COALESCE(created_at, :now)
                    FROM messages_old
                    """,
                    {"now": now},
                )
                await db.execute("DROP TABLE messages_old")

            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, id)
            """)
            await db.execute("""
                CREATE INDEX IF NOT EXISTS idx_threads_updated ON threads(updated_at DESC)
            """)
            await db.commit()
        self._initialized = True

    @asynccontextmanager
    async def _get_db(self):
        await self._ensure_initialized()
        async with aiosqlite.connect(self.db_path) as db:
            await db.execute("PRAGMA foreign_keys=ON")
            db.row_factory = aiosqlite.Row
            yield db

    async def create_thread(self, thread_id: str | None = None, title: str | None = None) -> str:
        if thread_id is None:
            thread_id = uuid4().hex[:12]
        now = datetime.now().isoformat()
        async with self._get_db() as db:
            await db.execute(
                _SQL.INSERT_THREAD,
                {"id": thread_id, "title": title, "created_at": now, "updated_at": now},
            )
            await db.commit()
        return thread_id

    async def update_thread_title(self, thread_id: str, title: str) -> None:
        now = datetime.now().isoformat()
        async with self._get_db() as db:
            await db.execute(
                _SQL.UPDATE_THREAD_TITLE,
                {"id": thread_id, "title": title, "updated_at": now},
            )
            await db.commit()

    async def save_message(
        self, thread_id: str, role: str, content: list[dict[str, Any]] | str
    ) -> None:
        now = datetime.now().isoformat()
        content_str = json.dumps(content) if isinstance(content, list) else content

        async with self._get_db() as db:
            await db.execute(
                _SQL.INSERT_THREAD,
                {"id": thread_id, "title": None, "created_at": now, "updated_at": now},
            )
            await db.execute(_SQL.TOUCH_THREAD, {"id": thread_id, "updated_at": now})
            await db.execute(
                _SQL.INSERT_MESSAGE,
                {"thread_id": thread_id, "role": role, "content": content_str, "created_at": now},
            )
            await db.commit()

            if role == "user" and isinstance(content, str):
                async with db.execute(_SQL.GET_THREAD_TITLE, {"id": thread_id}) as cursor:
                    row = await cursor.fetchone()
                if row and row["title"] is None:
                    title = content[:50].strip()
                    if len(content) > 50:
                        title += "..."
                    await db.execute(_SQL.SET_THREAD_TITLE, {"id": thread_id, "title": title})
                    await db.commit()

    async def load_messages(
        self, thread_id: str, limit: int = 50, before_id: int | None = None
    ) -> list[dict[str, Any]]:
        async with self._get_db() as db:
            if before_id:
                async with db.execute(
                    _SQL.LOAD_MESSAGES_BEFORE,
                    {"thread_id": thread_id, "before_id": before_id, "limit": limit},
                ) as cursor:
                    rows = await cursor.fetchall()
            else:
                async with db.execute(
                    _SQL.LOAD_MESSAGES, {"thread_id": thread_id, "limit": limit}
                ) as cursor:
                    rows = await cursor.fetchall()

        messages = []
        for row in reversed(rows):
            content = row["content"]
            with contextlib.suppress(json.JSONDecodeError):
                content = json.loads(content)
            messages.append({"id": row["id"], "role": row["role"], "content": content})
        return messages

    async def list_threads(self, limit: int = 50) -> list[dict[str, Any]]:
        async with self._get_db() as db:
            cursor = await db.execute(_SQL.LIST_THREADS, {"limit": limit})
            rows = await cursor.fetchall()
        return [dict(row) for row in rows]

    async def get_thread(self, thread_id: str) -> dict[str, Any] | None:
        async with self._get_db() as db:
            cursor = await db.execute(_SQL.GET_THREAD, {"id": thread_id})
            row = await cursor.fetchone()
        return dict(row) if row else None

    async def delete_thread(self, thread_id: str) -> bool:
        async with self._get_db() as db:
            await db.execute(_SQL.DELETE_THREAD_MESSAGES, {"thread_id": thread_id})
            async with db.execute(_SQL.DELETE_THREAD, {"id": thread_id}) as cursor:
                rowcount = cursor.rowcount
            await db.commit()
            return rowcount > 0

    async def delete_all_threads(self) -> int:
        async with self._get_db() as db:
            await db.execute(_SQL.DELETE_ALL_MESSAGES)
            async with db.execute(_SQL.DELETE_ALL_THREADS) as cursor:
                rowcount = cursor.rowcount
            await db.commit()
            return rowcount

    async def clear_old_threads(self, keep_count: int = 100) -> int:
        async with self._get_db() as db:
            await db.execute(_SQL.CLEAR_OLD_MESSAGES, {"keep_count": keep_count})
            async with db.execute(_SQL.CLEAR_OLD_THREADS, {"keep_count": keep_count}) as cursor:
                rowcount = cursor.rowcount
            await db.commit()
            return rowcount


from uuid import uuid4  # noqa: E402
