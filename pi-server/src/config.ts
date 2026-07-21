import { z } from "zod";

// Inlined from the (now-abandoned) @mariozechner/pi-agent-core: it's a trivial
// string union and was the ONLY thing we imported from that package — pi-ai was
// never used at all. Dropping both deps removes an unmaintained agent framework
// from the supply chain for one type. Keep in sync if a consumer ever needs it.
type ThinkingLevel = "off" | "minimal" | "low" | "medium" | "high" | "xhigh";

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

/**
 * Strict integer env: fail fast on a malformed value instead of silently
 * yielding NaN (which used to slip through `Number.parseInt` into the port and
 * sync interval). A misconfigured number should crash on boot with a clear
 * message, not surface as a mysterious runtime bug.
 */
function getIntEnv(name: string, fallback: number): number {
  const raw = getOptionalEnv(name);
  if (raw === undefined) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n)) {
    throw new Error(`config: ${name} must be an integer, got "${raw}"`);
  }
  return n;
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

/**
 * The two household profiles. Ids are the hard enum ('karan' | 'wife');
 * only name/emoji are configurable. GULLAK_PROFILES is an optional JSON array
 * of {id, name, emoji}. A malformed value is ignored (falls back to defaults)
 * rather than crashing the server — profiles are cosmetic, not critical.
 */
