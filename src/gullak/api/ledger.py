"""Ledger API endpoints."""

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from pathlib import Path
import re
from typing import Any

from fastapi import APIRouter, Query, Request
from pydantic import BaseModel

from gullak.ledger.memory import PayeeMemory
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


class PayeeMappingInput(BaseModel):
    payee: str
    account: str


BUDGET_HEADER_PATTERN = re.compile(
    r"^~\s*(\w+)\s+from\s+(\d{4}[-/]\d{2}[-/]\d{2})\s+to\s+(\d{4}[-/]\d{2}[-/]\d{2})"
)
BUDGET_POSTING_PATTERN = re.compile(
    r"^\s{2,}([A-Za-z][^\d]*?)\s{2,}([-\d,_.]+)\s*(\w+)?(?:\s*;.*)?$"
)
UNKNOWN_EXPENSE_PREFIXES = ("Expenses:Unknown", "Expenses:Uncategorized")


def _parse_date(value: str) -> date:
    return date.fromisoformat(value.replace("/", "-"))


def _get_category(account: str) -> str:
    parts = account.split(":")
    return parts[1] if len(parts) > 1 else "Other"


def _get_subcategory(account: str) -> str:
    parts = account.split(":")
    return parts[2] if len(parts) > 2 else "Other"


def _is_uncategorized(account: str) -> bool:
    return account.startswith(UNKNOWN_EXPENSE_PREFIXES)


def _build_daily_series(
    start: date, end: date, daily_totals: dict[str, float]
) -> list[dict[str, Any]]:
    series = []
    current = start
    while current <= end:
        key = str(current)
        series.append({"date": key, "amount": daily_totals.get(key, 0)})
        current += timedelta(days=1)
    return series


def _parse_periodic_budgets(path: Path, default_currency: str) -> list[dict[str, Any]]:
    if not path.exists():
        return []

    lines = path.read_text().splitlines()
    budgets: list[dict[str, Any]] = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        match = BUDGET_HEADER_PATTERN.match(line)
        if not match:
            i += 1
            continue

        period, start_raw, end_raw = match.groups()
        start_date = _parse_date(start_raw)
        end_date = _parse_date(end_raw)
        entries: list[dict[str, Any]] = []

        i += 1
        while i < len(lines):
            entry_line = lines[i]
            if not entry_line.strip():
                break
            if entry_line.lstrip().startswith(";"):
                i += 1
                continue
            if not entry_line.startswith((" ", "\t")):
                i -= 1
                break

            posting_match = BUDGET_POSTING_PATTERN.match(entry_line)
            if posting_match:
                account = posting_match.group(1).strip()
                amount_str = posting_match.group(2).replace(",", "").replace("_", "")
                currency = posting_match.group(3) or default_currency
                try:
                    amount = float(Decimal(amount_str))
                except InvalidOperation:
                    amount = None
                if amount is not None:
                    entries.append(
                        {"account": account, "amount": amount, "currency": currency}
                    )
            i += 1

        budgets.append(
            {
                "period": period,
                "start_date": start_date,
                "end_date": end_date,
                "entries": entries,
            }
        )
        i += 1

    return budgets


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


