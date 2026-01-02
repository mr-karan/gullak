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

## Reverse Proxy Setup

For production use, it is highly recommended to use a reverse proxy like **Caddy** for automatic HTTPS. There are two approaches depending on your setup.

### Option A: Localhost Binding (Simple)

If Caddy runs on the same host (not in Docker), bind ports to localhost:

1.  **Configure Ports** in `.env`:
    ```bash
    GULLAK_HOST_PORT=127.0.0.1:8000
    PAISA_HOST_PORT=127.0.0.1:7500
    ```

2.  **Caddyfile**:
    ```caddy
    gullak.example.com {
        reverse_proxy localhost:8000
    }

    paisa.example.com {
        reverse_proxy localhost:7500
    }
    ```

### Option B: Docker Network (Recommended for Homelab)

If Caddy runs in Docker alongside Gullak, use Docker networks for container-to-container communication. This avoids port binding entirely.

1.  **Create a shared proxy network** (if not exists):
    ```bash
    docker network create public_proxy
    ```

2.  **Configure Gullak** - set data directory and disable port binding:
    ```bash
    # .env
    GULLAK_DATA_DIR=/mnt/storage/gullak  # Your persistent storage path
    GULLAK_HOST_PORT=127.0.0.1:8000      # Or remove ports entirely
    PAISA_HOST_PORT=127.0.0.1:7500
    ```

3.  **Launch Gullak**:
    ```bash
    docker compose -f docker-compose.prod.yml up -d --build
    ```

4.  **Connect containers to proxy network**:
    ```bash
    # Connect both gullak and paisa to the shared network
    docker network connect public_proxy gullak
    docker network connect public_proxy paisa
    ```

5.  **Caddyfile** - use container names instead of localhost:
    ```caddy
    gullak.example.com {
        reverse_proxy gullak:8000
    }

    paisa.example.com {
        reverse_proxy paisa:7500
    }
    ```

6.  **Reload Caddy**:
    ```bash
    docker exec caddy caddy reload --config /etc/caddy/Caddyfile
    ```

#### Important Notes for Docker Network Setup

- **After rebuilding containers**: You must reconnect to the proxy network. Container recreation disconnects from external networks.
  ```bash
  # After docker compose up -d --build
  docker network connect public_proxy gullak
  docker network connect public_proxy paisa
  ```

- **Network persistence**: Add this to a deploy script to automate reconnection:
  ```bash
  #!/bin/bash
  cd ~/gullak
  git pull
  docker compose -f docker-compose.prod.yml up -d --build
  docker network connect public_proxy gullak 2>/dev/null || true
  docker network connect public_proxy paisa 2>/dev/null || true
  ```

- **Verify connectivity**:
  ```bash
  # Check containers are on the network
  docker network inspect public_proxy --format '{{range .Containers}}{{.Name}} {{end}}'
  
  # Test internal DNS resolution from Caddy
  docker exec caddy nslookup gullak
  ```

## Data Backup

Gullak stores all persistent data in a single directory. The location depends on your configuration:

- **Docker volume** (default): `gullak_data` named volume
- **Bind mount** (recommended): Path set via `GULLAK_DATA_DIR` environment variable

### Data Directory Contents

| Path | Contents |
|------|----------|
| `*.ledger` | Your transaction files |
| `paisa.yaml` | Paisa dashboard configuration |
| `paisa.db` | Paisa database (auto-generated) |
| `threads/` | Chat history per conversation |
| `whatsapp-session/` | WhatsApp authentication state |

### Backup Commands

**If using bind mount** (e.g., `GULLAK_DATA_DIR=/mnt/storage/gullak`):
```bash
# Direct backup - just copy the directory
tar -czf gullak_backup_$(date +%F).tar.gz /mnt/storage/gullak
```

**If using Docker volume**:
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
    docker compose -f docker-compose.prod.yml up -d --build
    ```

3.  **Reconnect to Proxy Network** (if using Docker network setup):
    ```bash
    docker network connect public_proxy gullak 2>/dev/null || true
    docker network connect public_proxy paisa 2>/dev/null || true
    ```

4.  **Cleanup**:
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
