import { createModels, createProvider } from "@earendil-works/pi-ai";
import type { Api, Model, Models } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

import type { AppConfig } from "../../config.ts";

/// Bridges Gullak's single OpenAI-compatible model config (base URL + model id +
/// one API key, pointing at OpenRouter / OpenAI / a local Ollama) into a pi-ai
/// `Models` collection. The pi engine streams through this. Kept maximally
/// compatible: no reasoning, no developer role, no reasoning_effort — so the same
/// build works across OpenAI, OpenRouter, and keyless local servers.

export interface PiModelDeps {
  models: Models;
  model: Model<Api>;
}

/// Build the `{ models, model }` deps the pi engine runs against. The provider's
/// api-key auth simply returns the configured key; an empty key (Ollama) still
/// resolves as "configured" so keyless local servers work.
export function buildPiModel(config: AppConfig): PiModelDeps {
  const model: Model<"openai-completions"> = {
    id: config.modelId,
    name: config.modelName || config.modelId,
    api: "openai-completions",
    provider: "gullak",
    baseUrl: config.modelBaseUrl,
    reasoning: false,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
    compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
  };

  const provider = createProvider<"openai-completions">({
    id: "gullak",
    name: "Gullak",
    baseUrl: config.modelBaseUrl,
    auth: {
      apiKey: {
        name: "Gullak model key",
        // Ignore any stored credential and ambient env; the server holds the one
        // key in config. Always returns a result (never undefined) so a keyless
        // Ollama setup still counts as configured.
        resolve: async () => ({
          auth: { apiKey: config.modelApiKey },
          source: "GULLAK_MODEL_API_KEY",
        }),
      },
    },
    models: [model],
    api: openAICompletionsApi(),
  });

  const models = createModels();
  models.setProvider(provider);
  return { models, model };
}
