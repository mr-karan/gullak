# SMS capture

Gullak turns bank and UPI transaction messages into **reviewable expense
drafts** — you confirm each one in the Inbox before it becomes a transaction.
Parsing always happens on **your** sync server (see [Self-hosting](self-hosting.md)),
never on a third party. So SMS capture needs a sync server configured first.

How messages get *in* differs by platform, because the two operating systems
treat SMS very differently.

## Android — native, automatic

Android lets an app read transactional SMS directly, so there's nothing to wire
up:

1. Settings → **Read transactional SMS** → enable (grant the permission).
2. Gullak forwards each bank/UPI message to your sync server, which parses it
   and drops a draft into the **Inbox**.
3. Review and confirm. Old messages from the last few days are swept in on first
   enable.

Only bank/transactional senders are read; everything else is ignored. You can
turn it off any time.

## iOS — via a Shortcut

**iOS gives no app access to your SMS inbox — there is no API for it, by design.**
So Gullak can't read messages directly the way the Android app does. The
supported path is a one-time **Shortcuts personal automation** that forwards
matching messages to your server's ingest endpoint. It runs on-device,
automatically, with nothing to install beyond the stock Shortcuts app.

!!! info "What you'll need"
    Your **sync server URL** and **API key** (the same ones you enter in
    Gullak → Settings → Sync server).

### Set up the automation

1. Open **Shortcuts** → **Automation** tab → **+** → **Create Personal Automation**.
2. Choose **Message**. Under *Sender*, add your bank/UPI sender IDs (e.g.
   `HDFCBK`, `SBIUPI`). Leave *Message* set to "contains" empty to match all
   from those senders. Tap **Next**.
3. Add action **Get Contents of URL** and configure it:
     - **URL:** `https://YOUR-SERVER/v1/sms/ingest`
     - **Method:** `POST`
     - **Headers:**
         - `x-api-key` → *your API key*
         - `Content-Type` → `application/json`
     - **Request Body:** `JSON`, with two fields:
         - `sender` → (Shortcuts variable) **Sender**
         - `body` → (Shortcuts variable) **Message**
4. Tap **Next**, then turn **Run Immediately** ON and **Notify When Run** OFF so
   it fires silently.
5. **Done.** New matching messages now appear as drafts in Gullak's Inbox
   after the next sync.

!!! tip "Test it"
    Send yourself a text from one of the configured senders (or temporarily add
    your own number as a sender), then pull-to-sync in Gullak. A draft should
    appear in the Inbox.

### What the endpoint does

`POST /v1/sms/ingest` runs the **same parser** the Android path uses, then
**queues a draft** for the phone to pick up on its next sync. It never writes a
transaction on its own — you always confirm in the Inbox.

Request:

```json
{
  "sender": "HDFCBK",
  "body": "Sent Rs.480.00 from HDFC Bank A/c to BLINKIT on 16-07-26 UPI Ref 5512...",
  "receivedAt": 1784000000000
}
```

- `sender` — the SMS sender id (required).
- `body` — the full message text (required).
- `receivedAt` — epoch **milliseconds** (optional; defaults to the server's
  clock if your Shortcut can't supply it).

Response — a transaction was recognised and queued:

```json
{ "status": "transaction", "id": "…", "candidate": { "amountCents": -48000, "payee": "Blinkit", … } }
```

Response — not a transaction (an OTP, promo, or balance alert). Nothing is
queued; the Shortcut is done:

```json
{ "status": "not_a_txn", "ignored": true }
```

### Caveats (be realistic)

- iOS automations are less bulletproof than Android's background reader. Modern
  iOS runs them without a tap, but they can occasionally need the device
  unlocked and may be delayed under aggressive battery saving.
- **No backfill.** The automation only sees messages that arrive *after* you set
  it up — it can't reach into your history.
- If you rotate your server API key, update it in the Shortcut too.

## Fixing bad parses

However a message arrives, if the parser mislabels a payee or category, correct
it once in the Inbox — the correction is remembered for that merchant next time.
