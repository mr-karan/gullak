import type { ThinkingLevel } from "@mariozechner/pi-agent-core";

function getEnv(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function getOptionalEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function getFirstOptionalEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const value = getOptionalEnv(name);
    if (value) return value;
  }
  return undefined;
}

function getBooleanEnv(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (!value) return fallback;
  return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
}

function getListEnv(name: string): string[] {
  const raw = getOptionalEnv(name);
  if (!raw) return [];
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
  const allowed: ThinkingLevel[] = [
    "off",
    "minimal",
    "low",
    "medium",
    "high",
    "xhigh",
  ];
  return allowed.includes(raw as ThinkingLevel)
    ? (raw as ThinkingLevel)
    : "minimal";
}

export interface AppConfig {
  version: string;
  dataDir: string;
  dbPath: string;
  timezone: string;
  defaultCurrency: string;
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
}

export function loadConfig(): AppConfig {
  const dataDir = getEnv("GULLAK_DATA_DIR", "../data");
  const dbPath = getEnv("GULLAK_DB_PATH", `${dataDir}/gullak.db`);

  const allowAmbientModelKeys = getBooleanEnv(
    "GULLAK_ALLOW_AMBIENT_MODEL_KEYS",
    false,
  );
  const openRouterApiKey = allowAmbientModelKeys
    ? getOptionalEnv("OPENROUTER_API_KEY")
    : undefined;
  const openAiApiKey = allowAmbientModelKeys
    ? getOptionalEnv("OPENAI_API_KEY")
    : undefined;
  const modelApiKey =
    getFirstOptionalEnv(
      "GULLAK_MODEL_API_KEY",
      "OPENROUTER_API_KEY",
      "OPENAI_API_KEY",
    ) ?? "dummy";
  const modelBaseUrl =
    getFirstOptionalEnv(
      "GULLAK_MODEL_BASE_URL",
      "OPENROUTER_BASE_URL",
      "OPENAI_BASE_URL",
    ) ??
    (openRouterApiKey
      ? "https://openrouter.ai/api/v1"
      : openAiApiKey
        ? "https://api.openai.com/v1"
        : "http://localhost:11434/v1");
  const modelId =
    getFirstOptionalEnv("GULLAK_MODEL_ID") ??
    (openRouterApiKey
      ? "google/gemini-3-flash-preview"
      : openAiApiKey
        ? "gpt-4.1-mini"
        : "gpt-oss:20b");
  const modelName =
    getFirstOptionalEnv("GULLAK_MODEL_NAME") ??
    (openRouterApiKey
      ? "Gemini 3 Flash"
      : openAiApiKey
        ? "GPT-4.1 Mini"
        : "GPT-OSS 20B");

  return {
    version: "4.0.0-bun",
    dataDir,
    dbPath,
    timezone: getEnv("GULLAK_TIMEZONE", "Asia/Kolkata"),
    defaultCurrency: getEnv("GULLAK_DEFAULT_CURRENCY", "INR"),
    host: getEnv("GULLAK_HOST", "127.0.0.1"),
    port: Number.parseInt(getEnv("GULLAK_PORT", "8787"), 10),
    httpApiKey: getOptionalEnv("GULLAK_HTTP_API_KEY"),
    modelBaseUrl,
    modelId,
    modelName,
    modelApiKey,
    modelReasoning: getBooleanEnv("GULLAK_MODEL_REASONING", true),
    modelThinkingLevel: getThinkingLevel(),
    whatsappBridgeUrl: getEnv(
      "GULLAK_WHATSAPP_BRIDGE_URL",
      "http://localhost:3000",
    ),
    whatsappApiKey: getOptionalEnv("GULLAK_WHATSAPP_API_KEY"),
    whatsappAllowedNumbers: getListEnv("GULLAK_WHATSAPP_ALLOWED_NUMBERS"),
    whatsappGroupRequireMention: getBooleanEnv(
      "GULLAK_WHATSAPP_GROUP_REQUIRE_MENTION",
      false,
    ),
  };
}
