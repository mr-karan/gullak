"""Gullak agent client using Anthropic Python SDK."""

import json
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import uuid4

from anthropic import AsyncAnthropic

from gullak.config import settings
from gullak.ledger.parser import LedgerParser
from gullak.ledger.writer import LedgerWriter
from gullak.ledger.validator import LedgerValidator

from gullak.chat_history import ChatHistory

from .prompts import get_system_prompt
from .tools import (
    TOOLS,
    get_pending_transactions,
    clear_pending_transaction,
    configure_tools,
    execute_tool,
)


@dataclass
class AgentEvent:
    """Event emitted by the agent during processing."""

    type: str  # "text", "preview", "thinking", "tool_result", "done", "error"
    content: str = ""
    data: dict[str, Any] = field(default_factory=dict)


@dataclass
class GullakAgent:
    """
    Gullak expense tracking agent powered by Claude.

    Manages conversations, tool execution, and ledger integration.
    """

    ledger_path: Path
    default_currency: str = "INR"
    timezone: str = "Asia/Kolkata"
    ledger_cli: str = "ledger"
    model: str = field(default_factory=lambda: settings.anthropic_model)
    conversation_id: str = field(default_factory=lambda: uuid4().hex[:12])

    _parser: LedgerParser = field(default_factory=LedgerParser, init=False)
    _writer: LedgerWriter | None = field(default=None, init=False)
    _validator: LedgerValidator | None = field(default=None, init=False)
    _client: AsyncAnthropic | None = field(default=None, init=False)
    _system_prompt: str = field(default="", init=False)
    _conversation_history: list[dict[str, Any]] = field(default_factory=list, init=False)
    _chat_history: ChatHistory | None = field(default=None, init=False)

    def __post_init__(self) -> None:
        """Initialize agent components."""
        self._validator = LedgerValidator(cli_path=self.ledger_cli)
        self._writer = LedgerWriter(self.ledger_path, self._validator)

        # Configure tools with state
        configure_tools(
            ledger_path=self.ledger_path,
            default_currency=self.default_currency,
            parser=self._parser,
            validator=self._validator,
        )

        # Get existing accounts for system prompt
        accounts = []
        if self.ledger_path.exists():
            accounts = list(self._parser.extract_accounts(self.ledger_path))

        # Build system prompt
        self._system_prompt = get_system_prompt(
            accounts=accounts,
            default_currency=self.default_currency,
            timezone=self.timezone,
        )

        if settings.anthropic_api_key:
            self._client = AsyncAnthropic(api_key=settings.anthropic_api_key)

        db_path = self.ledger_path.parent / "chat_history.db"
        self._chat_history = ChatHistory(db_path)

        if self.conversation_id:
            existing = self._chat_history.load_conversation(self.conversation_id)
            if existing:
                self._conversation_history = existing

    async def process_message(self, user_message: str) -> AsyncIterator[AgentEvent]:
        """
        Process a user message and yield events.

        Args:
            user_message: The user's input text

        Yields:
            AgentEvent objects for streaming to frontend
        """
        if self._client is None:
            yield AgentEvent(
                type="error",
                content="API key not configured. Please set ANTHROPIC_API_KEY in your .env file.",
            )
            return

        self._conversation_history.append({"role": "user", "content": user_message})
        if self._chat_history:
            self._chat_history.save_message(self.conversation_id, "user", user_message)

        try:
            # Agentic loop - keep processing until no more tool calls
            while True:
                # Stream response from Claude
                accumulated_text = ""
                tool_uses = []

                async with self._client.messages.stream(
                    model=self.model,
                    max_tokens=4096,
                    system=self._system_prompt,
                    messages=self._conversation_history,
                    tools=TOOLS,
                ) as stream:
                    async for event in stream:
                        if event.type == "content_block_start":
                            if (
                                hasattr(event.content_block, "type")
                                and event.content_block.type == "tool_use"
                            ):
                                yield AgentEvent(
                                    type="thinking",
                                    content=f"Using {event.content_block.name}...",
                                    data={"tool": event.content_block.name},
                                )

                        elif event.type == "content_block_delta":
                            if hasattr(event.delta, "type"):
                                if event.delta.type == "text_delta":
                                    accumulated_text += event.delta.text
                                    yield AgentEvent(
                                        type="text",
                                        content=event.delta.text,
                                    )

                # Get the full response
                response = await stream.get_final_message()

                # Convert content to serializable format for history
                content_for_history = []
                for block in response.content:
                    if block.type == "text":
                        content_for_history.append({"type": "text", "text": block.text})
                    elif block.type == "tool_use":
                        content_for_history.append(
                            {
                                "type": "tool_use",
                                "id": block.id,
                                "name": block.name,
                                "input": block.input,
                            }
                        )
                        tool_uses.append(block)

                self._conversation_history.append(
                    {"role": "assistant", "content": content_for_history}
                )
                if self._chat_history:
                    self._chat_history.save_message(
                        self.conversation_id, "assistant", content_for_history
                    )

                # Check if there are tool calls to process
                if response.stop_reason == "tool_use" and tool_uses:
                    # Execute tools and add results
                    tool_results = []

                    for tool_use in tool_uses:
                        # Execute the tool
                        result = self._execute_tool_sync(tool_use.name, tool_use.input)

                        tool_results.append(
                            {"type": "tool_result", "tool_use_id": tool_use.id, "content": result}
                        )

                        # Parse result for preview events
                        try:
                            result_data = json.loads(result)
                            if (
                                isinstance(result_data, dict)
                                and result_data.get("status") == "pending"
                            ):
                                yield AgentEvent(
                                    type="preview",
                                    content=result_data.get("preview", ""),
                                    data=result_data,
                                )
                            else:
                                yield AgentEvent(
                                    type="tool_result",
                                    content=result,
                                    data=result_data
                                    if isinstance(result_data, dict)
                                    else {"text": result},
                                )
                        except json.JSONDecodeError:
                            yield AgentEvent(
                                type="tool_result",
                                content=result,
                                data={"text": result},
                            )

                    self._conversation_history.append({"role": "user", "content": tool_results})
                    if self._chat_history:
                        self._chat_history.save_message(self.conversation_id, "user", tool_results)

                    continue

                # No more tool calls, we're done
                break

            yield AgentEvent(type="done", data={"message_count": len(self._conversation_history)})

        except Exception as e:
            yield AgentEvent(type="error", content=str(e))

    def _execute_tool_sync(self, name: str, args: dict[str, Any]) -> str:
        """Execute a tool synchronously."""
        return execute_tool(name, args)

    async def confirm_transaction(self, txn_id: str) -> tuple[bool, str]:
        """
        Confirm and write a pending transaction to the ledger.

        Returns:
            Tuple of (success, message)
        """
        pending = clear_pending_transaction(txn_id)

        if pending is None:
            return False, f"Transaction {txn_id} not found"

        if self._writer is None:
            return False, "Writer not initialized"

        try:
            await self._writer.append_transaction(pending.transaction)
            return True, f"Transaction saved: {pending.transaction.payee}"
        except Exception as e:
            # Put transaction back if write failed
            get_pending_transactions()[txn_id] = pending
            return False, f"Failed to write transaction: {e}"

    def cancel_transaction(self, txn_id: str) -> bool:
        """Cancel a pending transaction."""
        return clear_pending_transaction(txn_id) is not None

    def get_pending(self) -> list[dict[str, Any]]:
        """Get all pending transactions."""
        return [
            {
                "id": p.id,
                "preview": p.ledger_preview,
                "source_text": p.source_text,
                "created_at": p.created_at.isoformat(),
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
            for p in get_pending_transactions().values()
        ]

    def clear_history(self) -> None:
        """Clear conversation history and start new conversation."""
        self._conversation_history = []
        self.conversation_id = uuid4().hex[:12]
