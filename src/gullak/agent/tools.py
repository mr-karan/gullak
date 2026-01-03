"""Gullak tools registry.

Aggregates all tool definitions from domain-specific modules.
"""

import logging
from typing import Any

from gullak.agent.tool_state import ToolState
from gullak.agent.tools_base import ToolDefinition, ToolResult
from gullak.agent.tools_config import CONFIG_TOOLS
from gullak.agent.tools_import import IMPORT_TOOLS
from gullak.agent.tools_query import QUERY_TOOLS
from gullak.agent.tools_transactions import TRANSACTION_TOOLS

logger = logging.getLogger(__name__)

# Re-export for backwards compatibility
__all__ = ["ToolResult", "ToolDefinition", "TOOLS", "execute_tool", "get_openai_tools"]

# Combine all tools from domain modules
TOOLS: dict[str, ToolDefinition] = {
    **TRANSACTION_TOOLS,
    **QUERY_TOOLS,
    **IMPORT_TOOLS,
    **CONFIG_TOOLS,
}


def get_openai_tools() -> list[dict[str, Any]]:
    """Generate OpenAI-compatible tool definitions from Pydantic models."""
    tools = []
    for name, tool_def in TOOLS.items():
        schema = tool_def.input_model.model_json_schema()
        schema.pop("title", None)

        tools.append(
            {
                "type": "function",
                "function": {
                    "name": name,
                    "description": tool_def.description,
                    "parameters": schema,
                },
            }
        )
    return tools


async def execute_tool(name: str, arguments: dict[str, Any], state: ToolState) -> ToolResult:
    """Execute a tool by name with given arguments."""
    tool_def = TOOLS.get(name)
    if not tool_def:
        return ToolResult(success=False, error=f"Unknown tool: {name}", data={})

    try:
        input_obj = tool_def.input_model.model_validate(arguments)
        if tool_def.is_async:
            return await tool_def.executor(state, input_obj)
        else:
            return tool_def.executor(state, input_obj)
    except Exception as e:
        logger.exception(f"Error executing tool {name}: {e}")
        return ToolResult(success=False, error=str(e), data={})
