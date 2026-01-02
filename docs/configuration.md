---
summary: "All configuration options for Gullak with examples"
read_when:
  - Configuring Gullak
  - Adding or modifying environment variables
  - Troubleshooting configuration issues
---

# Configuration Reference

Gullak is configured primarily through environment variables. It follows a consistent naming convention:

- **Application Settings**: Prefixed with `GULLAK_` (e.g., `GULLAK_DEFAULT_CURRENCY`).
- **Provider API Keys**: Industry standard names without prefix (e.g., `OPENAI_API_KEY`) to ensure compatibility with various tools and libraries.

You can set these variables in your shell environment or by creating a `.env` file in the project root.

## 1. Inference Configuration

Gullak uses LLMs to parse natural language into ledger entries. It supports multiple providers via LiteLLM.

| Variable | Description | Default |
|----------|-------------|---------|
| `GULLAK_INFERENCE_MODEL` | Model identifier in LiteLLM format. Supports OpenRouter, OpenAI, Anthropic, Gemini, Ollama, etc. | `openrouter/google/gemini-2.0-flash-001` |
| `GULLAK_INFERENCE_CONTEXT_LENGTH` | Maximum tokens to pass to the model. | `8192` |
| `OPENROUTER_API_KEY` | API key for [OpenRouter](https://openrouter.ai/) (Recommended). | - |
| `OPENAI_API_KEY` | API key for direct OpenAI access. | - |
| `OPENAI_BASE_URL` | Custom endpoint for OpenAI-compatible APIs. | - |
| `GOOGLE_API_KEY` | API key for Google Gemini models. | - |
| `ANTHROPIC_API_KEY` | API key for Anthropic Claude models. | - |
| `OLLAMA_BASE_URL` | Base URL for local [Ollama](https://ollama.com/) instance. | `http://localhost:11434` |

### Provider Selection
Gullak automatically detects the provider based on the `GULLAK_INFERENCE_MODEL` string. For example, if the model starts with `openrouter/`, it will use `OPENROUTER_API_KEY`.

## 2. Ledger Configuration

These settings control how Gullak interacts with your plain-text accounting files.

| Variable | Description | Default |
|----------|-------------|---------|
| `GULLAK_DATA_DIR` | Directory where ledger files and chat history are stored. | `./data` |
| `GULLAK_LEDGER_FILE` | Name of the main ledger file. | `main.ledger` |
| `GULLAK_LEDGER_CLI` | The command-line tool used for validation (`ledger` or `hledger`). | `ledger` |
| `GULLAK_DEFAULT_CURRENCY` | Your primary currency symbol. | `INR` |
| `GULLAK_TIMEZONE` | Your local timezone for transaction dating. | `Asia/Kolkata` |

## 3. WhatsApp Integration

Gullak can receive messages via a Baileys-based WhatsApp bridge.

| Variable | Description | Default |
|----------|-------------|---------|
| `GULLAK_WHATSAPP_BRIDGE_URL` | URL of the WhatsApp bridge service. | `http://whatsapp-bridge:3000` |
| `GULLAK_WHATSAPP_API_KEY` | Optional API key for bridge security. | - |
| `GULLAK_WHATSAPP_ALLOWED_NUMBERS` | JSON array of phone numbers allowed to interact with the bot (e.g., `["919876543210"]`). | `[]` |
| `GULLAK_WHATSAPP_GROUP_REQUIRE_MENTION` | If true, the bot only responds in groups when mentioned. | `false` |

## 4. Media Processing (Receipt OCR)

Configuration for the receipt scanning and document processing feature.

| Variable | Description | Default |
|----------|-------------|---------|
| `GULLAK_MEDIA_MAX_IMAGE_SIZE` | Maximum allowed size for image uploads (bytes). | `5242880` (5MB) |
| `GULLAK_MEDIA_MAX_PDF_SIZE` | Maximum allowed size for PDF uploads (bytes). | `10485760` (10MB) |

## 5. Application Settings

General settings for the FastAPI application.

| Variable | Description | Default |
|----------|-------------|---------|
| `GULLAK_PAISA_URL` | URL of the [Paisa](https://paisa.fyi) visualization service. | `http://localhost:7500` |
| `GULLAK_DEBUG` | Enable debug mode for verbose logging and stack traces. | `false` |
| `GULLAK_HOST` | Host address to bind the server to. | `0.0.0.0` |
| `GULLAK_PORT` | Port to run the FastAPI application on. | `8000` |

---

## Example Configurations

### Minimal Config (OpenRouter)
This is the recommended setup for most users.

```bash
# .env
GULLAK_INFERENCE_MODEL=openrouter/google/gemini-2.0-flash-001
OPENROUTER_API_KEY=sk-or-v1-your-key-here
GULLAK_DEFAULT_CURRENCY=USD
GULLAK_TIMEZONE=America/New_York
```

### Full Config (WhatsApp + Ollama + Custom Paths)
A more complex setup with local LLM and security restrictions.

```bash
# .env
# Inference
GULLAK_INFERENCE_MODEL=ollama/llama3
OLLAMA_BASE_URL=http://192.168.1.10:11434
GULLAK_INFERENCE_CONTEXT_LENGTH=4096

# Ledger
GULLAK_DATA_DIR=/home/user/finance
GULLAK_LEDGER_FILE=2024.ledger
GULLAK_DEFAULT_CURRENCY=EUR
GULLAK_TIMEZONE=Europe/Berlin

# WhatsApp
GULLAK_WHATSAPP_BRIDGE_URL=http://localhost:3000
GULLAK_WHATSAPP_API_KEY=my-secret-key
GULLAK_WHATSAPP_ALLOWED_NUMBERS='["49123456789"]'
GULLAK_WHATSAPP_GROUP_REQUIRE_MENTION=true

# App
GULLAK_DEBUG=true
GULLAK_PORT=9000
```
