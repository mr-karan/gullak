---
summary: "Production deployment guide for Gullak using Docker"
read_when:
  - Deploying Gullak to production
  - Setting up Gullak on a server
  - Configuring reverse proxy for Gullak
---

# Production Deployment Guide

This guide provides step-by-step instructions for deploying Gullak in a production environment using Docker Compose.

## Prerequisites

Before you begin, ensure your server meets the following requirements:

- **Docker**: Engine version 20.10.0 or higher.
- **Docker Compose**: Version 2.0.0 or higher.
- **Resources**: At least 1GB of RAM and 1 CPU core (2GB RAM recommended).
- **Domain Name**: A domain or subdomain (e.g., `gullak.example.com`) for HTTPS.

## Quick Start

Deploy Gullak in three simple steps:

1.  **Clone and Prepare**:
    ```bash
    git clone https://github.com/mr-karan/gullak.git
    cd gullak
    cp .env.production.example .env
    ```

2.  **Configure**:
    Edit `.env` and set your `OPENROUTER_API_KEY`.
    ```bash
    nano .env
    ```

3.  **Launch**:
    ```bash
    docker compose -f docker-compose.prod.yml up -d
    ```

Gullak will be available at `http://localhost:8000` (bound to 127.0.0.1 by default).

## Configuration

Gullak is configured via environment variables in the `.env` file. For a full list of options, see the [Configuration Reference](./configuration.md).

### Essential Variables

| Variable | Description | Recommendation |
|----------|-------------|----------------|
| `OPENROUTER_API_KEY` | API key for LLM access. | **Required** |
| `GULLAK_DEFAULT_CURRENCY` | Primary currency symbol. | e.g., `USD`, `INR` |
| `TZ` | Server timezone. | e.g., `Asia/Kolkata` |
| `GULLAK_HOST_PORT` | Port binding for Gullak UI. | `127.0.0.1:8000` |
| `PAISA_HOST_PORT` | Port binding for Paisa dashboard. | `127.0.0.1:7500` |

### User Permissions
If you encounter permission issues with Docker volumes, set the `GULLAK_UID` and `GULLAK_GID` to match your host user:
```bash
GULLAK_UID=$(id -u)
GULLAK_GID=$(id -g)
```

## Reverse Proxy Setup (Caddy)

For production use, it is highly recommended to use a reverse proxy like **Caddy** for automatic HTTPS.

1.  **Expose Ports**: In your `.env`, change the host ports to allow the proxy to connect (or keep them at `127.0.0.1` if Caddy is on the same host).
    ```bash
    GULLAK_HOST_PORT=127.0.0.1:8000
    PAISA_HOST_PORT=127.0.0.1:7500
    ```

2.  **Caddyfile Example**:
    ```caddy
    gullak.example.com {
        reverse_proxy localhost:8000
    }

    paisa.example.com {
        reverse_proxy localhost:7500
    }
    ```

3.  **Start Caddy**:
    ```bash
    caddy run --config Caddyfile
    ```

## Data Backup

Gullak stores all persistent data in Docker named volumes. You should regularly back these up.

- **`gullak_data`**: Contains your `.ledger` files, chat history, and Paisa configuration.
- **`gullak_whatsapp_session`**: Contains WhatsApp authentication state.

### Manual Backup Command
```bash
docker run --rm -v gullak_data:/volume -v $(pwd):/backup alpine \
  tar -czf /backup/gullak_data_$(date +%F).tar.gz -C /volume .
```

## Updating Gullak

To update to the latest version:

1.  **Pull Changes**:
    ```bash
    git pull origin main
    ```

2.  **Rebuild and Restart**:
    ```bash
    docker compose -f docker-compose.prod.yml build --pull
    docker compose -f docker-compose.prod.yml up -d
    ```

3.  **Cleanup**:
    ```bash
    docker image prune -f
    ```

## Monitoring & Logs

### Check Logs
```bash
# All services
docker compose -f docker-compose.prod.yml logs -f

# Specific service
docker compose -f docker-compose.prod.yml logs -f gullak
```

### Health Endpoints
- **Gullak**: `http://localhost:8000/health`
- **WhatsApp Bridge**: `http://localhost:3000/api/status` (Internal to Docker)

## Security Checklist

- [ ] **LLM API Key**: Ensure your API key is kept secret and has usage limits set at the provider level.
- [ ] **WhatsApp Allowed Numbers**: Set `GULLAK_WHATSAPP_ALLOWED_NUMBERS` to restrict bot access.
- [ ] **WhatsApp API Key**: Set `GULLAK_WHATSAPP_API_KEY` for internal bridge communication.
- [ ] **Firewall**: Ensure ports `8000` and `7500` are NOT open to the public internet; use a reverse proxy with HTTPS.
- [ ] **Backups**: Automate daily backups of the `gullak_data` volume.
