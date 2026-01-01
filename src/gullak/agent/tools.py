"""Custom tools for the Gullak agent using Anthropic Python SDK."""

import json
import logging
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from gullak.agent.tool_definitions import TOOL_DEFINITIONS
from gullak.agent.tool_handlers import (
    TOOL_HANDLERS,
    clear_pending_transaction,
    configure_tool_state,
    get_pending_transactions,
)
from gullak.agent.tool_schemas import (
    AddCreditCardArgs,
    DeleteTransactionArgs,
    EditTransactionArgs,
    GetRecentTransactionsArgs,
    ImportCsvArgs,
    LearnPayeeMappingArgs,
    ListAccountsArgs,
    ParseExpenseArgs,
    ParseIncomeArgs,
    QueryBalanceArgs,
    SetAllocationTargetsArgs,
    SetBudgetArgs,
)
from gullak.ledger.parser import LedgerParser
from gullak.ledger.validator import LedgerValidator

logger = logging.getLogger(__name__)


# Map tool names to their Pydantic schema for input validation
TOOL_SCHEMA_MAP = {
    "parse_expense": ParseExpenseArgs,
    "parse_income": ParseIncomeArgs,
    "query_balance": QueryBalanceArgs,
    "list_accounts": ListAccountsArgs,
    "edit_transaction": EditTransactionArgs,
    "delete_transaction": DeleteTransactionArgs,
    "get_recent_transactions": GetRecentTransactionsArgs,
    "learn_payee_mapping": LearnPayeeMappingArgs,
    "import_csv": ImportCsvArgs,
    "set_budget": SetBudgetArgs,
    "add_credit_card": AddCreditCardArgs,
    "set_allocation_targets": SetAllocationTargetsArgs,
}


def configure_agent_tools(
    ledger_path: Path,
    default_currency: str,
    parser: LedgerParser | None = None,
    validator: LedgerValidator | None = None,
) -> None:
    """Configure global tool state."""
    configure_tool_state(ledger_path, default_currency, parser, validator)


def execute_tool(name: str, args: dict[str, Any]) -> str:
    """Execute a tool with validated arguments."""
    logger.info(f"Attempting to execute tool: {name} with args: {args}")

    schema_model = TOOL_SCHEMA_MAP.get(name)
    if not schema_model:
        logger.error(f"Unknown tool: {name}")
        return json.dumps({"error": f"Unknown tool: {name}"})

    try:
        # Validate arguments using Pydantic schema
        validated_args = schema_model.model_validate(args)
    except ValidationError as e:
        logger.warning(f"Validation error for tool '{name}': {e.json()}")
        return json.dumps({"error": f"Invalid arguments for tool '{name}': {e.errors()}"})
    except Exception as e:
        logger.exception(f"Unexpected error during argument validation for tool '{name}'.")
        return json.dumps({"error": f"Unexpected error validating arguments: {e}"})

    handler = TOOL_HANDLERS.get(name)
    if handler:
        try:
            result = handler(validated_args)
            logger.info(f"Tool '{name}' executed successfully.")
            return result
        except Exception as e:
            logger.exception(f"Error executing tool '{name}'")
            return json.dumps({"error": f"Error executing tool '{name}': {e}"})
    else:
        # This case should ideally not be reached if TOOL_SCHEMA_MAP and TOOL_HANDLERS are in sync
        logger.critical(f"Tool '{name}' has a schema but no handler registered.")
        return json.dumps({"error": f"No handler registered for tool: {name}"})


TOOLS = TOOL_DEFINITIONS

# Expose for API layer
get_pending_transactions = get_pending_transactions
clear_pending_transaction = clear_pending_transaction
configure_tools = configure_agent_tools
