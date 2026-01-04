"""Import tools: CSV import, payee mapping."""

import logging
from pathlib import Path

from pydantic import BaseModel, Field

from gullak.agent.tool_state import ToolState
from gullak.agent.tools_base import ToolDefinition, ToolResult
from gullak.import_.processor import CSVProcessor
from gullak.ledger.categories import suggest_category
from gullak.ledger.models import PendingTransaction

logger = logging.getLogger(__name__)


class LearnPayeeMappingInput(BaseModel):
    """Remember that a payee should always use a specific account."""

    payee: str = Field(description="Payee/merchant name")
    account: str = Field(description="Expense account to associate")


class ImportCsvInput(BaseModel):
    """Import transactions from a CSV file."""

    file_path: str = Field(description="Path to CSV file")
    payment_account: str = Field(description="Bank/card account for transactions")
    default_expense_account: str = Field(
        default="Expenses:Unknown", description="Default expense account"
    )


def execute_learn_payee_mapping(state: ToolState, input: LearnPayeeMappingInput) -> ToolResult:
    """Learn a payee to account mapping."""
    if not state.memory:
        return ToolResult(success=False, error="Memory not available", data={})

    payee = input.payee.strip()
    account = input.account.strip()

    if not payee or not account:
        return ToolResult(success=False, error="Payee and account are required", data={})

    state.memory.add_mapping(payee, account)
    logger.info(f"Learned payee mapping: {payee} -> {account}")

    return ToolResult(
        success=True,
        message=f"Will remember: {payee} -> {account}",
        data={"payee": payee, "account": account},
    )


def execute_import_csv(state: ToolState, input: ImportCsvInput) -> ToolResult:
    """Import transactions from CSV."""
    file_path = Path(input.file_path)

    if not file_path.exists():
        return ToolResult(success=False, error=f"File not found: {file_path}", data={})

    try:
        existing_hashes: set[str] = set()
        if state.ledger_path.exists():
            existing_txns = state.parser.parse_file(state.ledger_path)
            existing_hashes = CSVProcessor.get_existing_hashes(existing_txns)

        processor = CSVProcessor(existing_hashes)
        result = processor.process_file(
            file_path,
            default_account=input.default_expense_account,
            payment_account=input.payment_account,
        )

        if result.errors:
            return ToolResult(success=False, error="; ".join(result.errors), data={})

        pending_ids = []
        for imp_txn in result.transactions:
            suggested_account = input.default_expense_account
            if state.memory:
                suggested = state.memory.suggest_account(imp_txn.payee)
                if suggested:
                    suggested_account = suggested

            if suggested_account == input.default_expense_account:
                pattern_suggestion = suggest_category(
                    imp_txn.payee,
                    float(imp_txn.amount),
                    imp_txn.is_credit,
                )
                if pattern_suggestion:
                    suggested_account = pattern_suggestion

            txn = imp_txn.to_transaction(
                expense_account=suggested_account,
                payment_account=input.payment_account,
            )

            pending = PendingTransaction(
                id=txn.gullak_id,
                transaction=txn,
                source_text=f"CSV import row {imp_txn.source_row}: {imp_txn.payee}",
                thread_id=state.get_thread_id(),
            )

            state.add_pending(pending)
            pending_ids.append(pending.id)

        return ToolResult(
            success=True,
            message=f"Imported {len(result.transactions)} transactions. {len(result.duplicates)} duplicates skipped.",
            data={
                "total_rows": result.total_rows,
                "imported": len(result.transactions),
                "duplicates": len(result.duplicates),
                "skipped": result.skipped_rows,
                "template": result.template_used,
                "pending_ids": pending_ids,
            },
        )

    except Exception as e:
        logger.exception(f"Error importing CSV: {e}")
        return ToolResult(success=False, error=str(e), data={})


# Tool definitions for this module
IMPORT_TOOLS: dict[str, ToolDefinition] = {
    "learn_payee_mapping": ToolDefinition(
        name="learn_payee_mapping",
        description="""Remember that a payee should always use a specific account.
Use when user says "Swiggy should always be Food:Delivery".""",
        input_model=LearnPayeeMappingInput,
        executor=execute_learn_payee_mapping,
    ),
    "import_csv": ToolDefinition(
        name="import_csv",
        description="""Import transactions from a CSV file.
Use when user uploads a bank statement or CSV file.""",
        input_model=ImportCsvInput,
        executor=execute_import_csv,
    ),
}
