"""Thread management API endpoints."""

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel

router = APIRouter(prefix="/threads", tags=["threads"])


class ThreadCreate(BaseModel):
    """Request to create a new thread."""

    title: str | None = None


class ThreadResponse(BaseModel):
    """Thread metadata response."""

    id: str
    title: str | None
    created_at: str
    updated_at: str
    message_count: int


@router.get("")
async def list_threads(request: Request, limit: int = 50) -> list[dict[str, Any]]:
    """List all threads ordered by most recently updated."""
    agent = request.app.state.agent
    chat_history = agent.get_chat_history()
    if not chat_history:
        return []
    return await chat_history.list_threads(limit=limit)


@router.post("")
async def create_thread(request: Request, body: ThreadCreate | None = None) -> dict[str, Any]:
    """Create a new thread."""
    agent = request.app.state.agent
    chat_history = agent.get_chat_history()
    if not chat_history:
        return {"error": "Chat history not available"}

    title = body.title if body else None
    thread_id = await chat_history.create_thread(title=title)
    thread = await chat_history.get_thread(thread_id)
    return thread or {"id": thread_id, "title": title}


@router.get("/{thread_id}")
async def get_thread(request: Request, thread_id: str) -> dict[str, Any]:
    """Get thread metadata."""
    agent = request.app.state.agent
    chat_history = agent.get_chat_history()
    if not chat_history:
        return {"error": "Chat history not available"}

    thread = await chat_history.get_thread(thread_id)
    if not thread:
        return {"error": "Thread not found"}
    return thread


@router.get("/{thread_id}/messages")
async def get_thread_messages(
    request: Request,
    thread_id: str,
    limit: int = 50,
    before_id: int | None = None,
) -> dict[str, Any]:
    """Get messages for a thread with pagination."""
    agent = request.app.state.agent
    chat_history = agent.get_chat_history()
    if not chat_history:
        return {"messages": [], "error": "Chat history not available"}

    messages = await chat_history.load_messages(thread_id, limit=limit, before_id=before_id)
    return {
        "thread_id": thread_id,
        "messages": messages,
        "count": len(messages),
    }


@router.delete("/{thread_id}")
async def delete_thread(request: Request, thread_id: str) -> dict[str, Any]:
    """Delete a thread and all its messages."""
    agent = request.app.state.agent
    chat_history = agent.get_chat_history()
    if not chat_history:
        return {"success": False, "error": "Chat history not available"}

    deleted = await chat_history.delete_thread(thread_id)
    return {
        "success": deleted,
        "message": "Thread deleted" if deleted else "Thread not found",
    }


@router.delete("")
async def delete_all_threads(request: Request) -> dict[str, Any]:
    """Delete all threads and messages."""
    agent = request.app.state.agent
    chat_history = agent.get_chat_history()
    if not chat_history:
        return {"success": False, "error": "Chat history not available"}

    count = await chat_history.delete_all_threads()
    return {
        "success": True,
        "deleted": count,
        "message": f"Deleted {count} threads",
    }
