import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import express from "express";
import QRCode from "qrcode";
import pino from "pino";
import { Boom } from "@hapi/boom";
import { mkdirSync, existsSync, copyFileSync, readFileSync } from "fs";

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://gullak:8000/api/whatsapp/webhook";
const AUTH_DIR = process.env.AUTH_DIR || "/data/whatsapp-session";
const API_KEY = process.env.GULLAK_WHATSAPP_API_KEY || "";
const LOG_LEVEL = process.env.LOG_LEVEL || "warn";
const VERSION = "1.0.0";

const logger = pino({ level: LOG_LEVEL });
const app = express();
app.use(express.json());

let sock = null;
let qrCode = null;
let connectionStatus = "STOPPED";
let me = null;

if (!existsSync(AUTH_DIR)) {
  mkdirSync(AUTH_DIR, { recursive: true });
}

function authMiddleware(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers["x-api-key"];
  if (key !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.use(authMiddleware);

function getCredsPath() {
  return `${AUTH_DIR}/creds.json`;
}

function getBackupPath() {
  return `${AUTH_DIR}/creds.json.bak`;
}

function maybeRestoreCredsFromBackup() {
  try {
    const credsPath = getCredsPath();
    const backupPath = getBackupPath();
    
    if (existsSync(credsPath)) {
      const raw = readFileSync(credsPath, "utf-8");
      JSON.parse(raw);
      return;
    }
    
    if (!existsSync(backupPath)) return;
    
    const backupRaw = readFileSync(backupPath, "utf-8");
    JSON.parse(backupRaw);
    copyFileSync(backupPath, credsPath);
    logger.warn("Restored corrupted creds.json from backup");
  } catch {
    // ignore
  }
}

function backupCreds() {
  try {
    const credsPath = getCredsPath();
    const backupPath = getBackupPath();
    if (existsSync(credsPath)) {
      const raw = readFileSync(credsPath, "utf-8");
      JSON.parse(raw);
      copyFileSync(credsPath, backupPath);
    }
  } catch {
    // ignore
  }
}

async function sendWebhook(event, payload) {
  if (!WEBHOOK_URL) return;
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, payload }),
    });
    if (!response.ok) {
      logger.warn({ status: response.status }, "Webhook failed");
    }
  } catch (err) {
    logger.error({ err: err.message }, "Webhook error");
  }
}

async function connectWhatsApp() {
  maybeRestoreCredsFromBackup();
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    version,
    logger,
    printQRInTerminal: false,
    browser: ["Gullak", "Chrome", VERSION],
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on("creds.update", () => {
    backupCreds();
    saveCreds();
  });

  sock.ev.on("connection.update", (update) => {
    try {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        qrCode = qr;
        connectionStatus = "SCAN_QR_CODE";
        logger.info("QR code generated");
      }

      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
        logger.info({ reason }, "Connection closed");

        if (reason === DisconnectReason.loggedOut) {
          connectionStatus = "STOPPED";
          qrCode = null;
          me = null;
          logger.info("Logged out, not reconnecting");
        } else {
          connectionStatus = "STARTING";
          setTimeout(connectWhatsApp, 3000);
        }
      }

      if (connection === "open") {
        connectionStatus = "WORKING";
        qrCode = null;
        me = sock.user;
        logger.info({ user: me?.id }, "Connected");
      }
    } catch (err) {
      logger.error({ error: String(err) }, "connection.update handler error");
    }
  });

  if (sock.ws && typeof sock.ws.on === "function") {
    sock.ws.on("error", (err) => {
      logger.error({ error: String(err) }, "WebSocket error");
    });
  }

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;

    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      if (!msg.message) continue;

      const text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.documentMessage?.caption ||
        "";

      const imageMessage = msg.message.imageMessage;
      const documentMessage = msg.message.documentMessage;
      const hasMedia = imageMessage || documentMessage;

      if (!text.trim() && !hasMedia) continue;

      const payload = {
        id: msg.key.id,
        from: msg.key.remoteJid,
        fromMe: msg.key.fromMe,
        author: msg.key.participant || msg.key.remoteJid,
        body: text,
        timestamp: msg.messageTimestamp,
        media: null,
      };

      if (hasMedia) {
        try {
          const buffer = await downloadMediaMessage(
            msg,
            "buffer",
            {},
            {
              logger,
              reuploadRequest: sock.updateMediaMessage,
            }
          );

          const mimetype = imageMessage?.mimetype || documentMessage?.mimetype;
          const filename = documentMessage?.fileName || null;

          payload.media = {
            type: imageMessage ? "image" : "document",
            mimetype: mimetype,
            filename: filename,
            data: buffer.toString("base64"),
            size: buffer.length,
          };

          logger.info(
            { from: payload.from, mediaType: payload.media.type, size: payload.media.size },
            "Media message received"
          );
        } catch (err) {
          logger.error({ err: err.message }, "Failed to download media");
        }
      } else {
        logger.info({ from: payload.from }, "Text message received");
      }

      await sendWebhook("message", payload);
    }
  });
}

