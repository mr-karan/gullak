"""Ledger API endpoints."""

from typing import Any

from fastapi import APIRouter, Query, Request

from gullak.ledger.parser import LedgerParser
from gullak.ledger.validator import LedgerValidator

router = APIRouter(prefix="/ledger", tags=["ledger"])


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
            t
            for t in transactions
            if any(p.account.startswith(account) for p in t.postings)
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


@router.get("/health")
async def health_check(request: Request) -> dict[str, Any]:
    """Check ledger and validator health."""
    settings = request.app.state.settings
    validator: LedgerValidator = request.app.state.validator

    # Check if ledger file exists
    ledger_exists = settings.ledger_path.exists()

    # Check if ledger CLI is available
    cli_available = await validator.check_cli_available()

    # Validate ledger if it exists
    ledger_valid = False
    ledger_error = ""
    if ledger_exists:
        ledger_valid, ledger_error = await validator.validate_file(settings.ledger_path)

    return {
        "status": "healthy" if (cli_available and (ledger_valid or not ledger_exists)) else "degraded",
        "ledger_path": str(settings.ledger_path),
        "ledger_exists": ledger_exists,
        "ledger_valid": ledger_valid,
        "ledger_error": ledger_error if not ledger_valid and ledger_exists else None,
        "cli_available": cli_available,
        "cli_path": settings.ledger_cli,
    }
