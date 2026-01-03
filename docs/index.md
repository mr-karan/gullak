---
summary: "Main documentation entry point for Gullak, an AI-powered expense tracker using plain-text accounting."
read_when:
  - "When you need an overview of Gullak's documentation"
  - "When you are looking for specific guides on configuration, architecture, or API"
---

# Gullak Documentation

Welcome to the Gullak documentation. Gullak is an AI-powered expense tracker that turns natural language sentences into structured ledger entries using plain-text accounting.

## Introduction

Gullak simplifies expense tracking by allowing you to log transactions through a simple chat interface or WhatsApp. It uses Large Language Models (LLMs) to parse your intent, categorize expenses, and write them to human-readable `.ledger` files.

## Documentation Map

Explore the following guides to learn more about Gullak:

- **[Configuration](./configuration.md)**: A complete reference for environment variables and settings.
- **[Architecture](./architecture.md)**: Detailed overview of Gullak's system design and service interactions.
- **[WhatsApp Integration](./whatsapp.md)**: How to set up and use the WhatsApp bridge for logging expenses.
- **[Ledger & Plain-Text Accounting](./ledger.md)**: Understanding the underlying data format and how Gullak manages your ledger.
- **[API Reference](./API.md)**: Technical documentation for Gullak's REST API.
- **[Troubleshooting](./troubleshooting.md)**: Solutions for common issues and frequently asked questions.
- **[Development Guide](./development.md)**: Instructions for setting up a local development environment.
- **[AI Agents (AGENTS.md)](./AGENTS.md)**: Instructions and context for AI assistants interacting with the codebase.

## Architecture Overview

Gullak is built as a modular stack consisting of three primary services:

1.  **Gullak (FastAPI)**: The core engine that hosts the AI agent, manages the web UI, and performs ledger operations.
2.  **Paisa**: A visualization service that provides a rich dashboard and financial reports by reading the ledger files.
3.  **WhatsApp Bridge (Node.js)**: A service that connects Gullak to WhatsApp, enabling remote expense logging.

These services communicate over a shared volume where the ledger files and session history are stored, ensuring data consistency and portability.

## Quick Links

- [GitHub Repository](https://github.com/mr-karan/gullak)
- [Official Website](https://gullak.fyi) (Coming Soon)
- [Ledger-cli Documentation](https://ledger-cli.org/docs.html)
