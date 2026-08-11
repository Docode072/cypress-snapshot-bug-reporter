/**
 * AI provider configuration resolution from environment variables
 */

import type { AIConfig, AIProvider } from "../types/ai";
import { DEFAULT_AI_TIMEOUT_MS } from "../utils/constants";

/**
 * Resolve AI configuration from environment variables
 *
 * Required environment variables:
 * - AI_PROVIDER: Provider name (openai, anthropic, google, custom)
 * - AI_ENDPOINT: Full API endpoint URL
 * - AI_MODEL: Model name/identifier
 * - AI_API_KEY: API key for authentication
 *
 * Optional environment variables:
 * - AI_TIMEOUT_MS: Request timeout in milliseconds (default: 60000)
 * - AI_REGION_DELAY_MS: Delay between region analysis calls (default: 2000 for Google, 0 for others)
 *
 * @returns Resolved AI configuration
 * @throws Error if required environment variables are missing
 */
export function resolveAIConfig(): AIConfig {
  const provider = (process.env.AI_PROVIDER || "")
    .toLowerCase()
    .trim() as AIProvider;
  const endpoint = (process.env.AI_ENDPOINT || "").trim();
  const model = (process.env.AI_MODEL || "").trim();
  const apiKeyStr = (process.env.AI_API_KEY || "").trim();
  const apiKeys = apiKeyStr
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  if (!provider) {
    throw new Error("AI_PROVIDER environment variable is not set.");
  }
  if (!endpoint) {
    throw new Error("AI_ENDPOINT environment variable is not set.");
  }
  if (!model) {
    throw new Error("AI_MODEL environment variable is not set.");
  }
  if (apiKeys.length === 0) {
    throw new Error("AI_API_KEY environment variable is not set.");
  }

  // Default region delay: 2s for Google (free tier rate limits), 0 for others
  const defaultRegionDelay = provider === "google" ? 2000 : 0;
  const regionDelay = parseInt(
    process.env.AI_REGION_DELAY_MS || String(defaultRegionDelay),
    10,
  );

  const timeout = parseInt(
    process.env.AI_TIMEOUT_MS || String(DEFAULT_AI_TIMEOUT_MS),
    10,
  );

  return {
    provider,
    endpoint,
    model,
    apiKey: apiKeys[0]!,
    apiKeys,
    activeKeyIndex: 0,
    timeout,
    regionDelay,
  };
}

/**
 * Rotates the API key to the next available one in the pool.
 * @param config AI configuration
 * @returns true if rotated, false if no more keys available
 */
export function rotateApiKey(config: AIConfig): boolean {
  if (config.activeKeyIndex < config.apiKeys.length - 1) {
    config.activeKeyIndex++;
    config.apiKey = config.apiKeys[config.activeKeyIndex]!;
    console.log(
      `[aiAnalysis] 🔄 Rotating API key to backup key (${config.activeKeyIndex + 1}/${config.apiKeys.length})`,
    );
    return true;
  }
  return false;
}

/**
 * Validate that AI configuration is complete
 *
 * @param config - Configuration to validate
 * @returns True if configuration is valid
 */
export function isValidAIConfig(config: Partial<AIConfig>): config is AIConfig {
  return !!(
    config.provider &&
    config.endpoint &&
    config.model &&
    config.apiKey &&
    typeof config.timeout === "number"
  );
}
