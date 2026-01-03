"""Ledger API endpoints."""

from typing import Any

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from gullak.ledger.parser import LedgerParser
from gullak.ledger.validator import LedgerValidator
from gullak.ledger.writer import LedgerWriter

router = APIRouter(prefix="/ledger", tags=["ledger"])


class TransactionUpdate(BaseModel):
    payee: str | None = None
    date: str | None = None
    amount: float | None = None
    expense_account: str | None = None
    payment_account: str | None = None
    note: str | None = None


@router.get("/accounts")
async def list_accounts(
    request: Request,
    type: str = Query("all", description="Account type filter"),
) -> dict[str, Any]:
    """
    List accounts from the ledger.

    Args:
        type: Filter by type (all, expenses, assets, liabilities, income)
    """
    settings = request.app.state.settings
    parser: LedgerParser = request.app.state.parser

    accounts = parser.extract_accounts(settings.ledger_path)

    # Filter by type
    prefix_map = {
        "expenses": "Expenses:",
        "assets": "Assets:",
        "liabilities": "Liabilities:",
        "income": "Income:",
    }

    if type != "all" and type in prefix_map:
        prefix = prefix_map[type]
        accounts = {a for a in accounts if a.startswith(prefix)}

    return {
        "accounts": sorted(accounts),
        "count": len(accounts),
    }


@router.get("/payees")
async def list_payees(request: Request) -> dict[str, Any]:
    """List unique payees from the ledger."""
    settings = request.app.state.settings
    parser: LedgerParser = request.app.state.parser

    payees = parser.extract_payees(settings.ledger_path)

    return {
        "payees": sorted(payees),
        "count": len(payees),
    }


@router.get("/balance")
async def get_balance(
    request: Request,
    account: str = Query("", description="Account pattern to filter"),
    period: str = Query("", description="Time period (e.g., 'this month')"),
) -> dict[str, Any]:
    """
    Get account balance from the ledger.

    Args:
        account: Account pattern (e.g., "Expenses:Food")
        period: Time period filter (e.g., "this month", "last week")
    """
    settings = request.app.state.settings
    validator: LedgerValidator = request.app.state.validator

    success, result = await validator.get_balance(
        settings.ledger_path,
        account=account,
        period=period,
    )

    if success:
        return {
            "success": True,
            "balance": result,
            "account": account or "all",
            "period": period or "all time",
        }
    else:
        return {
            "success": False,
            "error": result,
        }


@router.get("/transactions")
async def list_transactions(
    request: Request,
    limit: int = Query(50, description="Maximum number of transactions"),
    account: str = Query("", description="Filter by account"),
) -> dict[str, Any]:
    """
    List recent transactions from the ledger.

    Args:
        limit: Maximum number of transactions to return
        account: Filter by account pattern
    """
    settings = request.app.state.settings
    parser: LedgerParser = request.app.state.parser

    transactions = parser.parse_file(settings.ledger_path)

    # Filter by account
    if account:
        transactions = [
            t for t in transactions if any(p.account.startswith(account) for p in t.postings)
        ]

    # Get most recent
    recent = transactions[-limit:]

    return {
        "transactions": [
            {
                "id": t.gullak_id,
                "date": str(t.date),
                "payee": t.payee,
                "amount": float(t.total_amount),
                "currency": t.postings[0].currency if t.postings else "INR",
                "accounts": [p.account for p in t.postings],
                "note": t.note,
            }
            for t in reversed(recent)  # Most recent first
        ],
        "count": len(recent),
        "total": len(transactions),
    }


@router.get("/file")
async def get_ledger_file(
    request: Request,
    search: str = Query("", description="Search/filter text"),
) -> dict[str, Any]:
    """Get raw ledger file content for viewing."""
    settings = request.app.state.settings

    if not settings.ledger_path.exists():
        return {
            "success": True,
            "content": "",
            "lines": 0,
            "path": str(settings.ledger_path),
            "exists": False,
        }

    content = settings.ledger_path.read_text()

    if search:
        lines = content.split("\n")
        filtered = []
        in_matching_txn = False
        current_txn = []

        for line in lines:
            if line and not line[0].isspace():
                if current_txn and in_matching_txn:
                    filtered.extend(current_txn)
                current_txn = [line]
                in_matching_txn = search.lower() in line.lower()
            else:
                current_txn.append(line)
                if search.lower() in line.lower():
                    in_matching_txn = True

        if current_txn and in_matching_txn:
            filtered.extend(current_txn)

        content = "\n".join(filtered)

    return {
        "success": True,
        "content": content,
        "lines": content.count("\n") + 1 if content else 0,
        "path": str(settings.ledger_path),
        "exists": True,
    }


