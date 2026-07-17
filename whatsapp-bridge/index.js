import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  downloadMediaMessage,
  normalizeMessageContent,
} from "@whiskeysockets/baileys";
import express from "express";
import QRCode from "qrcode";
import pino from "pino";
import { Boom } from "@hapi/boom";

import {
  createGroupMetadataCache,
  createLidCache,
  openBridgeDb,
  useSqliteAuthState,
} from "./store.js";

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL || "http://localhost:8787/v1/whatsapp/webhook";
// Shared secret the server's webhook validates (when set). Same value both
// containers get via the shared env file.
const WEBHOOK_SECRET =
  process.env.GULLAK_WHATSAPP_API_KEY || process.env.WEBHOOK_SECRET || "";
// Single SQLite file owns auth state + the small caches the bridge
// used to keep in memory. Survives restarts; no JSON files on disk.
const STORE_DB_PATH = process.env.STORE_DB_PATH || "./data/whatsapp.db";
const API_KEY = process.env.GULLAK_WHATSAPP_API_KEY || "";
const LOG_LEVEL = process.env.LOG_LEVEL || "warn";
const VERSION = "1.0.0";

function getListEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) {
      return value.split(",").map((item) => item.trim()).filter(Boolean);
    }
  }

  return [];
}

// Allowed group names (comma-separated). If set, only messages from groups with these names are processed.
// Example: "Family Budget,Household Expenses"
const ALLOWED_GROUPS = getListEnv("ALLOWED_GROUPS", "GULLAK_WHATSAPP_ALLOWED_GROUPS")
  .map((n) => n.toLowerCase());

// Allowed phone numbers (comma-separated). If set, only DMs from these authors are processed.
// Example: "919876543210,918851607899" (no @s.whatsapp.net suffix needed)
const ALLOWED_PHONE_NUMBERS = getListEnv(
  "ALLOWED_PHONE_NUMBERS",
  "GULLAK_WHATSAPP_ALLOWED_NUMBERS",
);

const LID_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours
const bridgeDb = openBridgeDb(STORE_DB_PATH);
const lidPhoneCache = createLidCache(bridgeDb, LID_CACHE_TTL_MS);
const groupMetadataCache = createGroupMetadataCache(bridgeDb);

function cacheLidMapping(lid, phone) {
  if (!lid || !phone) return;
  const lidKey = lid.split("@")[0].split(":")[0]; // strip @lid and :device
  lidPhoneCache.set(lidKey, phone);
}

function resolvePhoneFromLidCache(lid) {
  const lidKey = lid.split("@")[0].split(":")[0];
  return lidPhoneCache.get(lidKey);
}

async function resolveGroupLidMappings(chatId) {
  if (!sock) return;
  try {
    const metadata = await sock.groupMetadata(chatId);
    for (const p of metadata.participants || []) {
      if (p.lid && p.phoneNumber) {
        cacheLidMapping(p.lid, p.phoneNumber.split("@")[0].split(":")[0]);
      }
      // Also cache id -> phoneNumber if id is a LID
      if (p.id?.includes("@lid") && p.phoneNumber) {
        cacheLidMapping(p.id, p.phoneNumber.split("@")[0].split(":")[0]);
      }
    }
    logger.info({ groupId: chatId, mappings: lidPhoneCache.size() }, "Resolved LID mappings from group metadata");
  } catch (err) {
    logger.warn({ groupId: chatId, err: err.message }, "Failed to resolve LID mappings");
  }
}

const logger = pino({ level: LOG_LEVEL });
const app = express();
app.use(express.json());

let sock = null;
let qrCode = null;
let connectionStatus = "STOPPED";
let me = null;


