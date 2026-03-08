"""Configuration tools: budget, credit card, allocation."""

import logging
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field

from gullak.agent.tool_state import ToolState
from gullak.agent.tools_base import ToolDefinition, ToolResult
from gullak.config.paisa import AllocationTarget, PaisaConfigManager
from gullak.ledger.models import BudgetEntry, PeriodicBudget

logger = logging.getLogger(__name__)


class SetBudgetInput(BaseModel):
    """Set monthly budget targets."""

    budgets: list[dict[str, Any]] = Field(description="List of {account, amount} entries")
    funding_account: str = Field(default="Assets:Checking", description="Account to fund from")


class AddCreditCardInput(BaseModel):
    """Add a credit card to track."""

    name: str = Field(description="Card name (e.g., 'HDFC', 'Amex')")
    credit_limit: int = Field(gt=0, description="Credit limit")
    statement_end_day: int = Field(default=1, ge=1, le=31, description="Statement closing day")
    due_day: int = Field(default=15, ge=1, le=31, description="Payment due day")
    network: Literal["visa", "mastercard", "amex", "rupay", "diners"] = Field(default="visa")


class SetAllocationTargetsInput(BaseModel):
    """Set asset allocation targets for portfolio rebalancing."""

    targets: list[dict[str, Any]] = Field(description="List of {name, target, accounts} entries")


async def execute_set_budget(state: ToolState, input: SetBudgetInput) -> ToolResult:
    """Set monthly budgets."""
    if not input.budgets:
        return ToolResult(success=False, error="No budget entries provided", data={})

    entries = []
    for b in input.budgets:
        entries.append(BudgetEntry(account=b["account"], amount=Decimal(str(b["amount"]))))

    budget = PeriodicBudget(entries=entries, funding_account=input.funding_account)
    ledger_text = budget.to_ledger()

    try:
        # Acquire writer lock to serialize with other ledger mutations
        write_lock = state.writer._write_lock if state.writer else None

        async def _do_budget_write() -> ToolResult | None:
            if state.ledger_path.exists():
                content = state.ledger_path.read_text()
                # Only remove periodic blocks tagged with ; gullak:budget
                lines = content.split("\n")
                new_lines = []
                in_periodic_block = False
                is_gullak_budget = False
                block_buffer: list[str] = []
                for line in lines:
                    if line.startswith("~ "):
                        in_periodic_block = True
                        is_gullak_budget = False
                        block_buffer = [line]
                        continue
                    if in_periodic_block:
                        if not line.strip():
                            # End of block — flush or discard
                            in_periodic_block = False
                            if not is_gullak_budget:
                                new_lines.extend(block_buffer)
                            new_lines.append(line)
                            block_buffer = []
                        else:
                            if "gullak:budget" in line:
                                is_gullak_budget = True
                            block_buffer.append(line)
                        continue
                    new_lines.append(line)
                # Handle block at end of file (no trailing blank line)
                if in_periodic_block and not is_gullak_budget:
                    new_lines.extend(block_buffer)
                content = "\n".join(new_lines)
                new_content = ledger_text + "\n\n" + content.lstrip()
            else:
                state.ledger_path.parent.mkdir(parents=True, exist_ok=True)
                new_content = ledger_text + "\n"

            # Validate before writing
            if state.validator:
                is_valid, error = await state.validator.validate_content(new_content)
                if not is_valid:
                    return ToolResult(
                        success=False,
                        error=f"Budget would create invalid ledger: {error}",
                        data={},
                    )

            state.ledger_path.write_text(new_content)
            return None

        if write_lock:
            async with write_lock:
                err = await _do_budget_write()
        else:
            err = await _do_budget_write()

        if err is not None:
            return err

        # Trigger Paisa sync via writer if available
        if state.writer:
            await state.writer._sync_paisa()

        return ToolResult(
            success=True,
            message=f"Budget set for {len(entries)} categories.",
            data={"preview": ledger_text, "entries": len(entries)},
        )

    except Exception as e:
        logger.exception(f"Error setting budget: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_add_credit_card(state: ToolState, input: AddCreditCardInput) -> ToolResult:
    """Add a credit card."""
    name = input.name.strip()
    if not name:
        return ToolResult(success=False, error="Card name is required", data={})

    if input.credit_limit <= 0:
        return ToolResult(success=False, error="Credit limit must be positive", data={})

    account = f"Liabilities:CreditCard:{name.replace(' ', '')}"

    try:
        config_path = state.ledger_path.parent / "paisa.yaml"
        manager = PaisaConfigManager(config_path)

        card = manager.add_credit_card(
            account=account,
            credit_limit=input.credit_limit,
            statement_end_day=input.statement_end_day,
            due_day=input.due_day,
            network=input.network,
        )

        return ToolResult(
            success=True,
            message=f"Credit card '{name}' added. Use account '{account}'.",
            data={
                "name": name,
                "account": account,
                "credit_limit": input.credit_limit,
                "statement_end_day": card.statement_end_day,
                "due_day": card.due_day,
                "network": card.network,
            },
        )

    except Exception as e:
        logger.exception(f"Error adding credit card: {e}")
        return ToolResult(success=False, error=str(e), data={})


def execute_set_allocation_targets(
    state: ToolState, input: SetAllocationTargetsInput
) -> ToolResult:
    """Set asset allocation targets."""
    if not input.targets:
        return ToolResult(success=False, error="No allocation targets provided", data={})

    total = sum(t["target"] for t in input.targets)
    if total != 100:
        return ToolResult(
            success=False, error=f"Allocation targets must sum to 100, got {total}", data={}
        )

    try:
        config_path = state.ledger_path.parent / "paisa.yaml"
        manager = PaisaConfigManager(config_path)

        targets = []
        for t in input.targets:
            name = t["name"]
            target_pct = t["target"]
            accounts = t.get("accounts") or [f"Assets:{name}:*"]
            targets.append(AllocationTarget(name=name, target=target_pct, accounts=accounts))

        manager.set_allocation_targets(targets)

        return ToolResult(
            success=True,
            message=f"Allocation set: {', '.join(f'{t.name} {t.target}%' for t in targets)}.",
            data={
                "targets": [
                    {"name": t.name, "target": t.target, "accounts": t.accounts} for t in targets
                ]
            },
        )

    except Exception as e:
        logger.exception(f"Error setting allocation targets: {e}")
        return ToolResult(success=False, error=str(e), data={})


# Tool definitions for this module
CONFIG_TOOLS: dict[str, ToolDefinition] = {
    "set_budget": ToolDefinition(
        name="set_budget",
        description="""Set monthly budget targets.
Use when user wants spending limits: "budget 15k for rent, 10k for food".""",
        input_model=SetBudgetInput,
        executor=execute_set_budget,
        is_async=True,
    ),
    "add_credit_card": ToolDefinition(
        name="add_credit_card",
        description="""Add a credit card to track.
Use when user mentions adding a credit card: "add my HDFC card with 1.5L limit".""",
        input_model=AddCreditCardInput,
        executor=execute_add_credit_card,
    ),
    "set_allocation_targets": ToolDefinition(
        name="set_allocation_targets",
        description="""Set asset allocation targets for portfolio rebalancing.
Use when user mentions allocation: "I want 60% equity and 40% debt".""",
        input_model=SetAllocationTargetsInput,
        executor=execute_set_allocation_targets,
    ),
}
