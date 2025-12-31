"""Chat API endpoint with SSE streaming."""

import json
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, File, Request, UploadFile
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


class BatchConfirmRequest(BaseModel):
    """Batch transaction confirmation request."""

    transaction_ids: list[str]


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


@router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...)) -> dict:
    """Upload a CSV file for import."""
    if not file.filename:
        return {"success": False, "error": "No file provided"}

    # Check file extension
    if not file.filename.lower().endswith((".csv", ".xlsx", ".xls")):
        return {"success": False, "error": "Only CSV and Excel files are supported"}

    # Save to temp file
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
async def confirm_all_transactions(request: Request) -> dict:
    """Confirm all pending transactions."""
    agent = request.app.state.agent
    pending = agent.get_pending()

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
async def cancel_all_transactions(request: Request) -> dict:
    """Cancel all pending transactions."""
    agent = request.app.state.agent
    pending = agent.get_pending()

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
    from datetime import date
    from decimal import Decimal

    from gullak.agent.tools import _save_pending, get_pending_transactions
    from gullak.ledger.models import Posting

    pending_txns = get_pending_transactions()

    if body.transaction_id not in pending_txns:
        return {"success": False, "error": "Transaction not found"}

    pending = pending_txns[body.transaction_id]
    txn = pending.transaction
    updates = body.updates

    # Apply updates
    if "payee" in updates:
        txn.payee = updates["payee"]
    if "date" in updates:
        if isinstance(updates["date"], str):
            txn.date = date.fromisoformat(updates["date"])
        else:
            txn.date = updates["date"]
    if "note" in updates:
        txn.note = updates["note"]

    # Handle amount/account updates
    if any(k in updates for k in ["amount", "expense_account", "payment_account", "currency"]):
        old_postings = txn.postings
        if len(old_postings) >= 2:
            expense = old_postings[0]
            payment = old_postings[1]

            new_amount = Decimal(str(updates.get("amount", expense.amount)))
            new_currency = updates.get("currency", expense.currency)
            new_expense = updates.get("expense_account", expense.account)
            new_payment = updates.get("payment_account", payment.account)

            txn.postings = [
                Posting(account=new_expense, amount=new_amount, currency=new_currency),
                Posting(account=new_payment, amount=-new_amount, currency=new_currency),
            ]

    # Update ledger preview
    pending.ledger_preview = txn.to_ledger()

    # Save to disk
    _save_pending()

    return {
        "success": True,
        "preview": pending.ledger_preview,
        "message": "Transaction updated",
    }
