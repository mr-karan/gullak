---
summary: "Gullak system architecture, services, and data flow"
read_when:
  - Understanding how Gullak works
  - Debugging service interactions
  - Contributing to Gullak
---

# System Architecture

Gullak is designed as a set of lightweight, interoperable services that work together to provide a seamless expense tracking experience. It leverages the power of Large Language Models (LLMs) to bridge the gap between natural language and structured plain-text accounting.

## High-Level Overview

The system consists of three primary services orchestrated via Docker Compose:

1.  **Gullak (FastAPI)**: The core engine and web interface.
2.  **Paisa**: The visualization and reporting dashboard.
3.  **WhatsApp Bridge**: The interface for mobile logging via WhatsApp.

## Service Descriptions

### Gullak (FastAPI)
The central component of the architecture. It is built with FastAPI and is responsible for:
- **AI Agent**: Orchestrating the LLM (via LiteLLM) to parse natural language into ledger entries.
- **Ledger Management**: Parsing, writing, and validating `.ledger` files using `ledger-cli`.
- **API Services**: Providing REST endpoints for the web UI and external integrations (like WhatsApp).
- **Web UI**: A minimalist management interface for reviewing transactions and configuring the system.

### Paisa
An external visualization engine for `ledger-cli` files. Gullak integrates with Paisa by:
- Sharing the same ledger data directory.
- Providing deep links to Paisa charts from the Gullak UI.
- Allowing Paisa to handle complex financial reporting while Gullak focuses on data entry.

### WhatsApp Bridge (Baileys)
A Node.js service based on the [Baileys](https://github.com/adiwajshing/Baileys) library. It:
- Maintains a WhatsApp Web session.
- Receives messages and forwards them to Gullak via webhooks.
- Allows users to log expenses on-the-go without opening a dedicated app.

## Data Flow

The following diagram illustrates how a natural language input is transformed into a structured ledger entry and eventually visualized.

```text
User Input (WhatsApp/Web)
       │
       ▼
┌──────────────────┐      ┌──────────────────────────┐
│ WhatsApp Bridge  │ ───▶ │     Gullak (FastAPI)     │
└──────────────────┘      │  ┌────────────────────┐  │      ┌─────────────┐
                          │  │      AI Agent      │ ──┼───▶ │  LLM (API)  │
                          │  └────────────────────┘  │      └─────────────┘
                                     │
                                     ▼
                          ┌────────────────────┐      ┌─────────────────┐
                          │  Ledger Processor  │ ───▶ │  ledger-cli     │
                          └────────────────────┘      │  (Validation)   │
                                     │                └─────────────────┘
                                     ▼
                          ┌────────────────────┐
                          │    main.ledger     │
                          └────────────────────┘
                                     │
                                     ▼
                          ┌────────────────────┐
                          │       Paisa        │
                          │ (Charts/Reporting) │
                          └────────────────────┘
```

## File Structure Overview

- `src/gullak/agent/`: Contains the AI agent logic, system prompts, and tool definitions.
- `src/gullak/api/`: FastAPI route handlers for chat, threads, ledger operations, and webhooks.
- `src/gullak/ledger/`: Core logic for parsing, writing, and validating ledger files.
- `src/gullak/import_/`: Logic for importing transactions from various bank formats.
- `src/gullak/config/`: Configuration management and Paisa-specific settings.
- `src/gullak/web/`: Frontend components, including Jinja2 templates and Alpine.js logic.
- `whatsapp-bridge/`: Node.js source code for the WhatsApp protocol bridge.
- `data/`: Shared volume containing `.ledger` files, SQLite chat history, and WhatsApp sessions.

## Key Components

### AI Agent
The agent is powered by **LiteLLM**, enabling support for various providers (OpenRouter, OpenAI, Anthropic, etc.). It uses a "tool-calling" loop:
1.  **Parsing**: Identifies entities (amount, payee, category) from user text.
2.  **Validation**: Formats a draft transaction and validates it against `ledger-cli`.
3.  **Confirmation**: (Optional) Prompts the user to review before committing.

### Ledger Engine
A Python implementation for managing plain-text accounting files.
- **Parser**: Extracts accounts and recent transactions for LLM context.
- **Writer**: Appends new transactions with proper formatting and unique IDs.
- **Validator**: Wraps the `ledger` command-line tool to ensure file integrity.

### Web UI
Built with **Alpine.js** and **Tailwind CSS**, providing a fast, reactive experience without a complex build step. It communicates with the FastAPI backend via streaming SSE (Server-Sent Events) for real-time AI responses.

### API Routes
- `/api/chat`: Streaming endpoint for AI interactions.
- `/api/ledger`: Management of ledger entries and accounts.
- `/api/whatsapp`: Webhook receiver for the WhatsApp bridge.
- `/api/setup`: Initial configuration wizard.