@router.get("/stats")
async def get_transaction_stats(
    request: Request,
    period: str = Query("month", description="Period: week, month, year, all"),
) -> dict[str, Any]:
    """Get transaction statistics for dashboard."""
    from collections import defaultdict
    from datetime import date, timedelta

    settings = request.app.state.settings
    parser: LedgerParser = request.app.state.parser

    if not settings.ledger_path.exists():
        return {
            "total_spent": 0,
            "transaction_count": 0,
            "categories": [],
            "daily_spending": [],
            "period": period,
        }

    transactions = parser.parse_file(settings.ledger_path)

    today = date.today()
    if period == "week":
        start_date = today - timedelta(days=7)
    elif period == "month":
        start_date = today.replace(day=1)
    elif period == "year":
        start_date = today.replace(month=1, day=1)
    else:
        start_date = date.min

    filtered = [t for t in transactions if t.date >= start_date]

    total_spent = 0
    category_totals: dict[str, float] = defaultdict(float)
    daily_totals: dict[str, float] = defaultdict(float)

    for txn in filtered:
        for posting in txn.postings:
            if posting.account.startswith("Expenses:") and posting.amount > 0:
                total_spent += float(posting.amount)
                category = posting.account.split(":")[1] if ":" in posting.account else "Other"
                category_totals[category] += float(posting.amount)
                daily_totals[str(txn.date)] += float(posting.amount)

    categories = sorted(
        [{"name": k, "amount": v} for k, v in category_totals.items()],
        key=lambda x: x["amount"],
        reverse=True,
    )[:8]

    return {
        "total_spent": total_spent,
        "transaction_count": len(filtered),
        "categories": categories,
        "daily_spending": [{"date": k, "amount": v} for k, v in sorted(daily_totals.items())],
        "period": period,
        "currency": settings.default_currency,
    }


@router.get("/health")
async def health_check(request: Request) -> dict[str, Any]:
    """Check ledger and validator health."""
    settings = request.app.state.settings
    validator: LedgerValidator = request.app.state.validator

    ledger_exists = settings.ledger_path.exists()
    cli_available = await validator.check_cli_available()

    ledger_valid = False
    ledger_error = ""
    if ledger_exists:
        ledger_valid, ledger_error = await validator.validate_file(settings.ledger_path)

    return {
        "status": "healthy"
        if (cli_available and (ledger_valid or not ledger_exists))
        else "degraded",
        "ledger_path": str(settings.ledger_path),
        "ledger_exists": ledger_exists,
        "ledger_valid": ledger_valid,
        "ledger_error": ledger_error if not ledger_valid and ledger_exists else None,
        "cli_available": cli_available,
        "cli_path": settings.ledger_cli,
    }


@router.delete("/transactions/{transaction_id}")
async def delete_transaction(request: Request, transaction_id: str) -> dict[str, Any]:
    """Delete a transaction by its gullak ID."""
    writer: LedgerWriter = request.app.state.writer

    try:
        deleted = await writer.delete_transaction(transaction_id)
        if deleted:
            return {"success": True, "message": "Transaction deleted"}
        return {"success": False, "error": "Transaction not found"}
    except Exception as e:
        return {"success": False, "error": str(e)}


@router.put("/transactions/{transaction_id}")
async def update_transaction(
    request: Request, transaction_id: str, body: TransactionUpdate
) -> dict[str, Any]:
    """Update a transaction by its gullak ID."""
    writer: LedgerWriter = request.app.state.writer

    updates = {}
    if body.payee is not None:
        updates["payee"] = body.payee
    if body.date is not None:
        updates["date"] = body.date
    if body.amount is not None:
        updates["amount"] = body.amount
    if body.expense_account is not None:
        updates["expense_account"] = body.expense_account
    if body.payment_account is not None:
        updates["payment_account"] = body.payment_account
    if body.note is not None:
        updates["note"] = body.note

    if not updates:
        return {"success": False, "error": "No updates provided"}

    try:
        updated = await writer.update_transaction(transaction_id, updates)
        if updated:
            return {
                "success": True,
                "message": "Transaction updated",
                "transaction": {
                    "id": updated.gullak_id,
                    "date": str(updated.date),
                    "payee": updated.payee,
                    "amount": float(updated.total_amount),
                    "accounts": [p.account for p in updated.postings],
                },
            }
        return {"success": False, "error": "Transaction not found"}
    except ValueError as e:
        return {"success": False, "error": str(e)}
    except Exception as e:
        return {"success": False, "error": str(e)}
