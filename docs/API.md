# Gullak API Reference

This document provides a comprehensive reference for the Gullak API. Gullak is a FastAPI-based application that provides an interface for managing personal finances using `ledger-cli` and AI-powered natural language processing.

## Base URL

All API endpoints are prefixed with `/api`. Core endpoints and the main application are served from the root.

---

## Chat API (`/api/chat`)

Endpoints for interacting with the AI agent and managing pending transactions.

### POST `/api/chat`
Process a chat message and stream the response using Server-Sent Events (SSE).

**Request Body:**
```json
{
  "message": "Spent 500 INR on groceries today at BigBasket",
  "conversation_id": "optional-session-id"
}
```

**Response:**
A stream of Server-Sent Events with the following event types:
- `text`: Natural language response from the agent.
- `preview`: A preview of a pending transaction.
- `thinking`: Indicates the agent is using a tool.
- `tool_result`: Result of a tool execution.
- `done`: Processing of the message is complete.
- `error`: An error occurred during processing.

### POST `/api/chat/confirm`
Confirm a pending transaction and write it to the ledger.

**Request Body:**
```json
{
  "transaction_id": "txn_123abc"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction written to ledger"
}
```

### POST `/api/chat/cancel`
Cancel a pending transaction.

**Request Body:**
```json
{
  "transaction_id": "txn_123abc"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Transaction cancelled"
}
```

### GET `/api/chat/pending`
Retrieve all currently pending transactions.

**Response:**
```json
[
  {
    "id": "txn_123abc",
    "transaction": {
      "date": "2024-05-20",
      "payee": "BigBasket",
      "postings": [
        {
          "account": "Expenses:Food:Groceries",
          "amount": 500,
          "currency": "INR"
        },
        {
          "account": "Assets:Bank:HDFC",
          "amount": -500,
          "currency": "INR"
        }
      ],
      "note": "Weekly groceries"
    },
    "ledger_preview": "2024-05-20 BigBasket\n    Expenses:Food:Groceries  500 INR\n    Assets:Bank:HDFC"
  }
]
```

### POST `/api/chat/upload`
Upload a CSV or Excel file for transaction import.

**Request Body:**
Multipart form with `file` field.

**Response:**
```json
{
  "success": true,
  "file_path": "/tmp/tmp_xyz.csv",
  "filename": "bank_statement.csv",
  "message": "File 'bank_statement.csv' uploaded. Use chat to import it."
}
```

### POST `/api/chat/confirm-all`
Confirm all pending transactions at once.

**Response:**
```json
{
  "success": true,
  "confirmed": 5,
  "total": 5,
  "results": [
    { "id": "txn_1", "success": true, "message": "..." },
    { "id": "txn_2", "success": true, "message": "..." }
  ],
  "message": "Confirmed 5 of 5 transactions"
}
```

### POST `/api/chat/cancel-all`
Cancel all pending transactions.

**Response:**
```json
{
  "success": true,
  "cancelled": 5,
  "message": "Cancelled 5 transactions"
}
```

### POST `/api/chat/update-pending`
Update a pending transaction's details before confirmation.

**Request Body:**
```json
{
  "transaction_id": "txn_123abc",
  "updates": {
    "payee": "New Payee",
    "amount": 600,
    "expense_account": "Expenses:Food:Dining",
    "payment_account": "Assets:Cash",
    "currency": "INR",
    "date": "2024-05-21",
    "note": "Updated note"
  }
}
```

**Response:**
```json
{
  "success": true,
  "preview": "2024-05-21 New Payee\n    ; Updated note\n    Expenses:Food:Dining  600 INR\n    Assets:Cash",
  "message": "Transaction updated"
}
```

---

## Ledger API (`/api/ledger`)

Endpoints for querying ledger data and health.

### GET `/api/ledger/accounts`
List accounts from the ledger with optional filtering.

**Query Parameters:**
- `type`: Filter by account type (`all`, `expenses`, `assets`, `liabilities`, `income`). Defaults to `all`.

