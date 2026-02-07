"""Ledger API endpoints."""

import calendar
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


def _normalize_text(value: str) -> str:
    return value.strip().lower()


def _get_category(account: str) -> str:
    parts = account.split(":")
    return parts[1] if len(parts) > 1 else "Other"


def _get_subcategory(account: str) -> str:
    parts = account.split(":")
    return parts[2] if len(parts) > 2 else "Other"


def _is_uncategorized(account: str) -> bool:
    return account.startswith(UNKNOWN_EXPENSE_PREFIXES)


def _matches_search(query: str, payee: str, note: str | None, accounts: list[str]) -> bool:
    if not query:
        return True
    q = query.lower()
    if q in payee.lower():
        return True
    if note and q in note.lower():
        return True
    return any(q in account.lower() for account in accounts)


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
    limit: int = Query(
        50,
        ge=1,
        le=200,
        description="Maximum number of transactions",
    ),
    offset: int = Query(0, ge=0, description="Pagination offset"),
    account: str = Query("", description="Filter by account"),
    period: str = Query("all", description="Period filter: week, month, year, all"),
    category: str = Query("", description="Top-level expense category filter"),
    subcategory: str = Query("", description="Subcategory expense filter"),
    payee: str = Query("", description="Payee filter"),
    search: str = Query("", description="Search across payee, note, accounts"),
    start_date: str = Query("", description="Inclusive start date (YYYY-MM-DD)"),
    end_date: str = Query("", description="Inclusive end date (YYYY-MM-DD)"),
) -> dict[str, Any]:
    """
    List recent transactions from the ledger.

    Args:
        limit: Maximum number of transactions to return
        offset: Pagination offset
        account: Filter by account pattern
        period: Time period filter (week, month, year, all)
        category: Expense category filter
        subcategory: Expense subcategory filter
        payee: Payee filter
        search: Search across payee, note, accounts
    """

    settings = request.app.state.settings
    parser: LedgerParser = request.app.state.parser

    transactions = parser.parse_file(settings.ledger_path)
    account_filter = account.strip()
    category_filter = category.strip()
    subcategory_filter = subcategory.strip()
    payee_filter = _normalize_text(payee)
    search_filter = _normalize_text(search)

    # Filter by date range (explicit) or period (fallback)
    explicit_start = _parse_date(start_date) if start_date.strip() else None
    explicit_end = _parse_date(end_date) if end_date.strip() else None

    if explicit_start or explicit_end:
        filter_start = explicit_start or date.min
        filter_end = explicit_end or date.max
    else:
        filter_start = date.min
        filter_end = date.max
        if period != "all":
            today = date.today()
            if period == "week":
                filter_start = today - timedelta(days=7)
            elif period == "month":
                filter_start = today.replace(day=1)
            elif period == "year":
                filter_start = today.replace(month=1, day=1)

    filtered: list[dict[str, Any]] = []
    for txn in transactions:
        if txn.date < filter_start or txn.date > filter_end:
            continue
        if payee_filter and payee_filter not in txn.payee.lower():
            continue

        accounts = [p.account for p in txn.postings]
        if account_filter and not any(a.startswith(account_filter) for a in accounts):
            continue
        if search_filter and not _matches_search(
            search_filter, txn.payee, txn.note, accounts
        ):
            continue

        expense_postings = [
            p for p in txn.postings if p.account.startswith("Expenses:") and p.amount > 0
        ]
        matching_accounts: list[str] = []
        matching_amount = 0.0
        for posting in expense_postings:
            if category_filter and _get_category(posting.account) != category_filter:
                continue
            if subcategory_filter and _get_subcategory(posting.account) != subcategory_filter:
                continue
            matching_amount += float(posting.amount)
            matching_accounts.append(posting.account)

        if (category_filter or subcategory_filter) and not matching_accounts:
            continue

        amount = (
            matching_amount
            if (category_filter or subcategory_filter)
            else sum(float(p.amount) for p in expense_postings)
        )
        if amount == 0:
            amount = float(txn.total_amount)

        display_accounts = accounts
        if matching_accounts:
            display_accounts = matching_accounts + [
                a for a in accounts if a not in matching_accounts
            ]

        filtered.append(
            {
                "id": txn.gullak_id,
                "date": txn.date,
                "payee": txn.payee,
                "amount": amount,
                "currency": (
                    txn.postings[0].currency
                    if txn.postings
                    else settings.default_currency
                ),
                "accounts": display_accounts,
                "note": txn.note,
            }
        )

    filtered.sort(key=lambda item: item["date"], reverse=True)
    total = len(filtered)
    page = filtered[offset : offset + limit]
    has_more = offset + len(page) < total
    next_offset = offset + len(page) if has_more else None

    return {
        "transactions": [
            {
                "id": t["id"],
                "date": str(t["date"]),
                "payee": t["payee"],
                "amount": t["amount"],
                "currency": t["currency"],
                "accounts": t["accounts"],
                "note": t["note"],
            }
            for t in page
        ],
        "count": len(page),
        "total": total,
        "offset": offset,
        "limit": limit,
        "has_more": has_more,
        "next_offset": next_offset,
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
    subcategory: str = Query("", description="Subcategory expense filter"),
    payee: str = Query("", description="Payee filter"),
    search: str = Query("", description="Search across payee, note, accounts"),
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
            "repeat_payees": [],
            "one_offs": [],
            "budgets": [],
            "needs_review": [],
            "category_deltas": [],
            "comparison": {
                "available": False,
                "previous_total_spent": 0,
                "delta_amount": 0,
                "delta_percent": None,
            },
            "projection": {
                "available": False,
                "projected_total_spent": 0,
                "days_elapsed": 0,
                "period_days": 0,
            },
            "period": period,
            "currency": settings.default_currency,
            "period_start": str(date.today()),
            "period_end": str(date.today()),
        }

    transactions = parser.parse_file(settings.ledger_path)
    category_filter = category.strip()
    subcategory_filter = subcategory.strip()
    payee_filter = _normalize_text(payee)
    search_filter = _normalize_text(search)

    today = date.today()
    if period == "week":
        start_date = today - timedelta(days=7)
    elif period == "month":
        start_date = today.replace(day=1)
    elif period == "year":
        start_date = today.replace(month=1, day=1)
    else:
        start_date = date.min

    filtered = []
    for txn in transactions:
        if txn.date < start_date:
            continue
        accounts = [p.account for p in txn.postings]
        if payee_filter and payee_filter not in txn.payee.lower():
            continue
        if search_filter and not _matches_search(
            search_filter, txn.payee, txn.note, accounts
        ):
            continue
        filtered.append(txn)

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
    transaction_entries: list[dict[str, Any]] = []
    transaction_count = 0

    for txn in filtered:
        txn_total = 0.0
        txn_account = None
        for posting in txn.postings:
            if not (posting.account.startswith("Expenses:") and posting.amount > 0):
                continue
            posting_category = _get_category(posting.account)
            posting_subcategory = _get_subcategory(posting.account)
            if category_filter and posting_category != category_filter:
                continue
            amount = float(posting.amount)
            if category_filter:
                subcategory_totals[posting_subcategory] += amount
            if subcategory_filter and posting_subcategory != subcategory_filter:
                continue
            total_spent += amount
            category_totals[posting_category] += amount
            daily_totals[str(txn.date)] += amount
            payee_totals[txn.payee] += amount
            txn_total += amount
            if txn_account is None:
                txn_account = posting.account

        if txn_total > 0:
            payee_counts[txn.payee] += 1
            transaction_count += 1
            transaction_entries.append(
                {
                    "id": txn.gullak_id,
                    "payee": txn.payee,
                    "date": str(txn.date),
                    "amount": txn_total,
                    "currency": settings.default_currency,
                    "account": txn_account or "",
                }
            )

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
        transaction_entries,
        key=lambda x: x["amount"],
        reverse=True,
    )[:5]

    repeat_payees = [
        {
            "name": k,
            "amount": v,
            "count": payee_counts.get(k, 0),
            "average": v / payee_counts[k] if payee_counts.get(k, 0) else 0,
        }
        for k, v in payee_totals.items()
        if payee_counts.get(k, 0) >= 2
    ]
    repeat_payees.sort(key=lambda x: (x["count"], x["amount"]), reverse=True)
    repeat_payees = repeat_payees[:5]

    one_offs = [
        entry
        for entry in transaction_entries
        if payee_counts.get(entry["payee"], 0) == 1
    ]
    one_offs.sort(key=lambda x: x["amount"], reverse=True)
    one_offs = one_offs[:5]

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
        budget_periods: dict[str, tuple[date, date]] = {}
        for budget in active_budgets:
            for entry in budget["entries"]:
                account = entry["account"]
                if not account.startswith("Expenses:"):
                    continue
                if category_filter and _get_category(account) != category_filter:
                    continue
                if subcategory_filter and _get_subcategory(account) != subcategory_filter:
                    continue
                budget_totals[account] += entry["amount"]
                budget_currency[account] = entry["currency"]
                budget_periods.setdefault(
                    account, (budget["start_date"], budget["end_date"])
                )

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
                    if subcategory_filter and _get_subcategory(
                        posting.account
                    ) != subcategory_filter:
                        continue
                    for account in budget_accounts:
                        if posting.account.startswith(account):
                            actual_totals[account] += float(posting.amount)

            for account, amount in budget_totals.items():
                actual = actual_totals.get(account, 0.0)
                progress = actual / amount if amount > 0 else 0
                projected = actual
                period_range = budget_periods.get(account)
                if period_range:
                    period_start, period_end = period_range
                    period_days = (period_end - period_start).days + 1
                    days_elapsed = (today - period_start).days + 1
                    if period_days > 0 and days_elapsed > 0:
                        days_elapsed = min(days_elapsed, period_days)
                        projected = (actual / days_elapsed) * period_days
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
                        "projected": projected,
                        "projected_over": projected > amount if amount > 0 else False,
                    }
                )
            budgets.sort(key=lambda x: x["progress"], reverse=True)

    needs_review: list[dict[str, Any]] = []
    if not (category_filter or subcategory_filter or payee_filter or search_filter):
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

    category_deltas: list[dict[str, Any]] = []
    if period in {"week", "month", "year"} and not (
        category_filter or subcategory_filter
    ):
        period_days = (period_end - period_start).days + 1
        previous_end = period_start - timedelta(days=1)
        previous_start = previous_end - timedelta(days=period_days - 1)

        def category_totals_for_range(start: date, end: date) -> dict[str, float]:
            totals: dict[str, float] = defaultdict(float)
            for txn in transactions:
                if txn.date < start or txn.date > end:
                    continue
                accounts = [p.account for p in txn.postings]
                if payee_filter and payee_filter not in txn.payee.lower():
                    continue
                if search_filter and not _matches_search(
                    search_filter, txn.payee, txn.note, accounts
                ):
                    continue
                for posting in txn.postings:
                    if not (
                        posting.account.startswith("Expenses:") and posting.amount > 0
                    ):
                        continue
                    totals[_get_category(posting.account)] += float(posting.amount)
            return totals

        previous_totals = category_totals_for_range(previous_start, previous_end)
        for name in set(category_totals) | set(previous_totals):
            current = category_totals.get(name, 0.0)
            previous = previous_totals.get(name, 0.0)
            if current == 0 and previous == 0:
                continue
            delta_amount = current - previous
            delta_percent = (delta_amount / previous) * 100 if previous else None
            category_deltas.append(
                {
                    "name": name,
                    "amount": current,
                    "previous_amount": previous,
                    "delta_amount": delta_amount,
                    "delta_percent": delta_percent,
                }
            )

        category_deltas.sort(key=lambda x: x["delta_amount"], reverse=True)
        category_deltas = category_deltas[:5]

    projection = {
        "available": False,
        "projected_total_spent": 0,
        "days_elapsed": 0,
        "period_days": 0,
    }
    if period in {"week", "month", "year"}:
        if period == "week":
            period_days = 7
        elif period == "month":
            period_days = calendar.monthrange(today.year, today.month)[1]
        else:
            period_days = 366 if calendar.isleap(today.year) else 365
        days_elapsed = (today - period_start).days + 1
        if days_elapsed > 0:
            projected_total = (total_spent / days_elapsed) * period_days
            projection = {
                "available": True,
                "projected_total_spent": projected_total,
                "days_elapsed": days_elapsed,
                "period_days": period_days,
            }

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
                accounts = [p.account for p in txn.postings]
                if payee_filter and payee_filter not in txn.payee.lower():
                    continue
                if search_filter and not _matches_search(
                    search_filter, txn.payee, txn.note, accounts
                ):
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
                    if subcategory_filter and _get_subcategory(
                        posting.account
                    ) != subcategory_filter:
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
        "repeat_payees": repeat_payees,
        "one_offs": one_offs,
        "budgets": budgets,
        "needs_review": needs_review,
        "category_deltas": category_deltas,
        "comparison": comparison,
        "projection": projection,
        "period": period,
        "currency": settings.default_currency,
        "period_start": str(period_start),
        "period_end": str(period_end),
    }


