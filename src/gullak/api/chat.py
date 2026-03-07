"""Chat API endpoint with SSE streaming."""

import asyncio
import json
import logging
import tempfile
from collections.abc import AsyncIterator
from decimal import Decimal
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Request, UploadFile
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from gullak.agent import AgentEvent
from gullak.ledger.models import TransactionSource
from gullak.media import MediaContent, MediaProcessor
from gullak.settings import settings

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/chat", tags=["chat"])

SSE_PING_INTERVAL = 15

_thread_locks: dict[str, asyncio.Lock] = {}


def _get_thread_lock(thread_id: str) -> asyncio.Lock:
    if thread_id not in _thread_locks:
        _thread_locks[thread_id] = asyncio.Lock()
    return _thread_locks[thread_id]


async def _create_sse_generator(
    request: Request,
    agent_stream: AsyncIterator[AgentEvent],
    thread_lock: asyncio.Lock,
) -> AsyncIterator[dict[str, Any]]:
    """Create SSE generator with disconnect handling and keepalive.

    Handles:
    - Client disconnect detection (stops agent when browser closes)
    - asyncio.CancelledError for graceful shutdown
    - Ping interval to prevent proxy timeouts on long tool calls
    """
    async with thread_lock:
        try:
            async for event in agent_stream:
                if await request.is_disconnected():
                    logger.info("SSE client disconnected, stopping agent stream")
                    break
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
        except asyncio.CancelledError:
            logger.debug("SSE stream cancelled")
            return
        except Exception as e:
            logger.exception(f"SSE stream error: {e}")
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


class PendingTransactionUpdates(BaseModel):
    """Typed fields for updating a pending transaction."""

    payee: str | None = None
    date: str | None = None
    amount: Decimal | None = Field(default=None, gt=0)
    expense_account: str | None = None
    payment_account: str | None = None
    currency: str | None = None
    note: str | None = None


class UpdatePendingRequest(BaseModel):
    """Update pending transaction request."""

    transaction_id: str
    updates: PendingTransactionUpdates


class ChatMessageWithMedia(BaseModel):
    """Chat message with optional media attachment."""

    message: str = ""
    thread_id: str | None = None
    media: dict | None = None


@router.post("")
async def chat(request: Request, body: ChatMessage):
    agent = request.app.state.agent

    thread_id = body.thread_id or f"web:{uuid4().hex[:12]}"
    thread_lock = _get_thread_lock(thread_id)

    agent_stream = agent.process_message(
        body.message,
        thread_id=thread_id,
        source=TransactionSource.WEB,
    )
    generator = _create_sse_generator(request, agent_stream, thread_lock)

    return EventSourceResponse(generator, ping=SSE_PING_INTERVAL)


@router.post("/confirm")
async def confirm_transaction(request: Request, body: ConfirmRequest) -> ConfirmResponse:
    """Confirm and write a pending transaction to the ledger."""
    agent = request.app.state.agent

    success, message = await agent.confirm_transaction(body.transaction_id)

    return ConfirmResponse(success=success, message=message)


@router.post("/undo")
async def undo_transaction(request: Request, body: ConfirmRequest) -> ConfirmResponse:
    """Undo a saved transaction."""
    agent = request.app.state.agent

    success, message = await agent.undo_transaction(body.transaction_id)

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

    result = agent.update_pending(body.transaction_id, body.updates.model_dump(exclude_none=True))

    if result is None:
        return {"success": False, "error": "Transaction not found"}

    return {
        "success": True,
        "preview": result["preview"],
        "message": "Transaction updated",
    }


@router.post("/upload-receipt")
async def upload_receipt(request: Request, file: UploadFile) -> dict:
    """Upload a receipt image or PDF for OCR processing."""
    if not file.filename:
        return {"success": False, "error": "No file provided"}

    processor = MediaProcessor(
        max_image_size=settings.media_max_image_size,
        max_pdf_size=settings.media_max_pdf_size,
    )

    try:
        content = await file.read()

        media_content, error = processor.process_and_encode(
            content,
            mime_type=file.content_type,
            filename=file.filename,
        )

        if error:
            return {"success": False, "error": error}

        return {
            "success": True,
            "media": media_content.model_dump() if media_content else None,
            "filename": file.filename,
        }
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.post("/with-media")
async def chat_with_media(request: Request, body: ChatMessageWithMedia):
    agent = request.app.state.agent

    media_content = None
    if body.media:
        media_content = MediaContent(**body.media)

    thread_id = body.thread_id or f"web:{uuid4().hex[:12]}"
    thread_lock = _get_thread_lock(thread_id)

    agent_stream = agent.process_message(
        body.message,
        thread_id=thread_id,
        media=media_content,
        source=TransactionSource.WEB,
    )
    generator = _create_sse_generator(request, agent_stream, thread_lock)

    return EventSourceResponse(generator, ping=SSE_PING_INTERVAL)