@router.post("/payee-mapping")
async def add_payee_mapping(
    request: Request, body: PayeeMappingInput
) -> dict[str, Any]:
    """Add or update a payee-to-account mapping."""
    settings = request.app.state.settings
    payee = body.payee.strip()
    account = body.account.strip()

    if not payee or not account:
        return {"success": False, "error": "Payee and account are required"}

    if not (account.startswith("Expenses:") or account.startswith("Income:")):
        return {
            "success": False,
            "error": "Account must start with Expenses: or Income:",
        }

    if not settings.ledger_path.exists():
        return {"success": False, "error": "Ledger file not found"}

    memory = PayeeMemory(settings.ledger_path)
    memory.add_mapping(payee, account)

    return {"success": True, "payee": payee, "account": account}


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
    period: str = Query("all", description="Period filter: week, month, year, all"),
) -> dict[str, Any]:
    """
    List recent transactions from the ledger.

    Args:
        limit: Maximum number of transactions to return
        account: Filter by account pattern
        period: Time period filter (week, month, year, all)
    """
    from datetime import date, timedelta

    settings = request.app.state.settings
    parser: LedgerParser = request.app.state.parser

    transactions = parser.parse_file(settings.ledger_path)

    # Filter by period
    if period != "all":
        today = date.today()
        if period == "week":
            start_date = today - timedelta(days=7)
        elif period == "month":
            start_date = today.replace(day=1)
        elif period == "year":
            start_date = today.replace(month=1, day=1)
        else:
            start_date = date.min
        transactions = [t for t in transactions if t.date >= start_date]

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
        "period": period,
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
    category: str = Query("", description="Top-level expense category filter"),
) -> dict[str, Any]:
    """Get transaction statistics for dashboard."""
    settings = request.app.state.settings
    parser: LedgerParser = request.app.state.parser

    if not settings.ledger_path.exists():
        return {
            "total_spent": 0,
            "transaction_count": 0,
            "categories": [],
            "subcategories": [],
            "daily_spending": [],
            "top_payees": [],
            "largest_transactions": [],
            "budgets": [],
            "needs_review": [],
            "comparison": {
                "available": False,
                "previous_total_spent": 0,
                "delta_amount": 0,
                "delta_percent": None,
            },
            "period": period,
            "currency": settings.default_currency,
            "period_start": str(date.today()),
            "period_end": str(date.today()),
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
    period_start = start_date
    if period == "all":
        period_start = min((t.date for t in transactions), default=today)
    period_end = today

    total_spent = 0.0
    category_totals: dict[str, float] = defaultdict(float)
    subcategory_totals: dict[str, float] = defaultdict(float)
    daily_totals: dict[str, float] = defaultdict(float)
    payee_totals: dict[str, float] = defaultdict(float)
    payee_counts: dict[str, int] = defaultdict(int)
    largest_transactions: list[dict[str, Any]] = []
    category_filter = category.strip()
    transaction_count = len(filtered) if not category_filter else 0

    for txn in filtered:
        txn_total = 0.0
        txn_account = None
        for posting in txn.postings:
            if not (posting.account.startswith("Expenses:") and posting.amount > 0):
                continue
            posting_category = _get_category(posting.account)
            if category_filter and posting_category != category_filter:
                continue
            amount = float(posting.amount)
            total_spent += amount
            category_totals[posting_category] += amount
            daily_totals[str(txn.date)] += amount
            if category_filter:
                subcategory_totals[_get_subcategory(posting.account)] += amount
            payee_totals[txn.payee] += amount
            txn_total += amount
            if txn_account is None:
                txn_account = posting.account

        if txn_total > 0:
            payee_counts[txn.payee] += 1
            largest_transactions.append(
                {
                    "id": txn.gullak_id,
                    "payee": txn.payee,
                    "date": str(txn.date),
                    "amount": txn_total,
                    "currency": settings.default_currency,
                    "account": txn_account or "",
                }
            )
            if category_filter:
                transaction_count += 1

    categories = sorted(
        [{"name": k, "amount": v} for k, v in category_totals.items()],
        key=lambda x: x["amount"],
        reverse=True,
    )[:8]

    subcategories = []
    if category_filter:
        subcategories = sorted(
            [{"name": k, "amount": v} for k, v in subcategory_totals.items()],
            key=lambda x: x["amount"],
            reverse=True,
        )[:8]

    if period == "all":
        daily_spending = [
            {"date": k, "amount": v} for k, v in sorted(daily_totals.items())
        ]
    else:
        daily_spending = _build_daily_series(period_start, period_end, daily_totals)

    top_payees = sorted(
        [
            {"name": k, "amount": v, "count": payee_counts.get(k, 0)}
            for k, v in payee_totals.items()
        ],
        key=lambda x: x["amount"],
        reverse=True,
    )[:5]

    largest_transactions = sorted(
        largest_transactions,
        key=lambda x: x["amount"],
        reverse=True,
    )[:5]

    budgets: list[dict[str, Any]] = []
    if period == "month":
        raw_budgets = _parse_periodic_budgets(
            settings.ledger_path, settings.default_currency
        )
        active_budgets = [
            b
            for b in raw_budgets
            if b["period"].lower().startswith("month")
            and b["start_date"] <= today <= b["end_date"]
        ]
        budget_totals: dict[str, float] = defaultdict(float)
        budget_currency: dict[str, str] = {}
        for budget in active_budgets:
            for entry in budget["entries"]:
                account = entry["account"]
                if not account.startswith("Expenses:"):
                    continue
                if category_filter and _get_category(account) != category_filter:
                    continue
                budget_totals[account] += entry["amount"]
                budget_currency[account] = entry["currency"]

        if budget_totals:
            actual_totals: dict[str, float] = defaultdict(float)
            budget_accounts = list(budget_totals.keys())
            for txn in filtered:
                for posting in txn.postings:
                    if not (
                        posting.account.startswith("Expenses:") and posting.amount > 0
                    ):
                        continue
                    if category_filter and _get_category(
                        posting.account
                    ) != category_filter:
                        continue
                    for account in budget_accounts:
                        if posting.account.startswith(account):
                            actual_totals[account] += float(posting.amount)

            for account, amount in budget_totals.items():
                actual = actual_totals.get(account, 0.0)
                progress = actual / amount if amount > 0 else 0
                status = "ok"
                if actual > amount:
                    status = "over"
                elif progress >= 0.85:
                    status = "near"
                budgets.append(
                    {
                        "account": account,
                        "amount": amount,
                        "actual": actual,
                        "remaining": max(amount - actual, 0),
                        "currency": budget_currency.get(
                            account, settings.default_currency
                        ),
                        "progress": progress,
                        "status": status,
                    }
                )
            budgets.sort(key=lambda x: x["progress"], reverse=True)

    needs_review: list[dict[str, Any]] = []
    if not category_filter:
        memory = PayeeMemory(settings.ledger_path)
        review_map: dict[str, dict[str, Any]] = {}
        for txn in filtered:
            expense_postings = [
                p
                for p in txn.postings
                if p.account.startswith("Expenses:") and p.amount > 0
            ]
            if not expense_postings:
                continue
            missing_mapping = memory.get_mapping(txn.payee) is None
            has_uncategorized = any(
                _is_uncategorized(p.account) for p in expense_postings
            )
            if not (missing_mapping or has_uncategorized):
                continue

            entry = review_map.setdefault(
                txn.payee,
                {
                    "amount": 0.0,
                    "count": 0,
                    "reasons": set(),
                    "account_totals": defaultdict(float),
                },
            )
            entry["amount"] += sum(float(p.amount) for p in expense_postings)
            entry["count"] += 1
            if missing_mapping:
                entry["reasons"].add("new_payee")
            if has_uncategorized:
                entry["reasons"].add("uncategorized")
            for posting in expense_postings:
                if not _is_uncategorized(posting.account):
                    entry["account_totals"][posting.account] += float(posting.amount)

        for payee, data in review_map.items():
            suggested_account = None
            if data["account_totals"]:
                suggested_account = max(
                    data["account_totals"].items(), key=lambda item: item[1]
                )[0]
            needs_review.append(
                {
                    "payee": payee,
                    "amount": data["amount"],
                    "count": data["count"],
                    "reasons": sorted(data["reasons"]),
                    "suggested_account": suggested_account,
                }
            )
        needs_review = sorted(
            needs_review, key=lambda x: x["amount"], reverse=True
        )[:5]

    comparison = {
        "available": False,
        "previous_total_spent": 0,
        "delta_amount": 0,
        "delta_percent": None,
    }

    if period in {"week", "month", "year"}:
        period_days = (period_end - period_start).days + 1
        previous_end = period_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=period_days - 1)

        def sum_expenses(start: date, end: date) -> float:
            total = 0.0
            for txn in transactions:
                if txn.date < start or txn.date > end:
                    continue
                for posting in txn.postings:
                    if not (
                        posting.account.startswith("Expenses:") and posting.amount > 0
                    ):
                        continue
                    if category_filter and _get_category(
                        posting.account
                    ) != category_filter:
                        continue
                    total += float(posting.amount)
            return total

        previous_total = sum_expenses(previous_start, previous_end)
        delta_amount = total_spent - previous_total
        delta_percent = None
        if previous_total:
            delta_percent = (delta_amount / previous_total) * 100

        comparison = {
            "available": True,
            "previous_total_spent": previous_total,
            "delta_amount": delta_amount,
            "delta_percent": delta_percent,
        }

    return {
        "total_spent": total_spent,
        "transaction_count": transaction_count,
        "categories": categories,
        "subcategories": subcategories,
        "daily_spending": daily_spending,
        "top_payees": top_payees,
        "largest_transactions": largest_transactions,
        "budgets": budgets,
        "needs_review": needs_review,
        "comparison": comparison,
        "period": period,
        "currency": settings.default_currency,
        "period_start": str(period_start),
        "period_end": str(period_end),
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
