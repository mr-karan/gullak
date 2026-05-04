// SQLite-backed Baileys auth state + small caches that survive restarts.
//
// Replaces useMultiFileAuthState's ./auth_state directory with a single
// WAL'd SQLite file. Same shape (state.creds + state.keys + saveCreds)
// so makeWASocket consumes it unchanged.

import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

import { BufferJSON, initAuthCreds, proto } from "@whiskeysockets/baileys";

export function openBridgeDb(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA synchronous = NORMAL;");
  db.exec(`CREATE TABLE IF NOT EXISTS creds (
    id INTEGER PRIMARY KEY CHECK (id = 0),
    value TEXT NOT NULL
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS auth_keys (
    type TEXT NOT NULL,
    id TEXT NOT NULL,
    value TEXT,
    PRIMARY KEY (type, id)
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS lid_phone_cache (
    lid_key TEXT PRIMARY KEY,
    phone TEXT NOT NULL,
    expires_at INTEGER NOT NULL
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS group_metadata_cache (
    chat_id TEXT PRIMARY KEY,
    name TEXT,
    updated_at INTEGER NOT NULL
  );`);
  return db;
}

/// Returns { state: { creds, keys }, saveCreds } in the shape Baileys
/// expects from useMultiFileAuthState.
export function useSqliteAuthState(db) {
  const getCredsStmt = db.prepare("SELECT value FROM creds WHERE id = 0");
  const setCredsStmt = db.prepare(
    "INSERT INTO creds (id, value) VALUES (0, ?) " +
      "ON CONFLICT(id) DO UPDATE SET value = excluded.value",
  );
  const getKeyStmt = db.prepare(
    "SELECT value FROM auth_keys WHERE type = ? AND id = ?",
  );
  const setKeyStmt = db.prepare(
    "INSERT INTO auth_keys (type, id, value) VALUES (?, ?, ?) " +
      "ON CONFLICT(type, id) DO UPDATE SET value = excluded.value",
  );
  const delKeyStmt = db.prepare(
    "DELETE FROM auth_keys WHERE type = ? AND id = ?",
  );
  const clearKeysStmt = db.prepare("DELETE FROM auth_keys");

  const credsRow = getCredsStmt.get();
  let creds;
  if (credsRow) {
    creds = JSON.parse(credsRow.value, BufferJSON.reviver);
  } else {
    creds = initAuthCreds();
    setCredsStmt.run(JSON.stringify(creds, BufferJSON.replacer));
  }

  const saveCreds = async () => {
    setCredsStmt.run(JSON.stringify(creds, BufferJSON.replacer));
  };

  const keys = {
    get: async (type, ids) => {
      const result = {};
      for (const id of ids) {
        const row = getKeyStmt.get(type, id);
        if (!row) continue;
        let value = JSON.parse(row.value, BufferJSON.reviver);
        if (type === "app-state-sync-key" && value) {
          value = proto.Message.AppStateSyncKeyData.fromObject(value);
        }
        result[id] = value;
      }
      return result;
    },
    set: async (data) => {
      for (const type in data) {
        for (const id in data[type]) {
          const value = data[type][id];
          if (value === null || value === undefined) {
            delKeyStmt.run(type, id);
          } else {
            setKeyStmt.run(
              type,
              id,
              JSON.stringify(value, BufferJSON.replacer),
            );
          }
        }
      }
    },
    clear: async () => {
      clearKeysStmt.run();
    },
  };

  return { state: { creds, keys }, saveCreds };
}

/// Persistent LID → phone mapping with TTL semantics. Returns the same
/// surface as the old in-memory Map-based cache.
export function createLidCache(db, ttlMs) {
  const setStmt = db.prepare(
    "INSERT INTO lid_phone_cache (lid_key, phone, expires_at) VALUES (?, ?, ?) " +
      "ON CONFLICT(lid_key) DO UPDATE SET phone = excluded.phone, expires_at = excluded.expires_at",
  );
  const getStmt = db.prepare(
    "SELECT phone, expires_at FROM lid_phone_cache WHERE lid_key = ?",
  );
  const delStmt = db.prepare("DELETE FROM lid_phone_cache WHERE lid_key = ?");
  const sizeStmt = db.prepare("SELECT COUNT(*) AS n FROM lid_phone_cache");

  return {
    set(lidKey, phone) {
      setStmt.run(lidKey, phone, Date.now() + ttlMs);
    },
    get(lidKey) {
      const row = getStmt.get(lidKey);
      if (!row) return null;
      if (row.expires_at <= Date.now()) {
        delStmt.run(lidKey);
        return null;
      }
      return row.phone;
    },
    size() {
      return sizeStmt.get().n;
    },
  };
}

/// Persistent group_id -> name cache. Plain key/value, no TTL.
export function createGroupMetadataCache(db) {
  const setStmt = db.prepare(
    "INSERT INTO group_metadata_cache (chat_id, name, updated_at) VALUES (?, ?, ?) " +
      "ON CONFLICT(chat_id) DO UPDATE SET name = excluded.name, updated_at = excluded.updated_at",
  );
  const getStmt = db.prepare(
    "SELECT name FROM group_metadata_cache WHERE chat_id = ?",
  );

  return {
    set(chatId, name) {
      setStmt.run(chatId, name, Date.now());
    },
    get(chatId) {
      const row = getStmt.get(chatId);
      return row ? row.name : null;
    },
  };
}
