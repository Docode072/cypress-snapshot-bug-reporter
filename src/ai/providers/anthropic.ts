/**
 * Anthropic Claude provider payload builder
 */

import type { AIProviderPayload } from "./types";

/**
 * Build Anthropic API payload
 *
 * @param model - Model name
 * @param systemPrompt - System prompt text
 * @param baselineB64 - Baseline image buffer
 * @param actualB64 - Actual image buffer
 * @param diffB64 - Diff image buffer
 * @returns Anthropic API payload
 */
export function buildAnthropicPayload(
  model: string,
  systemPrompt: string,
  baselineB64: Buffer,
  actualB64: Buffer,
  diffB64: Buffer,
): AIProviderPayload {
  const imgPart = (data: Buffer) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: data.toString("base64"),
    },
  });

  return {
    model,
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: [
          imgPart(baselineB64),
          imgPart(actualB64),
          imgPart(diffB64),
          { type: "text", text: systemPrompt },
        ],
      },
    ],
  };
}

/**
 * Build request headers for Anthropic
 *
 * @param apiKey - Anthropic API key
 * @returns Request headers
 */
export function buildAnthropicHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
  };
}

/**
 * Build endpoint URL for Anthropic (no modifications needed)
 *
 * @param endpoint - Base endpoint URL
 * @returns Full endpoint URL
 */
export function buildAnthropicEndpoint(endpoint: string): string {
  return endpoint;
}
