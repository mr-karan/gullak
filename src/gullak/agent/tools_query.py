"""Query tools: list accounts, recent transactions, query balance."""

import logging
from typing import Literal

from pydantic import BaseModel, Field

from gullak.agent.tool_state import ToolState
from gullak.agent.tools_base import ToolDefinition, ToolResult

logger = logging.getLogger(__name__)


class QueryBalanceInput(BaseModel):
    """Query account balances from the ledger."""

    account: str = Field(default="", description="Account pattern to query (empty for all)")
    period: str = Field(default="", description="Time period (e.g., 'this month', 'last 30 days')")


class ListAccountsInput(BaseModel):
    """List available accounts in the ledger."""

    account_type: Literal["all", "expenses", "assets", "liabilities", "income"] = Field(
        default="all", description="Filter by account type"
    )


class GetRecentTransactionsInput(BaseModel):
    """Get recent transactions."""

    limit: int = Field(default=5, ge=1, le=20, description="Number of transactions to return")
    account: str | None = Field(default=None, description="Filter by account pattern")


async def execute_query_balance(state: ToolState, input: QueryBalanceInput) -> ToolResult:
    """Query ledger balances."""
    if state.validator is None:
        return ToolResult(success=False, error="Validator not configured", data={})

    try:
        success, result = await state.validator.get_balance(
            state.ledger_path,
            account=input.account,
            period=input.period,
        )

        if success and result.strip():
            return ToolResult(
                success=True,
                message="Balance query successful.",
                data={"balance": result.strip()},
            )
        elif success:
            msg = f"No transactions found for {input.account or 'all accounts'}"
            if input.period:
                msg += f" in {input.period}"
            return ToolResult(success=True, message=msg, data={})
        else:
            return ToolResult(success=False, error=result, data={})

    except Exception as e:
        logger.exception(f"Error querying balance: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_list_accounts(state: ToolState, input: ListAccountsInput) -> ToolResult:
    """List ledger accounts."""
    try:
        accounts = state.get_accounts(input.account_type)
        return ToolResult(
            success=True,
            message=f"Found {len(accounts)} {input.account_type} accounts.",
            data={"accounts": accounts, "count": len(accounts)},
        )
    except Exception as e:
        logger.exception(f"Error listing accounts: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_get_recent_transactions(
    state: ToolState, input: GetRecentTransactionsInput
) -> ToolResult:
    """Get recent transactions."""
    try:
        if not state.ledger_path.exists():
            return ToolResult(
                success=True, message="No transactions yet.", data={"transactions": []}
            )

        transactions = state.parser.parse_file(state.ledger_path)

        if input.account:
            transactions = [
                t
                for t in transactions
                if any(input.account.lower() in p.account.lower() for p in t.postings)
            ]

        transactions = sorted(transactions, key=lambda t: t.date, reverse=True)
        recent = transactions[: input.limit]

        txn_list = []
        for t in recent:
            txn_data = {
                "id": t.gullak_id,
                "date": str(t.date),
                "payee": t.payee,
                "amount": float(t.total_amount),
                "postings": [
                    {"account": p.account, "amount": float(p.amount), "currency": p.currency}
                    for p in t.postings
                ],
            }
            txn_list.append(txn_data)

        return ToolResult(
            success=True,
            message=f"Found {len(recent)} recent transactions.",
            data={"transactions": txn_list, "total_count": len(transactions)},
        )

    except Exception as e:
        logger.exception(f"Error getting recent transactions: {e}")
        return ToolResult(success=False, error=str(e), data={})


# Tool definitions for this module
QUERY_TOOLS: dict[str, ToolDefinition] = {
    "query_balance": ToolDefinition(
        name="query_balance",
        description="""Query account balances from the ledger.
Use when user asks about spending or balances: "How much on food?", "What's my balance?".""",
        input_model=QueryBalanceInput,
        executor=execute_query_balance,
        is_async=True,
    ),
    "list_accounts": ToolDefinition(
        name="list_accounts",
        description="""List available accounts in the ledger.
Use to help categorize expenses or show account structure.""",
        input_model=ListAccountsInput,
        executor=execute_list_accounts,
    ),
    "get_recent_transactions": ToolDefinition(
        name="get_recent_transactions",
        description="""Get recent transactions from the ledger.
Use to find transaction IDs for editing/deleting or when user asks "what did I spend?".""",
        input_model=GetRecentTransactionsInput,
        executor=execute_get_recent_transactions,
    ),
}
