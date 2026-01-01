"""Chat API endpoint with SSE streaming."""

import json
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Request, UploadFile
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

router = APIRouter(prefix="/chat", tags=["chat"])


class ChatMessage(BaseModel):
    """Chat message request."""

    message: str
    thread_id: str | None = None


class ConfirmRequest(BaseModel):
    """Transaction confirmation request."""

    transaction_id: str
    thread_id: str | None = None


class ConfirmResponse(BaseModel):
    """Transaction confirmation response."""

    success: bool
    message: str


class BatchConfirmRequest(BaseModel):
    """Batch transaction confirmation request."""

    transaction_ids: list[str]
    thread_id: str | None = None


class ThreadFilterRequest(BaseModel):
    """Request with optional thread filter."""

    thread_id: str | None = None


class UpdatePendingRequest(BaseModel):
    """Update pending transaction request."""

    transaction_id: str
    updates: dict


@router.post("")
async def chat(request: Request, body: ChatMessage):
    """
    Process a chat message and stream the response.

    Returns Server-Sent Events with the following event types:
    - text: Text content from the agent
    - preview: A pending transaction preview
    - thinking: Agent is using a tool
    - tool_result: Result from a tool
    - done: Processing complete (includes thread_id)
    - error: An error occurred
    """
    agent = request.app.state.agent

    async def event_generator():
        try:
            async for event in agent.process_message(body.message, thread_id=body.thread_id):
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
async def get_pending(request: Request, thread_id: str | None = None) -> list[dict[str, Any]]:
    """Get pending transactions, optionally filtered by thread."""
    agent = request.app.state.agent
    return agent.get_pending(thread_id=thread_id)


@router.post("/upload")
async def upload_file(request: Request, file: UploadFile) -> dict:
    """Upload a CSV file for import."""
    if not file.filename:
        return {"success": False, "error": "No file provided"}

    if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        return {"success": False, "error": "Only CSV and Excel files are supported"}

    try:
        suffix = Path(file.filename).suffix
        with tempfile.NamedTemporaryFile(mode="wb", suffix=suffix, delete=False) as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        return {
            "success": True,
            "file_path": tmp_path,
            "filename": file.filename,
            "message": f"File '{file.filename}' uploaded. Use chat to import it.",
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/confirm-all")
async def confirm_all_transactions(
    request: Request, body: ThreadFilterRequest | None = None
) -> dict:
    """Confirm all pending transactions for a thread."""
    agent = request.app.state.agent
    thread_id = body.thread_id if body else None
    pending = agent.get_pending(thread_id=thread_id)

    results = []
    success_count = 0

    for txn in pending:
        success, message = await agent.confirm_transaction(txn["id"])
        results.append({"id": txn["id"], "success": success, "message": message})
        if success:
            success_count += 1

    return {
        "success": True,
        "confirmed": success_count,
        "total": len(pending),
        "results": results,
        "message": f"Confirmed {success_count} of {len(pending)} transactions",
    }


@router.post("/cancel-all")
async def cancel_all_transactions(
    request: Request, body: ThreadFilterRequest | None = None
) -> dict:
    """Cancel all pending transactions for a thread."""
    agent = request.app.state.agent
    thread_id = body.thread_id if body else None
    pending = agent.get_pending(thread_id=thread_id)

    cancelled = 0
    for txn in pending:
        if agent.cancel_transaction(txn["id"]):
            cancelled += 1

    return {
        "success": True,
        "cancelled": cancelled,
        "message": f"Cancelled {cancelled} transactions",
    }


@router.post("/update-pending")
async def update_pending(request: Request, body: UpdatePendingRequest) -> dict:
    """Update a pending transaction before confirmation."""
    agent = request.app.state.agent

    result = agent.update_pending(body.transaction_id, body.updates)

    if result is None:
        return {"success": False, "error": "Transaction not found"}

    return {
        "success": True,
        "preview": result["preview"],
        "message": "Transaction updated",
    }