app.get("/api/status", (req, res) => {
  res.json({
    connected: connectionStatus === "WORKING",
    status: connectionStatus,
    me: me ? { id: me.id, name: me.name } : null,
  });
});

app.get("/api/sessions/default", (req, res) => {
  res.json({
    name: "default",
    status: connectionStatus,
    me: me ? { id: me.id, name: me.name } : null,
    engine: { engine: "BAILEYS" },
  });
});

app.post("/api/sessions/default/start", async (req, res) => {
  if (connectionStatus === "WORKING") {
    return res.json({ status: "already_connected" });
  }
  connectionStatus = "STARTING";
  connectWhatsApp();
  res.json({ status: "starting" });
});

app.post("/api/default/auth/start", async (req, res) => {
  if (connectionStatus === "WORKING") {
    return res.json({ status: "connected", message: "Already connected" });
  }
  if (connectionStatus === "STARTING" || connectionStatus === "SCAN_QR_CODE") {
    return res.json({ status: connectionStatus, message: "Session already starting" });
  }
  connectionStatus = "STARTING";
  connectWhatsApp();
  res.json({ status: "starting", message: "Session starting. QR code will be ready shortly." });
});

app.get("/api/default/auth/qr", async (req, res) => {
  if (connectionStatus === "WORKING") {
    return res.status(200).json({ status: "connected", message: "Already connected" });
  }

  if (connectionStatus === "STOPPED") {
    return res.status(200).json({ 
      status: "stopped", 
      message: "Session not started. Call POST /api/default/auth/start first." 
    });
  }

  if (!qrCode) {
    return res.status(202).json({
      status: connectionStatus,
      message: "QR code generating. Refresh in a moment.",
    });
  }

  try {
    const qrImage = await QRCode.toBuffer(qrCode, { type: "png", width: 300 });
    res.setHeader("Content-Type", "image/png");
    res.send(qrImage);
  } catch (err) {
    logger.error({ err: err.message }, "QR generation failed");
    res.status(500).json({ error: "Failed to generate QR" });
  }
});

app.post("/api/sendText", async (req, res) => {
  const { chatId, text } = req.body;

  if (!sock || connectionStatus !== "WORKING") {
    return res.status(503).json({ error: "Not connected" });
  }

  if (!chatId || !text) {
    return res.status(400).json({ error: "chatId and text required" });
  }

  try {
    await sock.sendMessage(chatId, { text });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err: err.message, chatId }, "Send failed");
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/sendSeen", async (req, res) => {
  const { chatId } = req.body;
  if (!sock || connectionStatus !== "WORKING") {
    return res.status(503).json({ error: "Not connected" });
  }
  try {
    await sock.readMessages([{ remoteJid: chatId, id: undefined }]);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post("/api/startTyping", async (req, res) => {
  const { chatId } = req.body;
  if (!sock || connectionStatus !== "WORKING") {
    return res.json({ success: false });
  }
  try {
    await sock.sendPresenceUpdate("composing", chatId);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.post("/api/stopTyping", async (req, res) => {
  const { chatId } = req.body;
  if (!sock || connectionStatus !== "WORKING") {
    return res.json({ success: false });
  }
  try {
    await sock.sendPresenceUpdate("paused", chatId);
    res.json({ success: true });
  } catch (err) {
    res.json({ success: false });
  }
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

async function checkExistingSession() {
  const credsPath = getCredsPath();
  maybeRestoreCredsFromBackup();
  if (existsSync(credsPath)) {
    try {
      const raw = readFileSync(credsPath, "utf-8");
      JSON.parse(raw);
      logger.info("Found existing session, auto-connecting...");
      connectionStatus = "STARTING";
      connectWhatsApp();
    } catch {
      logger.info("Corrupted session, waiting for QR scan request.");
    }
  } else {
    logger.info("No existing session. Waiting for QR scan request.");
  }
}

app.listen(PORT, () => {
  logger.info({ port: PORT }, "WhatsApp bridge started");
  checkExistingSession();
});
