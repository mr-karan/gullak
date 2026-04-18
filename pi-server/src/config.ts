import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

import type { ThinkingLevel } from "@mariozechner/pi-agent-core";

function getEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function getBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function getListEnv(name: string): string[] {
  const raw = getOptionalEnv(name);
  if (!raw) {
    return [];
  }

  if (raw.startsWith("[")) {
    const parsed = JSON.parse(raw) as string[];
    return parsed.map((item) => item.trim()).filter(Boolean);
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getThinkingLevel(): ThinkingLevel {
  const raw = getEnv("GULLAK_MODEL_THINKING_LEVEL", "minimal");
  const allowed: ThinkingLevel[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
  return allowed.includes(raw as ThinkingLevel) ? (raw as ThinkingLevel) : "minimal";
}

export interface AppConfig {
  version: string;
  dataDir: string;
  ledgerPath: string;
  statePath: string;
  recapDir: string;
  timezone: string;
  defaultCurrency: string;
  ledgerCli: string;
  validateWrites: boolean;
  host: string;
  port: number;
  httpApiKey?: string;
  modelBaseUrl: string;
  modelId: string;
  modelName: string;
  modelApiKey: string;
  modelReasoning: boolean;
  modelThinkingLevel: ThinkingLevel;
  whatsappBridgeUrl: string;
  whatsappApiKey?: string;
  whatsappAllowedNumbers: string[];
  whatsappGroupRequireMention: boolean;
  recapWhatsappChatId?: string;
}

export function loadConfig(): AppConfig {
  const dataDir = resolve(getEnv("GULLAK_DATA_DIR", "../data"));
  const ledgerPath = resolve(getEnv("GULLAK_LEDGER_PATH", `${dataDir}/main.ledger`));
  const statePath = resolve(getEnv("GULLAK_STATE_PATH", `${dataDir}/pi-state.json`));
  const recapDir = resolve(`${dataDir}/recaps`);

  mkdirSync(dataDir, { recursive: true });
  mkdirSync(recapDir, { recursive: true });

  return {
    version: "3.0.0-pi",
    dataDir,
    ledgerPath,
    statePath,
    recapDir,
    timezone: getEnv("GULLAK_TIMEZONE", "Asia/Kolkata"),
    defaultCurrency: getEnv("GULLAK_DEFAULT_CURRENCY", "INR"),
    ledgerCli: getEnv("GULLAK_LEDGER_CLI", "ledger"),
    validateWrites: getBooleanEnv("GULLAK_VALIDATE_WRITES", true),
    host: getEnv("GULLAK_HOST", "127.0.0.1"),
    port: Number.parseInt(getEnv("GULLAK_PORT", "8787"), 10),
    httpApiKey: getOptionalEnv("GULLAK_HTTP_API_KEY"),
    modelBaseUrl: getEnv("GULLAK_MODEL_BASE_URL", "http://localhost:11434/v1"),
    modelId: getEnv("GULLAK_MODEL_ID", "gpt-oss:20b"),
    modelName: getEnv("GULLAK_MODEL_NAME", "GPT-OSS 20B"),
    modelApiKey: getEnv("GULLAK_MODEL_API_KEY", "dummy"),
    modelReasoning: getBooleanEnv("GULLAK_MODEL_REASONING", true),
    modelThinkingLevel: getThinkingLevel(),
    whatsappBridgeUrl: getEnv("GULLAK_WHATSAPP_BRIDGE_URL", "http://localhost:3000"),
    whatsappApiKey: getOptionalEnv("GULLAK_WHATSAPP_API_KEY"),
    whatsappAllowedNumbers: getListEnv("GULLAK_WHATSAPP_ALLOWED_NUMBERS"),
    whatsappGroupRequireMention: getBooleanEnv(
      "GULLAK_WHATSAPP_GROUP_REQUIRE_MENTION",
      false,
    ),
    recapWhatsappChatId: getOptionalEnv("GULLAK_RECAP_WHATSAPP_CHAT_ID"),
  };
}
