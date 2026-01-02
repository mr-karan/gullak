"""WhatsApp integration via Baileys-based bridge."""

import asyncio
import base64
from collections import OrderedDict
from time import time

import httpx
import structlog
from fastapi import APIRouter, Request, Response
from pydantic import BaseModel

from gullak.media import MediaProcessor
from gullak.settings import settings

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])
logger = structlog.get_logger(__name__)

WHATSAPP_BRIDGE_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

# Simple in-memory message deduplication cache (message_id -> timestamp)
# Prevents double-processing if Waha retries the webhook
_processed_messages: OrderedDict[str, float] = OrderedDict()
_DEDUPE_TTL_SECONDS = 300  # 5 minutes
_DEDUPE_MAX_SIZE = 1000

# Per-thread locks to prevent concurrent agent processing for same conversation
_thread_locks: dict[str, asyncio.Lock] = {}


def _get_thread_lock(thread_id: str) -> asyncio.Lock:
    """Get or create a lock for a specific thread to serialize agent processing."""
    if thread_id not in _thread_locks:
        _thread_locks[thread_id] = asyncio.Lock()
    return _thread_locks[thread_id]


def _is_duplicate_message(message_id: str) -> bool:
    """Check if we've already processed this message (deduplication)."""
    now = time()

    # Clean up old entries
    while _processed_messages and len(_processed_messages) > 0:
        oldest_id, oldest_time = next(iter(_processed_messages.items()))
        if now - oldest_time > _DEDUPE_TTL_SECONDS:
            _processed_messages.pop(oldest_id, None)
        else:
            break

    # Limit cache size
    while len(_processed_messages) >= _DEDUPE_MAX_SIZE:
        _processed_messages.popitem(last=False)

    if message_id in _processed_messages:
        return True

    _processed_messages[message_id] = now
    return False


def get_whatsapp_client(request: Request) -> httpx.AsyncClient:
    """Get the shared WhatsApp bridge HTTP client from app state."""
    return request.app.state.whatsapp_client


class WebhookPayload(BaseModel):
    """WhatsApp bridge webhook payload model."""

    event: str
    payload: dict


@router.post("/start")
async def start_session(request: Request):
    """Start WhatsApp session to generate QR code."""
    client = get_whatsapp_client(request)
    try:
        resp = await client.post("/api/default/auth/start")
        resp.raise_for_status()
        return resp.json()
    except httpx.TimeoutException:
        return {"status": "error", "message": "Timeout starting session"}
    except httpx.HTTPStatusError as e:
        return {"status": "error", "message": f"HTTP {e.response.status_code}"}
    except httpx.RequestError:
        return {"status": "error", "message": "Cannot connect to WhatsApp bridge"}


@router.get("/qr")
async def get_qr_code(request: Request):
    """Proxy the QR code from bridge. Returns JSON if not ready, image if ready."""
    client = get_whatsapp_client(request)
    try:
        resp = await client.get("/api/default/auth/qr")
        content_type = resp.headers.get("content-type", "")
        if "image" in content_type:
            return Response(content=resp.content, media_type=content_type)
        return resp.json()
    except httpx.TimeoutException:
        logger.warning("whatsapp_qr_timeout")
        return {"status": "error", "message": "Timeout fetching QR code"}
    except httpx.HTTPStatusError as e:
        logger.warning("whatsapp_qr_http_error", status_code=e.response.status_code)
        return {"status": "error", "message": "QR code not available"}
    except httpx.RequestError as e:
        logger.error("whatsapp_qr_connection_error", error=type(e).__name__)
        return {"status": "error", "message": "Cannot connect to WhatsApp bridge"}


@router.get("/status")
async def get_status(request: Request):
    """Check WhatsApp connection status."""
    client = get_whatsapp_client(request)
    try:
        resp = await client.get("/api/sessions/default")
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status", "STOPPED")
        return {"connected": status == "WORKING", "status": status, "me": data.get("me")}
    except httpx.TimeoutException:
        return {"connected": False, "status": "TIMEOUT", "error": "Bridge timeout"}
    except httpx.HTTPStatusError as e:
        return {"connected": False, "status": "ERROR", "error": f"HTTP {e.response.status_code}"}
    except httpx.RequestError:
        return {"connected": False, "status": "UNREACHABLE", "error": "Cannot connect to bridge"}


