"""Base types for tool definitions."""

import json
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel


@dataclass
class ToolResult:
    """Result from a tool execution."""

    success: bool
    data: dict[str, Any]
    message: str = ""
    error: str | None = None

    def to_json(self) -> str:
        """Serialize for LLM consumption."""
        return json.dumps(
            {
                "success": self.success,
                "message": self.message,
                "error": self.error,
                "data": self.data,
            },
            default=str,
        )


@dataclass
class ToolDefinition:
    """Definition of a tool for the agent."""

    name: str
    description: str
    input_model: type[BaseModel]
    executor: Callable[[Any, Any], ToolResult | Awaitable[ToolResult]]
    is_async: bool = False