**Response:**
```json
{
  "accounts": ["Assets:Bank:HDFC", "Expenses:Food:Groceries"],
  "count": 2
}
```

### GET `/api/ledger/payees`
List all unique payees found in the ledger.

**Response:**
```json
{
  "payees": ["Amazon", "BigBasket", "Uber"],
  "count": 3
}
```

### GET `/api/ledger/balance`
Get the balance for a specific account or pattern.

**Query Parameters:**
- `account`: Account pattern (e.g., `Expenses:Food`).
- `period`: Time period filter (e.g., `this month`, `last week`).

**Response:**
```json
{
  "success": true,
  "balance": "1,500 INR",
  "account": "Expenses:Food",
  "period": "this month"
}
```

### GET `/api/ledger/transactions`
List recent transactions from the ledger.

**Query Parameters:**
- `limit`: Maximum number of transactions to return. Defaults to `50`.
- `account`: Filter transactions by account pattern.

**Response:**
```json
{
  "transactions": [
    {
      "id": "txn_789xyz",
      "date": "2024-05-19",
      "payee": "Amazon",
      "amount": 1200.0,
      "currency": "INR",
      "accounts": ["Expenses:Shopping", "Liabilities:CreditCard:HDFC"],
      "note": "Books"
    }
  ],
  "count": 1,
  "total": 150
}
```

### GET `/api/ledger/file`
Retrieve the raw content of the ledger file.

**Query Parameters:**
- `search`: Optional text to filter ledger transactions.

**Response:**
```json
{
  "success": true,
  "content": "2024-05-19 Amazon\n    Expenses:Shopping  1200 INR\n    Liabilities:CreditCard:HDFC",
  "lines": 3,
  "path": "/app/data/main.ledger",
  "exists": true
}
```

### GET `/api/ledger/health`
Check the health of the ledger file and `ledger-cli` integration.

**Response:**
```json
{
  "status": "healthy",
  "ledger_path": "/app/data/main.ledger",
  "ledger_exists": true,
  "ledger_valid": true,
  "ledger_error": null,
  "cli_available": true,
  "cli_path": "ledger"
}
```

---

## Setup API (`/api/setup`)

Endpoints for the onboarding wizard and initial configuration.

### GET `/api/setup/status`
Get the current setup status and user preferences.

**Response:**
```json
{
  "is_complete": false,
  "current_step": "welcome",
  "preferences": {
    "currency": "INR",
    "timezone": "Asia/Kolkata",
    "bank_accounts": [],
    "credit_cards": [],
    "expense_categories": [],
    "income_sources": [],
    "asset_accounts": []
  }
}
```

### GET `/api/setup/options`
Get available configuration options for the setup process.

**Response:**
```json
{
  "currencies": [{ "code": "INR", "name": "Indian Rupee", "symbol": "₹" }, ...],
  "timezones": [{ "value": "Asia/Kolkata", "label": "India (IST)" }, ...],
  "default_expense_accounts": ["Expenses:Food:Groceries", ...],
  "suggested_banks": ["HDFC", "ICICI", ...],
  "suggested_cards": ["Amex", "Axis", ...]
}
```

### POST `/api/setup/step`
Update the setup process with data for a specific step.

**Request Body:**
```json
{
  "step": "welcome",
  "data": {
    "currency": "INR",
    "timezone": "Asia/Kolkata"
  }
}
```

**Response:**
```json
{
  "success": true,
  "next_step": "accounts",
  "message": "Great! Now let's set up your accounts."
}
```

### POST `/api/setup/skip`
Skip the setup wizard and use default configuration.

**Response:**
```json
{
  "success": true,
  "next_step": null,
  "message": "Using default settings. You can always add more accounts later!"
}
```

---

## Core Endpoints

### GET `/`
Serves the main HTML application (single-page app).

### GET `/health`
Basic health check for the application.

**Response:**
```json
{
  "status": "healthy",
  "version": "2.0.0"
}
```
