import type { Model } from "@mariozechner/pi-ai";

import type { AppConfig } from "../config.js";

export function buildModel(config: AppConfig): Model<"openai-completions"> {
  return {
    id: config.modelId,
    name: config.modelName,
    api: "openai-completions",
    provider: "gullak-pi",
    baseUrl: config.modelBaseUrl,
    reasoning: config.modelReasoning,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 131072,
    maxTokens: 8192,
    compat: {
      supportsDeveloperRole: false,
      supportsReasoningEffort: false,
      supportsStrictMode: false,
      supportsUsageInStreaming: false,
    },
  };
}
