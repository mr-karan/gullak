# AGENT MODULE

Complexity hotspot. Read this before modifying.

## OVERVIEW

AI agent using LiteLLM for multi-provider LLM support. 15 tools for expense tracking.

## FILES

| File | Lines | Role |
|------|-------|------|
| `tools.py` | 1132 | Tool definitions + executors (LARGEST FILE) |
| `prompts.py` | 348 | System prompt with smart payment rules |
| `client.py` | 450 | Streaming agent loop, tool dispatch |
| `tool_state.py` | 300 | Shared state, pending transactions, memory |

## CRITICAL ANTI-PATTERNS

### DO NOT call `parse_expense` when editing pending transactions

```python
# WRONG - creates duplicate
User: "change amount to 500"
Agent: calls parse_expense(amount=500)  # DUPLICATE!

# CORRECT
Agent: calls edit_pending_transaction(amount=500)
```

**Decision flow in prompts.py:**
- Just created pending? → `edit_pending_transaction`
- Old committed transaction? → `get_recent_transactions` then `edit_transaction`
- Unclear? → ASK user

## TOOL PATTERN

Every tool follows this structure:

```python
# 1. Pydantic input model
class ParseExpenseInput(BaseModel):
    amount: Decimal
    payee: str
    # ...

# 2. Registration dict
TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "parse_expense",
            "description": "...",
            "parameters": ParseExpenseInput.model_json_schema(),
        },
    },
]

# 3. Executor function
async def execute_parse_expense(args: dict, state: ToolState) -> str:
    validated = ParseExpenseInput.model_validate(args)
    # ... logic
    return json.dumps(result)

# 4. Dispatch map
TOOL_EXECUTORS = {
    "parse_expense": execute_parse_expense,
}
```

## ADDING A NEW TOOL

1. Define `{ToolName}Input(BaseModel)` with typed fields
2. Add to `TOOLS` list with OpenAI function schema
3. Create `execute_{tool_name}(args, state)` async function
4. Add to `TOOL_EXECUTORS` dict
5. Update `prompts.py` with usage instructions

## SMART PAYMENT RESOLUTION

Rules in `prompts.py` (order matters):

1. Amount < 100 → default to `Assets:Cash`
2. Single matching account → use it
3. Explicit account mentioned → use exactly
4. Payee memory exists → use learned account
5. Amount >= 500 + ambiguous → ASK user

## STATE MANAGEMENT

`ToolState` is injected into all executors:

```python
state.add_pending(txn)           # Create preview
state.get_last_pending()         # Most recent in thread
state.update_pending(id, {...})  # Modify fields
state.clear_pending(id)          # Remove after confirm
state.suggest_accounts(payee)    # Returns (expense, payment) tuple
state.memory.add_mapping(...)    # Learn payee→account
```

## STREAMING EVENTS

`client.py` yields events to frontend:

| Event | When |
|-------|------|
| `text` | LLM text response chunk |
| `thinking` | Internal reasoning |
| `tool_call` | Tool invocation started |
| `tool_result` | Tool completed |
| `preview` | Pending transaction created/updated |
| `done` | Stream complete |
