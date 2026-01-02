"""Gullak agent client using LiteLLM for multi-provider LLM access.

Implements a minimal agentic loop with streaming support.
"""

import json
import logging
import os
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

# Keep LiteLLM logs quiet unless explicitly enabled.
os.environ.setdefault("LITELLM_LOG", "WARNING")

import litellm

litellm.suppress_debug_info = True

from gullak.chat_history import ChatHistory
from gullak.ledger.parser import LedgerParser
from gullak.ledger.validator import LedgerValidator
from gullak.ledger.writer import LedgerWriter
from gullak.settings import settings

from gullak.media import MediaContent

from .prompts import get_system_prompt
from .tool_state import ToolState
from .tools import TOOLS, ToolResult, execute_tool, get_openai_tools

logger = logging.getLogger(__name__)

# Maximum iterations to prevent infinite loops
MAX_AGENT_ITERATIONS = 10


@dataclass
class AgentEvent:
    """Event emitted by the agent during processing.

    Event types:
    - "text": Streaming text content from the assistant
    - "thinking": Agent is using a tool (shows tool name)
    - "tool_result": Result from a tool execution
    - "preview": Pending transaction preview (special handling for UI)
    - "done": Processing complete
    - "error": An error occurred
    """

    type: str
    content: str = ""
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class GullakAgent:
    """
    Gullak expense tracking agent powered by LiteLLM.

    Uses LiteLLM for provider-agnostic LLM access (supports OpenRouter, Gemini,
    Anthropic, OpenAI, Ollama, etc.)

    The agent implements a simple agentic loop:
    1. Send user message + tools to LLM
    2. Stream response text to frontend
    3. If tool calls present, execute them sequentially
    4. Append tool results to messages
    5. Repeat until no more tool calls or max iterations reached
    """

    ledger_path: Path
    default_currency: str = "INR"
    timezone: str = "Asia/Kolkata"
    ledger_cli: str = "ledger"
    model: str = field(default_factory=lambda: settings.inference_model)

    _parser: LedgerParser = field(default_factory=LedgerParser, init=False)
    _writer: LedgerWriter | None = field(default=None, init=False)
    _validator: LedgerValidator | None = field(default=None, init=False)
    _tool_state: ToolState | None = field(default=None, init=False)
    _system_prompt: str = field(default="", init=False)
    _chat_history: ChatHistory | None = field(default=None, init=False)
    _tools: list[dict[str, Any]] = field(default_factory=list, init=False)

    def __post_init__(self) -> None:
        """Initialize the agent components."""
        self._validator = LedgerValidator(cli_path=self.ledger_cli)
        self._writer = LedgerWriter(self.ledger_path, self._validator, settings.paisa_url)

        # Initialize tool state with dependency injection
        self._tool_state = ToolState(
            ledger_path=self.ledger_path,
            default_currency=self.default_currency,
            parser=self._parser,
            validator=self._validator,
        )

        # Get accounts for system prompt
        accounts: list[str] = []
        if self.ledger_path.exists():
            accounts = list(self._parser.extract_accounts(self.ledger_path))

        self._system_prompt = get_system_prompt(
            accounts=accounts,
            default_currency=self.default_currency,
            timezone=self.timezone,
        )

        # Generate OpenAI-format tool definitions
        self._tools = get_openai_tools()

        # Initialize chat history
        db_path = self.ledger_path.parent / "chat_history.db"
        self._chat_history = ChatHistory(db_path)

        # Check API key
        api_key = settings.inference_api_key
        if not api_key:
            logger.warning(
                f"No API key found for model {self.model}. "
                "Set OPENROUTER_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY, or ANTHROPIC_API_KEY."
            )

    async def process_message(
        self,
        user_message: str,
        thread_id: str | None = None,
        media: MediaContent | list[MediaContent] | None = None,
    ) -> AsyncIterator[AgentEvent]:
        """
        Process a user message and yield events.

        This method implements the agentic loop with streaming.

        Args:
            user_message: The user's input text
            thread_id: Optional thread ID for conversation continuity
            media: Optional media content (images/PDFs) for vision processing

        Yields:
            AgentEvent objects for streaming to frontend
        """
        api_key = settings.inference_api_key
        if not api_key:
            yield AgentEvent(
                type="error",
                content="API key not configured. Set OPENROUTER_API_KEY or provider-specific key.",
            )
            return

        # Generate thread_id if not provided
        if thread_id is None:
            thread_id = uuid4().hex[:12]

        # Set thread context for pending transactions
        if self._tool_state:
            self._tool_state.set_thread_id(thread_id)

        # Load conversation history
        messages: list[dict[str, Any]] = [{"role": "system", "content": self._system_prompt}]

        if self._chat_history:
            loaded = await self._chat_history.load_messages(thread_id, limit=20)
            for m in loaded:
                messages.append({"role": m["role"], "content": m["content"]})

        # Build user message content (multimodal if media present)
        if media:
            content_parts: list[dict[str, Any]] = []

            if user_message.strip():
                content_parts.append({"type": "text", "text": user_message})
            else:
                content_parts.append(
                    {
                        "type": "text",
                        "text": "Please analyze this receipt/document and extract expense information.",
                    }
                )

            if isinstance(media, list):
                for m in media:
                    content_parts.append(m.to_message_content())
            else:
                content_parts.append(media.to_message_content())

            messages.append({"role": "user", "content": content_parts})
        else:
            messages.append({"role": "user", "content": user_message})

        if self._chat_history:
            await self._chat_history.save_message(thread_id, "user", user_message)

        try:
            # Run the agentic loop
            assistant_response = ""
            iteration = 0

            while iteration < MAX_AGENT_ITERATIONS:
                iteration += 1
                logger.debug(f"Agent iteration {iteration}/{MAX_AGENT_ITERATIONS}")

                # Call LLM with streaming
                chunks: list[Any] = []
                current_text = ""

                response = await litellm.acompletion(
                    model=self.model,
                    messages=messages,
                    tools=self._tools if self._tools else None,
                    tool_choice="auto" if self._tools else None,
                    stream=True,
                    api_key=api_key,
                    base_url=settings.inference_base_url,
                )

                # Stream text chunks to frontend
                async for chunk in response:
                    chunks.append(chunk)

                    # Extract and stream text content
                    if chunk.choices and chunk.choices[0].delta:
                        delta = chunk.choices[0].delta
                        if hasattr(delta, "content") and delta.content:
                            current_text += delta.content
                            yield AgentEvent(type="text", content=delta.content)

                # Reconstruct full response to get tool calls
                full_response = litellm.stream_chunk_builder(chunks, messages=messages)

                if not full_response or not full_response.choices:
                    logger.warning("Empty response from LLM")
                    break

                response_message = full_response.choices[0].message
                assistant_response += current_text

                # Check for tool calls
                tool_calls = getattr(response_message, "tool_calls", None)

                if not tool_calls:
                    # No tool calls - we're done
                    break

                # Append assistant message with tool calls to conversation
                messages.append(response_message.model_dump())

                # Execute tools sequentially (important for stateful operations like ledger writes)
                for tool_call in tool_calls:
                    function_name = tool_call.function.name
                    tool_call_id = tool_call.id

                    # Notify frontend that we're using a tool
                    yield AgentEvent(
                        type="thinking",
                        content=f"Using {function_name}...",
                        data={"tool": function_name, "tool_call_id": tool_call_id},
                    )

                    # Parse arguments
                    try:
                        arguments = json.loads(tool_call.function.arguments)
                    except json.JSONDecodeError as e:
                        logger.error(f"Invalid tool arguments: {e}")
                        arguments = {}

                    # Execute the tool
                    result = execute_tool(function_name, arguments, self._tool_state)

                    # Emit appropriate event based on result
                    if result.is_pending:
                        # Special handling for pending transaction previews
                        yield AgentEvent(
                            type="preview",
                            content=result.message,
                            data={
                                "id": result.data.get("id", ""),
                                "preview": result.data.get("preview", ""),
                                "transaction": result.data.get("transaction", {}),
                                "status": "pending",
                            },
                        )
                    else:
                        yield AgentEvent(
                            type="tool_result",
                            content=result.message,
                            data=result.data,
                        )

                    # Append tool result to messages
                    messages.append(
                        {
                            "tool_call_id": tool_call_id,
                            "role": "tool",
                            "name": function_name,
                            "content": result.to_json(),
                        }
                    )

            # Save assistant response to history
            if self._chat_history and assistant_response:
                await self._chat_history.save_message(thread_id, "assistant", assistant_response)

            yield AgentEvent(
                type="done",
                data={"thread_id": thread_id, "iterations": iteration},
            )

        except Exception as e:
            logger.exception(f"Error processing message: {e}")
            yield AgentEvent(type="error", content=str(e))

    async def confirm_transaction(self, txn_id: str) -> tuple[bool, str]:
        """
        Confirm and write a pending transaction to the ledger.

        Returns:
            Tuple of (success, message)
        """
        if not self._tool_state:
            return False, "Tool state not initialized"

        pending = self._tool_state.clear_pending(txn_id)

        if pending is None:
            return False, f"Transaction {txn_id} not found"

        if self._writer is None:
            return False, "Writer not initialized"

        try:
            await self._writer.append_transaction(pending.transaction)
            return True, f"Transaction saved: {pending.transaction.payee}"
        except Exception as e:
            # Restore pending on failure
            self._tool_state.add_pending(pending)
            return False, f"Failed to write transaction: {e}"

    async def undo_transaction(self, txn_id: str) -> tuple[bool, str]:
        """
        Undo a previously saved transaction by ID.

        Returns:
            Tuple of (success, message)
        """
        if self._writer is None:
            return False, "Writer not initialized"

        try:
            deleted = await self._writer.delete_transaction(txn_id)
            if deleted:
                return True, "Transaction undone"
            return False, "Transaction not found"
        except Exception as e:
            return False, f"Failed to undo transaction: {e}"

    def cancel_transaction(self, txn_id: str) -> bool:
        """Cancel a pending transaction."""
        if not self._tool_state:
            return False
        return self._tool_state.clear_pending(txn_id) is not None

    def get_pending(self, thread_id: str | None = None) -> list[dict[str, Any]]:
        """Get pending transactions, optionally filtered by thread."""
        if not self._tool_state:
            return []

        return [
            {
                "id": p.id,
                "preview": p.ledger_preview,
                "source_text": p.source_text,
                "created_at": p.created_at.isoformat(),
                "thread_id": p.thread_id,
                "transaction": {
                    "date": str(p.transaction.date),
                    "payee": p.transaction.payee,
                    "amount": float(p.transaction.total_amount),
                    "currency": p.transaction.postings[0].currency
                    if p.transaction.postings
                    else self.default_currency,
                    "expense_account": p.transaction.postings[0].account
                    if p.transaction.postings
                    else "",
                    "payment_account": p.transaction.postings[1].account
                    if len(p.transaction.postings) > 1
                    else "",
                },
            }
            for p in self._tool_state.get_pending(thread_id=thread_id).values()
        ]

    def update_pending(self, txn_id: str, updates: dict[str, Any]) -> dict[str, Any] | None:
        """Update a pending transaction."""
        if not self._tool_state:
            return None

        pending = self._tool_state.update_pending(txn_id, updates)
        if pending is None:
            return None

        return {
            "id": pending.id,
            "preview": pending.ledger_preview,
            "transaction": {
                "date": str(pending.transaction.date),
                "payee": pending.transaction.payee,
                "amount": float(pending.transaction.total_amount),
                "currency": pending.transaction.postings[0].currency
                if pending.transaction.postings
                else self.default_currency,
                "expense_account": pending.transaction.postings[0].account
                if pending.transaction.postings
                else "",
                "payment_account": pending.transaction.postings[1].account
                if len(pending.transaction.postings) > 1
                else "",
            },
        }

    def get_chat_history(self) -> ChatHistory | None:
        """Get the chat history instance for thread management."""
        return self._chat_history
