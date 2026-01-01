"""SQLite-based chat history persistence."""

import contextlib
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any


class ChatHistory:
    """Persist chat conversations to SQLite."""

    def __init__(self, db_path: Path):
        self.db_path = db_path
        self._init_db()

    def _init_db(self) -> None:
        """Initialize database schema."""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS conversations (
                    id TEXT PRIMARY KEY,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    conversation_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_messages_conversation 
                ON messages(conversation_id)
            """)
            conn.commit()

    def create_conversation(self, conversation_id: str) -> None:
        """Create a new conversation."""
        now = datetime.now().isoformat()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "INSERT OR IGNORE INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)",
                (conversation_id, now, now),
            )
            conn.commit()

    def save_message(
        self, conversation_id: str, role: str, content: list[dict[str, Any]] | str
    ) -> None:
        """Save a message to the conversation."""
        now = datetime.now().isoformat()

        # Serialize content if it's a list (for assistant messages with tool_use)
        content_str = json.dumps(content) if isinstance(content, list) else content

        with sqlite3.connect(self.db_path) as conn:
            # Ensure conversation exists
            conn.execute(
                "INSERT OR IGNORE INTO conversations (id, created_at, updated_at) VALUES (?, ?, ?)",
                (conversation_id, now, now),
            )
            # Update conversation timestamp
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conversation_id)
            )
            # Insert message
            sql = "INSERT INTO messages (conversation_id, role, content, created_at)"
            conn.execute(f"{sql} VALUES (?, ?, ?, ?)", (conversation_id, role, content_str, now))
            conn.commit()

    def load_conversation(self, conversation_id: str) -> list[dict[str, Any]]:
        """Load all messages for a conversation."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id",
                (conversation_id,),
            )
            messages = []
            for row in cursor:
                content = row["content"]
                # Try to parse as JSON (for assistant messages)
                with contextlib.suppress(json.JSONDecodeError):
                    content = json.loads(content)
                messages.append({"role": row["role"], "content": content})
            return messages

    def list_conversations(self, limit: int = 20) -> list[dict[str, Any]]:
        """List recent conversations."""
        with sqlite3.connect(self.db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.execute(
                """
                SELECT c.id, c.created_at, c.updated_at, COUNT(m.id) as message_count
                FROM conversations c
                LEFT JOIN messages m ON c.id = m.conversation_id
                GROUP BY c.id
                ORDER BY c.updated_at DESC
                LIMIT ?
                """,
                (limit,),
            )
            return [dict(row) for row in cursor]

    def delete_conversation(self, conversation_id: str) -> bool:
        """Delete a conversation and its messages."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))
            cursor = conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
            conn.commit()
            return cursor.rowcount > 0

    def clear_old_conversations(self, keep_count: int = 50) -> int:
        """Delete oldest conversations, keeping only the most recent ones."""
        with sqlite3.connect(self.db_path) as conn:
            # Get IDs of conversations to keep
            cursor = conn.execute(
                "SELECT id FROM conversations ORDER BY updated_at DESC LIMIT ?", (keep_count,)
            )
            keep_ids = {row[0] for row in cursor}

            if not keep_ids:
                return 0

            # Delete old conversations
            placeholders = ",".join("?" * len(keep_ids))
            cursor = conn.execute(
                f"DELETE FROM messages WHERE conversation_id NOT IN ({placeholders})",
                tuple(keep_ids),
            )
            cursor = conn.execute(
                f"DELETE FROM conversations WHERE id NOT IN ({placeholders})", tuple(keep_ids)
            )
            conn.commit()
            return cursor.rowcount