@router.post("/webhook")
async def whatsapp_webhook(request: Request, body: WebhookPayload):
    """Handle incoming WhatsApp messages via Waha webhook."""
    # Only process text messages
    if body.event != "message":
        return {"status": "ignored", "reason": "not_message_event"}

    payload = body.payload
    message_id = payload.get("id", "")

    # Deduplication: Skip if we've already processed this message
    if message_id and _is_duplicate_message(message_id):
        logger.debug("duplicate_message_skipped", message_id=message_id)
        return {"status": "ignored", "reason": "duplicate"}

    # Extract message details
    sender = payload.get("from", "")
    is_group = "@g.us" in sender
    author = payload.get("author", sender) if is_group else sender
    message_body = payload.get("body", "")

    # Security: Check allowlist
    author_number = author.split("@")[0]

    if settings.whatsapp_allowed_numbers:
        if author_number not in settings.whatsapp_allowed_numbers:
            logger.warning("unauthorized_whatsapp_sender", sender=author, number=author_number)
            return {"status": "ignored", "reason": "unauthorized"}

    # Ignore messages from myself
    if payload.get("fromMe", False):
        return {"status": "ignored", "reason": "from_me"}

    # Group chat logic: Optionally require @gullak mention
    if is_group and settings.whatsapp_group_require_mention:
        triggers = ["@gullak", "gullak"]
        triggered = False
        check_body = message_body.lstrip()
        lower_body = check_body.lower()

        for trigger in triggers:
            if lower_body.startswith(trigger):
                triggered = True
                message_body = check_body[len(trigger) :].lstrip()
                break

        if not triggered:
            return {"status": "ignored", "reason": "group_no_mention"}

    # Process media if present
    media_data = payload.get("media")
    media_content = None

    if media_data:
        processor = MediaProcessor(
            max_image_size=settings.media_max_image_size,
            max_pdf_size=settings.media_max_pdf_size,
        )

        try:
            raw_data = base64.b64decode(media_data["data"])
            media_content, error = processor.process_and_encode(
                raw_data,
                mime_type=media_data.get("mimetype"),
                filename=media_data.get("filename"),
            )

            if error:
                logger.warning("whatsapp_media_validation_failed", error=error)
                client = get_whatsapp_client(request)
                try:
                    await client.post(
                        "/api/sendText",
                        json={"session": "default", "chatId": sender, "text": f"❌ {error}"},
                    )
                except Exception:
                    pass
                return {"status": "ignored", "reason": "invalid_media", "error": error}

            logger.info(
                "whatsapp_media_processed",
                media_type=media_data.get("type"),
                size=len(raw_data),
            )
        except Exception as e:
            logger.error("whatsapp_media_decode_failed", error=str(e))

    # Skip if no text and no valid media
    if not message_body.strip() and not media_content:
        return {"status": "ignored", "reason": "empty_message"}

    client = get_whatsapp_client(request)
    agent = request.app.state.agent

    thread_id = f"wa_{sender.replace('@', '_')}"

    logger.info(
        "processing_whatsapp_message",
        chat_id=sender,
        author=author_number,
        body_length=len(message_body),
        has_media=media_content is not None,
    )

    try:
        await client.post("/api/sendSeen", json={"session": "default", "chatId": sender})
        await client.post("/api/startTyping", json={"session": "default", "chatId": sender})
    except Exception as e:
        logger.debug("whatsapp_typing_indicator_failed", error=type(e).__name__)

    response_text = ""
    thread_lock = _get_thread_lock(thread_id)

    try:
        async with thread_lock:
            async for event in agent.process_message(
                message_body, thread_id=thread_id, media=media_content
            ):
                if event.type == "text":
                    response_text += event.content
                elif event.type == "error":
                    response_text += f"\n❌ Error: {event.content}"

        # Send response back to WhatsApp
        if response_text.strip():
            try:
                resp = await client.post(
                    "/api/sendText",
                    json={"session": "default", "chatId": sender, "text": response_text},
                )
                resp.raise_for_status()
            except httpx.HTTPStatusError as e:
                logger.error("whatsapp_send_failed", status_code=e.response.status_code)
            except httpx.RequestError as e:
                logger.error("whatsapp_send_connection_error", error=type(e).__name__)

    except Exception as e:
        logger.error("agent_processing_failed", error=str(e), error_type=type(e).__name__)
        # Try to send error message back
        try:
            await client.post(
                "/api/sendText",
                json={
                    "session": "default",
                    "chatId": sender,
                    "text": "Sorry, I couldn't process that. Please try again.",
                },
            )
        except Exception:
            pass
    finally:
        # Stop typing indicator
        try:
            await client.post("/api/stopTyping", json={"session": "default", "chatId": sender})
        except Exception:
            pass

    return {"status": "processed"}
