"""Chat API endpoint with SSE streaming."""

import asyncio
import json
import logging
import tempfile
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Request, UploadFile
from pydantic import BaseModel
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


class ChatMessageWithMedia(BaseModel):
    """Chat message with optional media attachment."""

    message: str = ""
    thread_id: str | None = None
    media: dict | None = None


class UndoRequest(BaseModel):
    """Transaction undo request."""

    transaction_id: str


class UndoResponse(BaseModel):
    """Transaction undo response."""

    success: bool
    message: str


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


@router.post("/undo")
async def undo_transaction(request: Request, body: UndoRequest) -> UndoResponse:
    """Undo a saved transaction."""
    agent = request.app.state.agent

    success, message = await agent.undo_transaction(body.transaction_id)

    return UndoResponse(success=success, message=message)


@router.post("/upload")
async def upload_file(request: Request, file: UploadFile) -> dict:
    """Upload a CSV file for import."""
    if not file.filename:
        return {"success": False, "error": "No file provided"}

    if not file.filename.lower().endswith(".csv"):
        return {"success": False, "error": "Only CSV files are supported"}

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
