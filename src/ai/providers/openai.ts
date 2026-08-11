/**
 * OpenAI provider payload builder
 */

import type { AIProviderPayload } from "./types";
import { toDataURL } from "./types";

/**
 * Build OpenAI-compatible API payload
 *
 * @param model - Model name
 * @param systemPrompt - System prompt text
 * @param baselineB64 - Baseline image buffer
 * @param actualB64 - Actual image buffer
 * @param diffB64 - Diff image buffer
 * @returns OpenAI API payload
 */
export function buildOpenAIPayload(
  model: string,
  systemPrompt: string,
  baselineB64: Buffer,
  actualB64: Buffer,
  diffB64: Buffer,
): AIProviderPayload {
  return {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: systemPrompt },
          {
            type: "image_url",
            image_url: { url: toDataURL(baselineB64), detail: "high" },
          },
          {
            type: "image_url",
            image_url: { url: toDataURL(actualB64), detail: "high" },
          },
          {
            type: "image_url",
            image_url: { url: toDataURL(diffB64), detail: "high" },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2048,
  };
}

/**
 * Build request headers for OpenAI
 *
 * @param apiKey - OpenAI API key
 * @returns Request headers
 */
export function buildOpenAIHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
}

/**
 * Build endpoint URL for OpenAI (no modifications needed)
 *
 * @param endpoint - Base endpoint URL
 * @returns Full endpoint URL
 */
export function buildOpenAIEndpoint(endpoint: string): string {
  return endpoint;
}