def _extract_declared_expense_accounts(path: Path) -> set[str]:
    """Extract expense account names from 'account' declarations in the ledger file."""
    accounts: set[str] = set()
    if not path.exists():
        return accounts
    for line in path.read_text().splitlines():
        stripped = line.strip()
        if stripped.startswith("account Expenses:"):
            accounts.add(stripped[8:])  # Remove "account " prefix
    return accounts


@router.get("/reports/yearly")
async def yearly_report(
    request: Request,
    year: int = Query(0, description="Year for report (default: current year)"),
) -> dict[str, Any]:
    """Get yearly spending grid — months as columns, expense categories as rows."""
    settings = request.app.state.settings
    parser: LedgerParser = request.app.state.parser

    if year <= 0:
        year = date.today().year

    transactions = parser.parse_file(settings.ledger_path)

    # Collect available years
    available_years: set[int] = set()
    for txn in transactions:
        available_years.add(txn.date.year)
    if not available_years:
        available_years.add(year)

    # Seed categories/subcategories from account declarations
    declared_accounts = _extract_declared_expense_accounts(settings.ledger_path)
    cat_sub_months: dict[str, dict[str, list[float]]] = defaultdict(
        lambda: defaultdict(lambda: [0.0] * 12)
    )
    cat_months: dict[str, list[float]] = defaultdict(lambda: [0.0] * 12)
    month_totals = [0.0] * 12

    # Pre-populate from declared accounts so empty categories still appear
    for account in declared_accounts:
        cat = _get_category(account)
        sub = _get_subcategory(account)
        # Touch the defaultdict to ensure the key exists
        _ = cat_months[cat]
        _ = cat_sub_months[cat][sub]

    # Accumulate from transactions
    for txn in transactions:
        if txn.date.year != year:
            continue
        month_idx = txn.date.month - 1
        for posting in txn.postings:
            if not (posting.account.startswith("Expenses:") and posting.amount > 0):
                continue
            amount = float(posting.amount)
            cat = _get_category(posting.account)
            sub = _get_subcategory(posting.account)
            cat_months[cat][month_idx] += amount
            cat_sub_months[cat][sub][month_idx] += amount
            month_totals[month_idx] += amount

    # Build categories list sorted by total descending
    categories = []
    for cat_name, months in cat_months.items():
        cat_total = sum(months)
        active_months = sum(1 for m in months if m > 0)
        cat_avg = cat_total / active_months if active_months > 0 else 0.0

        subcategories = []
        for sub_name, sub_months in cat_sub_months[cat_name].items():
            sub_total = sum(sub_months)
            sub_active = sum(1 for m in sub_months if m > 0)
            sub_avg = sub_total / sub_active if sub_active > 0 else 0.0
            subcategories.append({
                "name": sub_name,
                "months": sub_months,
                "total": sub_total,
                "average": round(sub_avg, 2),
            })
        subcategories.sort(key=lambda x: x["total"], reverse=True)

        categories.append({
            "name": cat_name,
            "months": months,
            "total": cat_total,
            "average": round(cat_avg, 2),
            "subcategories": subcategories,
        })
    categories.sort(key=lambda x: x["total"], reverse=True)

    grand_total = sum(month_totals)
    active_months_count = sum(1 for m in month_totals if m > 0)
    grand_average = (
        round(grand_total / active_months_count, 2) if active_months_count > 0 else 0.0
    )

    return {
        "year": year,
        "months": ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        "categories": categories,
        "month_totals": month_totals,
        "grand_total": grand_total,
        "grand_average": grand_average,
        "available_years": sorted(available_years, reverse=True),
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