function getProfiles(): Profile[] {
  const defaults: Profile[] = [
    { id: "karan", name: "Karan", emoji: null },
    { id: "wife", name: "Partner", emoji: null },
  ];
  const raw = getOptionalEnv("GULLAK_PROFILES");
  if (!raw) return defaults;
  try {
    const parsed = JSON.parse(raw) as Array<{
      id?: string;
      name?: string;
      emoji?: string | null;
    }>;
    if (!Array.isArray(parsed)) return defaults;
    return defaults.map((d) => {
      const override = parsed.find((p) => p.id === d.id);
      if (!override) return d;
      return {
        id: d.id,
        name:
          typeof override.name === "string" && override.name.trim()
            ? override.name.trim()
            : d.name,
        emoji:
          typeof override.emoji === "string" && override.emoji.trim()
            ? override.emoji.trim()
            : d.emoji,
      };
    });
  } catch {
    return defaults;
  }
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

/** The two household people. Ids are a hard enum; names/emoji are display
 *  sugar overridable via GULLAK_PROFILES. */
export interface Profile {
  id: "karan" | "wife";
  name: string;
  emoji: string | null;
}

export const PROFILE_IDS = ["karan", "wife"] as const;
export type PersonId = (typeof PROFILE_IDS)[number];

export interface AppConfig {
  version: string;
  dataDir: string;
  /** Display config for the two people; ids are fixed ('karan' | 'wife'). */
  profiles: Profile[];
  dbPath: string;
  timezone: string;
  defaultCurrency: string;
  host: string;
  port: number;
  httpApiKey?: string;
  /** When true, refuse to boot without an API key (production hardening). */
  requireAuth: boolean;
  modelBaseUrl: string;
  modelId: string;
  modelName: string;
  modelApiKey: string;
  modelReasoning: boolean;
  modelThinkingLevel: ThinkingLevel;
  /** Which conversational engine /v1/messages uses. "pi" = the single
   *  tool-calling pi-agent; "legacy" = the classifier + ask/write split.
   *  WhatsApp always stays legacy regardless of this. */
  agentEngine: "pi" | "legacy";
  /** Per-call LLM request timeout in ms. Generous — vision calls are slow. */
  modelTimeoutMs: number;
  /** Fixed-window rate caps (requests/min/IP). 0 disables a limiter. */
  rateLimit: { aiPerMinute: number; webhookPerMinute: number };
  /** Trust X-Forwarded-For for rate-limit keying (set only behind a proxy). */
  trustProxy: boolean;
  /** True when a real model key is configured; /v1/ai/* 503s otherwise. */
  ai: { enabled: boolean };
  whatsappBridgeUrl: string;
  whatsappApiKey?: string;
  whatsappAllowedNumbers: string[];
  whatsappGroupRequireMention: boolean;
  sheets: {
    /** Apps Script web-app /exec URL bound to the sheet; unset = no-op. */
    webAppUrl?: string;
    /** Shared secret matching GULLAK_SECRET in the Apps Script. */
    secret?: string;
    /** Optional periodic push cadence in minutes; 0 disables the interval
     *  (the push also fires after each /v1/sync/push). */
    syncIntervalMinutes: number;
  };
  /** Actual Budget export destination (opt-in). Enabled when serverUrl +
   *  password + syncId are all set. */
  actual: {
    serverUrl?: string;
    password?: string;
    /** The budget file's Sync ID (Actual → Settings → Advanced). */
    syncId?: string;
    /** Actual account id to import into; defaults to the first account. */
    accountId?: string;
    /** Local cache dir @actual-app/api downloads the budget into. */
    dataDir: string;
  };
}

// Operationally-critical scalars get a real schema so a bad value fails loudly
// at boot rather than corrupting runtime behavior.
const criticalSchema = z.object({
  port: z.number().int().min(1).max(65535),
  syncIntervalMinutes: z.number().int().min(0),
  host: z.string().min(1),
  dbPath: z.string().min(1),
});

export function loadConfig(): AppConfig {
  const dataDir = getEnv("GULLAK_DATA_DIR", "../data");
  const dbPath = getEnv("GULLAK_DB_PATH", `${dataDir}/gullak.db`);

  const allowAmbientModelKeys = getBooleanEnv(
    "GULLAK_ALLOW_AMBIENT_MODEL_KEYS",
    false,
  );
  // Honor the ambient flag CONSISTENTLY: OPENROUTER_API_KEY / OPENAI_API_KEY
  // are only consulted when explicitly allowed. An explicit GULLAK_MODEL_API_KEY
  // always wins.
  const ambientApiKey = allowAmbientModelKeys
    ? getFirstOptionalEnv("OPENROUTER_API_KEY", "OPENAI_API_KEY")
    : undefined;
  const realModelApiKey =
    getOptionalEnv("GULLAK_MODEL_API_KEY") ?? ambientApiKey;
  const openRouterApiKey = allowAmbientModelKeys
    ? getOptionalEnv("OPENROUTER_API_KEY")
    : undefined;
  const openAiApiKey = allowAmbientModelKeys
    ? getOptionalEnv("OPENAI_API_KEY")
    : undefined;

  const modelBaseUrl =
    getFirstOptionalEnv(
      "GULLAK_MODEL_BASE_URL",
      ...(allowAmbientModelKeys ? ["OPENROUTER_BASE_URL", "OPENAI_BASE_URL"] : []),
    ) ??
    (openRouterApiKey
      ? "https://openrouter.ai/api/v1"
      : openAiApiKey
        ? "https://api.openai.com/v1"
        : "http://localhost:11434/v1");
  const modelId =
    getFirstOptionalEnv("GULLAK_MODEL_ID") ??
    (openRouterApiKey
      ? "google/gemini-3.5-flash"
      : openAiApiKey
        ? "gpt-4.1-mini"
        : "gpt-oss:20b");
  const modelName =
    getFirstOptionalEnv("GULLAK_MODEL_NAME") ??
    (openRouterApiKey
      ? "Gemini 3.5 Flash"
      : openAiApiKey
        ? "GPT-4.1 Mini"
        : "GPT-OSS 20B");

  // Conversational engine selection. Defaults to the new single tool-calling pi
  // agent; any value other than "legacy" is treated as "pi".
  const agentEngine: "pi" | "legacy" =
    getEnv("GULLAK_AGENT_ENGINE", "pi") === "legacy" ? "legacy" : "pi";

  const port = getIntEnv("GULLAK_PORT", 8787);
  const syncIntervalMinutes = getIntEnv("GULLAK_SHEETS_SYNC_INTERVAL_MIN", 0);
  const host = getEnv("GULLAK_HOST", "127.0.0.1");
  const httpApiKey = getOptionalEnv("GULLAK_HTTP_API_KEY");
  const requireAuth = getBooleanEnv("GULLAK_REQUIRE_AUTH", false);

  // Fail fast on malformed critical values.
  const parsed = criticalSchema.safeParse({
    port,
    syncIntervalMinutes,
    host,
    dbPath,
  });
  if (!parsed.success) {
    throw new Error(`config: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join("; ")}`);
  }
  if (requireAuth && !httpApiKey) {
    throw new Error(
      "config: GULLAK_REQUIRE_AUTH is on but GULLAK_HTTP_API_KEY is unset — refusing to start an unauthenticated server",
    );
  }

  return {
    version: "4.1.0-node",
    dataDir,
    profiles: getProfiles(),
    dbPath,
    timezone: getEnv("GULLAK_TIMEZONE", "Asia/Kolkata"),
    defaultCurrency: getEnv("GULLAK_DEFAULT_CURRENCY", "INR"),
    host,
    port,
    httpApiKey,
    requireAuth,
    modelBaseUrl,
    modelId,
    modelName,
    // Keep a non-empty string so the type stays simple; ai.enabled gates use.
    modelApiKey: realModelApiKey ?? "dummy",
    modelReasoning: getBooleanEnv("GULLAK_MODEL_REASONING", true),
    modelThinkingLevel: getThinkingLevel(),
    agentEngine,
    modelTimeoutMs: getIntEnv("GULLAK_MODEL_TIMEOUT_MS", 60_000),
    rateLimit: {
      aiPerMinute: getIntEnv("GULLAK_AI_RATE_PER_MIN", 30),
      webhookPerMinute: getIntEnv("GULLAK_WHATSAPP_RATE_PER_MIN", 60),
    },
    trustProxy: getBooleanEnv("GULLAK_TRUST_PROXY", false),
    ai: { enabled: Boolean(realModelApiKey) },
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
    sheets: {
      webAppUrl: getOptionalEnv("GULLAK_SHEETS_WEBAPP_URL"),
      secret: getOptionalEnv("GULLAK_SHEETS_SECRET"),
      syncIntervalMinutes,
    },
    actual: {
      serverUrl: getOptionalEnv("GULLAK_ACTUAL_SERVER_URL"),
      password: getOptionalEnv("GULLAK_ACTUAL_PASSWORD"),
      syncId: getOptionalEnv("GULLAK_ACTUAL_SYNC_ID"),
      accountId: getOptionalEnv("GULLAK_ACTUAL_ACCOUNT_ID"),
      dataDir: getEnv("GULLAK_ACTUAL_DATA_DIR", `${dataDir}/.actual-cache`),
    },
  };
}

/** Redacted, log-safe view of the config — never prints secrets. */
export function summarizeConfig(config: AppConfig): Record<string, unknown> {
  const has = (v: unknown) => (v ? "set" : "unset");
  return {
    version: config.version,
    host: config.host,
    port: config.port,
    dbPath: config.dbPath.replace(/^.*\//, ".../"),
    timezone: config.timezone,
    auth: config.httpApiKey ? "required" : "OPEN (no key)",
    ai: config.ai.enabled
      ? { enabled: true, provider: config.modelBaseUrl, model: config.modelId }
      : { enabled: false },
    sheets:
      config.sheets.webAppUrl && config.sheets.secret
        ? { enabled: true, intervalMin: config.sheets.syncIntervalMinutes }
        : { enabled: false },
    whatsapp: {
      bridge: config.whatsappBridgeUrl,
      apiKey: has(config.whatsappApiKey),
      allowedNumbers: config.whatsappAllowedNumbers.length,
    },
  };
}