function authMiddleware(req, res, next) {
  if (!API_KEY) return next();
  const key = req.headers["x-api-key"];
  if (key !== API_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

app.use(authMiddleware);

// SQLite + WAL journaling gives us atomic creds writes for free, so
// the old fs-based backup-and-restore dance is gone.

async function sendWebhook(event, payload) {
  if (!WEBHOOK_URL) return;
  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(WEBHOOK_SECRET ? { "x-api-key": WEBHOOK_SECRET } : {}),
      },
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
  const { state, saveCreds } = useSqliteAuthState(bridgeDb);
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

      const chatId = msg.key.remoteJid;
      const isGroup = chatId.endsWith("@g.us");
      const author = msg.key.participant || chatId;

      // Resolve phone number: handle both @s.whatsapp.net and @lid formats
      let authorNumber = author.split("@")[0].split(":")[0];
      let resolvedPhone = null;

      if (author.includes("@lid")) {
        // Try cache first, then fetch group metadata
        resolvedPhone = resolvePhoneFromLidCache(author);
        if (!resolvedPhone && isGroup) {
          await resolveGroupLidMappings(chatId);
          resolvedPhone = resolvePhoneFromLidCache(author);
        }
        if (resolvedPhone) {
          authorNumber = resolvedPhone;
          logger.debug({ lid: author, resolved: resolvedPhone }, "Resolved LID to phone");
        }
      }

      // Gate messages by group name (for groups) or phone number (for DMs)
      if (isGroup) {
        if (ALLOWED_GROUPS.length > 0) {
          // Get group name from cache or fetch it
          let groupName = groupMetadataCache.get(chatId);
          if (groupName == null) {
            try {
              const metadata = await sock.groupMetadata(chatId);
              groupName = metadata.subject?.toLowerCase() || "";
              groupMetadataCache.set(chatId, groupName);
              logger.info({ groupId: chatId, groupName: metadata.subject }, "Fetched group metadata");
            } catch (err) {
              logger.warn({ groupId: chatId, err: err.message }, "Failed to fetch group metadata");
              groupName = "";
            }
          }

          if (!ALLOWED_GROUPS.includes(groupName)) {
            logger.info({ from: chatId, groupName }, "Message ignored: group not in allowed list");
            continue;
          }
        }
      } else {
        // For DMs: if phone numbers are configured, check against them
        // If no phone filter is set, block all DMs when group filtering is enabled
        if (ALLOWED_PHONE_NUMBERS.length > 0) {
          if (!ALLOWED_PHONE_NUMBERS.includes(authorNumber)) {
            logger.info({ from: chatId, author: authorNumber }, "Message ignored: sender not in allowed phone numbers");
            continue;
          }
        } else if (ALLOWED_GROUPS.length > 0) {
          // Groups are configured but no phone allowlist - block all DMs
          logger.info({ from: chatId }, "Message ignored: DMs blocked (only group messages allowed)");
          continue;
        }
      }

      const content = normalizeMessageContent(msg.message);
      if (!content) continue;

      const text =
        content.conversation ||
        content.extendedTextMessage?.text ||
        content.imageMessage?.caption ||
        content.videoMessage?.caption ||
        content.documentMessage?.caption ||
        "";

      const imageMessage = content.imageMessage;
      const videoMessage = content.videoMessage;
      const documentMessage = content.documentMessage;
      const audioMessage = content.audioMessage;
      const stickerMessage = content.stickerMessage;
      const hasMedia = imageMessage || videoMessage || documentMessage || audioMessage || stickerMessage;

      logger.debug({ msgId: msg.key.id, hasMedia: !!hasMedia, keys: Object.keys(content) }, "Processing message");

      if (!text.trim() && !hasMedia) continue;

      // Extract quoted message context from replies
      const contextInfo = content.extendedTextMessage?.contextInfo ||
        content.imageMessage?.contextInfo ||
        content.videoMessage?.contextInfo ||
        content.documentMessage?.contextInfo;
      let quotedText = null;
      let quotedMessageId = null;
      if (contextInfo?.quotedMessage) {
        quotedMessageId = contextInfo.stanzaId || null;
        const quoted = normalizeMessageContent(contextInfo.quotedMessage);
        if (quoted) {
          quotedText = quoted.conversation ||
            quoted.extendedTextMessage?.text ||
            quoted.imageMessage?.caption ||
            quoted.videoMessage?.caption ||
            quoted.documentMessage?.caption ||
            null;
        }
      }

      const payload = {
        id: msg.key.id,
        from: msg.key.remoteJid,
        fromMe: msg.key.fromMe,
        author: msg.key.participant || msg.key.remoteJid,
        authorPhone: resolvedPhone || authorNumber,
        pushName: msg.pushName || null,
        body: text,
        quotedText: quotedText,
        quotedMessageId: quotedMessageId,
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

          const mimetype =
            imageMessage?.mimetype ||
            videoMessage?.mimetype ||
            documentMessage?.mimetype ||
            audioMessage?.mimetype ||
            stickerMessage?.mimetype;

          const filename = documentMessage?.fileName || null;

          let mediaType = "document";
          if (imageMessage) mediaType = "image";
          else if (videoMessage) mediaType = "video";
          else if (audioMessage) mediaType = "audio";
          else if (stickerMessage) mediaType = "sticker";

          payload.media = {
            type: mediaType,
            mimetype: mimetype,
            filename: filename,
            data: buffer.toString("base64"),
            size: buffer.length,
          };

          logger.info(
            { from: payload.from, mediaType: payload.media.type, size: payload.media.size, mimetype },
            "Media message received"
          );
        } catch (err) {
          logger.error({ err: err.message, stack: err.stack }, "Failed to download media");
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
    allowedGroups: ALLOWED_GROUPS.length > 0 ? ALLOWED_GROUPS : "all",
    allowedPhoneNumbers: ALLOWED_PHONE_NUMBERS.length > 0 ? ALLOWED_PHONE_NUMBERS : "all",
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
    const sentMessage = await sock.sendMessage(chatId, { text });
    res.json({ success: true, messageId: sentMessage?.key?.id || null });
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
  // Auth state now lives in SQLite. Starting the socket is the only reliable
  // way to discover whether the stored session can resume or needs a QR scan.
  logger.info("Starting WhatsApp bridge session...");
  connectionStatus = "STARTING";
  connectWhatsApp();
}

app.listen(PORT, () => {
  logger.info({ port: PORT }, "WhatsApp bridge started");
  checkExistingSession();
});
