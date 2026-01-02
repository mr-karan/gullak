---
summary: "Common issues, error messages, and solutions for Gullak"
read_when:
  - Encountering errors or unexpected behavior
  - Debugging Gullak issues
  - Service not starting or responding
---

# Troubleshooting Guide

This guide provides solutions for common issues you might encounter while running Gullak. If you can't find the answer here, please check the logs or open an issue on GitHub.

## Service Issues

### Gullak not starting
If the Gullak container fails to start or keep restarting:
1.  **Check Logs**: Run `docker compose logs -f gullak`.
2.  **Verify Environment Variables**: Ensure `OPENROUTER_API_KEY` (or provider-specific key) is set. Check if `GULLAK_DATA_DIR` is accessible and writable.
3.  **Port Conflicts**: Ensure port `8000` is not being used by another service.
4.  **Healthcheck Failures**: Gullak waits for `main.ledger` to exist and the health endpoint to respond. If it's your first run, it might take a few seconds to initialize.

### Paisa not showing data
If Paisa dashboard is empty or missing recent transactions:
1.  **Sync Trigger**: Gullak automatically tells Paisa to sync after every transaction. Check Gullak logs for `Paisa sync failed`.
2.  **Paisa URL**: Verify `GULLAK_PAISA_URL` is correct in your `.env`. If using Docker, it should usually be `http://paisa:7500`.
3.  **Ledger File**: Ensure both services are looking at the same `main.ledger` file in the shared volume.

## LLM / Agent Issues

### "API key not configured"
This error occurs if the agent cannot find a valid API key for the selected model.
- **Solution**: Set the appropriate environment variable (`OPENROUTER_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, or `ANTHROPIC_API_KEY`) in your `.env` file and restart the container.

### Agent loop exceeded (Infinite loop)
The agent is limited to 10 iterations per message to prevent infinite loops.
- **Diagnosis**: If the agent keeps trying to use the same tool repeatedly without success, it might be due to ambiguous instructions or a model that is struggling with the prompt.
- **Solution**: Try rephrasing your request or check if the ledger format has become too complex for the model.

### Timeouts
LLM responses can sometimes time out, especially with larger models or high latency.
- **Solution**: Check your internet connection or try a faster model like `gemini-2.0-flash`.

## Ledger Issues

### Parse Errors
If Gullak fails to read your ledger file:
- **Diagnosis**: The ledger file might contain syntax that `LedgerParser` doesn't recognize (e.g., complex automated transactions or custom includes).
- **Solution**: Ensure your ledger follows the standard `ledger-cli` format. You can validate it manually using:
  ```bash
  ledger -f data/main.ledger balance
  ```

### Validation Failures
When adding a transaction, if you see "Transaction would create invalid ledger":
- **Diagnosis**: The AI might have generated a transaction that doesn't balance (credits != debits) or uses non-existent accounts if strict mode is on.
- **Solution**: Review the transaction preview. If the accounts are wrong, tell the agent: *"Actually, use Assets:Bank:HDFC for payment."*

### Unbalanced Transactions
Ledger requires every transaction to sum to zero.
- **Diagnosis**: If you manually edited the `.ledger` file and missed an amount, Paisa and Gullak might show errors.
- **Solution**: Fix the transaction in the text file so that the sum of postings is zero.

## WhatsApp Issues

### QR code not generating
- **Diagnosis**: The WhatsApp bridge might be unable to start the session.
- **Solution**: 
  1. Check `docker compose logs -f whatsapp-bridge`.
  2. Ensure `GULLAK_WAHA_BASE_URL` is set correctly (`http://whatsapp-bridge:3000`).
  3. Try restarting the bridge: `docker compose restart whatsapp-bridge`.

### Session stuck on "STARTING"
- **Diagnosis**: The bridge is trying to initialize but failing to connect to WhatsApp servers.
- **Solution**: Ensure your server has outbound internet access. If the session is corrupted, reset it (see commands below).

### Messages not being received
- **Diagnosis**: The webhook might be failing or the sender is not in the allowlist.
- **Solution**:
  1. Check `GULLAK_WHATSAPP_ALLOWED_NUMBERS` in `.env`.
  2. Verify the webhook URL in `whatsapp-bridge` logs. It should be `http://gullak:8000/api/whatsapp/webhook`.

## Docker Issues

### Container health checks failing
- **Diagnosis**: Usually means the service is running but not responding on the expected port or the data file is missing.
- **Solution**: Check logs for both `gullak` and `whatsapp-bridge`. Ensure the `data` volume is correctly mounted.

### Volume Permissions
If you see "Permission denied" errors:
- **Solution**: Set `GULLAK_UID` and `GULLAK_GID` in your `.env` to match your host user's ID (usually `1000`).
  ```bash
  GULLAK_UID=$(id -u)
  GULLAK_GID=$(id -g)
  ```

## Useful Commands

### View Logs
```bash
# View all logs
docker compose logs -f

# View specific service logs
docker compose logs -f gullak
docker compose logs -f whatsapp-bridge
```

### Reset WhatsApp Session
If you are unable to connect or want to link a different number:
```bash
# Stop services
docker compose down

# Remove the WhatsApp session volume
docker volume rm gullak_whatsapp_session

# Start services again
docker compose up -d
```

### Validate Ledger Manually
If Gullak reports ledger errors, run this inside the container to see exactly where:
```bash
docker compose exec gullak ledger -f /data/main.ledger balance
```

### Manual Paisa Sync
If Paisa is out of sync, you can trigger it manually:
```bash
curl -X POST http://localhost:7500/api/sync -H "Content-Type: application/json" -d '{"journal": true}'
```
