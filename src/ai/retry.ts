/**
 * Retry logic with exponential backoff for AI provider rate limits
 */

import { sleep } from "../utils/filesystem";
import { MAX_AI_RETRIES } from "../utils/constants";
import type { AIConfig } from "../types/ai";
import { httpRequest, type HTTPResponse } from "./http";
import { buildHeaders, buildEndpoint, buildPayload } from "./providers";
import { getSystemPrompt } from "./prompts";
import type { AIProviderPayload } from "./providers/types";

import { rotateApiKey } from "./config";

export interface CallAIProviderOptions {
  config: AIConfig;
  payload: AIProviderPayload;
}

/**
 * Call AI provider with exponential backoff retry and API key rotation.
 * Retries up to MAX_AI_RETRIES times with delays: 5s, 10s, 20s, 40s.
 * Shifts to fallback API keys if available upon 429, 401, or 403 errors.
 *
 * @param options - Call options including config and payload
 * @returns Promise resolving to response body text
 * @throws Error if all retries fail or non-recoverable error occurs
 */
export async function callAIProvider(
  options: CallAIProviderOptions,
): Promise<string> {
  const { config, payload } = options;
  const body = JSON.stringify(payload);

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_AI_RETRIES; attempt++) {
    // Build endpoint and headers inside loop to pick up rotated API key
    const url = buildEndpoint(config.provider, config.endpoint, config.apiKey);
    const headers = buildHeaders(config.provider, config.apiKey);

    if (attempt > 0) {
      const delay = Math.min(5000 * Math.pow(2, attempt - 1), 40000); // 5s, 10s, 20s, 40s
      console.log(
        `[aiAnalysis] Waiting ${delay / 1000}s before retry... (attempt ${attempt}/${MAX_AI_RETRIES})`,
      );
      await sleep(delay);
    }

    try {
      const res: HTTPResponse = await httpRequest(
        url,
        { headers, timeout: config.timeout },
        body,
      );

      // Check for rate limit (429) or auth/quota errors (401, 403)
      if (res.status === 429 || res.status === 401 || res.status === 403) {
        lastError = new Error(
          `AI provider returned HTTP ${res.status}: ${res.body.substring(0, 200)}`,
        );

        const rotated = rotateApiKey(config);
        if (rotated) {
          // If we successfully rotated to a backup key, we can immediately retry
          // without waiting for the exponential backoff by resetting attempt counter
          attempt = -1; // Next iteration will be attempt 0 (no delay)
        } else if (res.status !== 429) {
          // If no more keys and it's a hard auth/quota error, fail immediately
          throw lastError;
        }

        continue;
      }

      if (res.status < 200 || res.status >= 300) {
        throw new Error(
          `AI provider returned HTTP ${res.status}: ${res.body.substring(0, 300)}`,
        );
      }

      return res.body;
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.includes("429") ||
          error.message.includes("401") ||
          error.message.includes("403"))
      ) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError || new Error("AI provider failed after retries");
}

/**
 * Build payload and call AI provider
 *
 * @param config - AI configuration
 * @param baselineB64 - Baseline image buffer
 * @param actualB64 - Actual image buffer
 * @param diffB64 - Diff image buffer
 * @returns Promise resolving to response body
 */
export async function analyzeImagesWithAI(
  config: AIConfig,
  baselineB64: Buffer,
  actualB64: Buffer,
  diffB64: Buffer,
): Promise<string> {
  const payload = buildPayload(
    config.provider,
    config.model,
    getSystemPrompt(),
    baselineB64,
    actualB64,
    diffB64,
  );

  return callAIProvider({ config, payload });
}
