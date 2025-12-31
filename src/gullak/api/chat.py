"""Chat API endpoint with SSE streaming."""

import json
from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    """Chat message request."""

    message: str
    conversation_id: str | None = None


class ConfirmRequest(BaseModel):
    """Transaction confirmation request."""

    transaction_id: str


class ConfirmResponse(BaseModel):
    """Transaction confirmation response."""

    success: bool
    message: str


@router.post("")
async def chat(request: Request, body: ChatMessage):
    """
    Process a chat message and stream the response.

    Returns Server-Sent Events with the following event types:
    - text: Text content from the agent
    - preview: A pending transaction preview
    - thinking: Agent is using a tool
    - tool_result: Result from a tool
    - done: Processing complete
    - error: An error occurred
    """
    agent = request.app.state.agent

    async def event_generator():
        try:
            async for event in agent.process_message(body.message):
                yield {
                    "event": event.type,
                    "data": json.dumps(
                        {
                            "type": event.type,
                            "content": event.content,
                            "data": event.data,
                        }
                    ),
                }
        except Exception as e:
            yield {
                "event": "error",
                "data": json.dumps(
                    {
                        "type": "error",
                        "content": str(e),
                        "data": {},
                    }
                ),
            }

    return EventSourceResponse(event_generator())


@router.post("/confirm")
async def confirm_transaction(request: Request, body: ConfirmRequest) -> ConfirmResponse:
    """Confirm and write a pending transaction to the ledger."""
    agent = request.app.state.agent

    success, message = await agent.confirm_transaction(body.transaction_id)

    return ConfirmResponse(success=success, message=message)


@router.post("/cancel")
async def cancel_transaction(request: Request, body: ConfirmRequest) -> ConfirmResponse:
    """Cancel a pending transaction."""
    agent = request.app.state.agent

    if agent.cancel_transaction(body.transaction_id):
        return ConfirmResponse(success=True, message="Transaction cancelled")
    else:
        return ConfirmResponse(success=False, message="Transaction not found")


@router.get("/pending")
async def get_pending(request: Request) -> list[dict[str, Any]]:
    """Get all pending transactions."""
    agent = request.app.state.agent
    return agent.get_pending()
