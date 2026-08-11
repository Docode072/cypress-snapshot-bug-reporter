/**
 * Provider factory - routes to appropriate provider implementation
 */

import type { AIProvider } from "../../types/ai";
import type { AIProviderPayload } from "./types";
import {
  buildOpenAIPayload,
  buildOpenAIHeaders,
  buildOpenAIEndpoint,
} from "./openai";
import {
  buildAnthropicPayload,
  buildAnthropicHeaders,
  buildAnthropicEndpoint,
} from "./anthropic";
import {
  buildGooglePayload,
  buildGoogleHeaders,
  buildGoogleEndpoint,
} from "./google";

/**
 * Build provider-specific API payload
 *
 * @param provider - Provider name
 * @param model - Model name
 * @param systemPrompt - System prompt text
 * @param baselineB64 - Baseline image buffer
 * @param actualB64 - Actual image buffer
 * @param diffB64 - Diff image buffer
 * @returns Provider-specific payload
 */
export function buildPayload(
  provider: AIProvider,
  model: string,
  systemPrompt: string,
  baselineB64: Buffer,
  actualB64: Buffer,
  diffB64: Buffer,
): AIProviderPayload {
  switch (provider) {
    case "anthropic":
      return buildAnthropicPayload(
        model,
        systemPrompt,
        baselineB64,
        actualB64,
        diffB64,
      );
    case "google":
      return buildGooglePayload(
        model,
        systemPrompt,
        baselineB64,
        actualB64,
        diffB64,
      );
    case "openai":
    case "custom":
    default:
      return buildOpenAIPayload(
        model,
        systemPrompt,
        baselineB64,
        actualB64,
        diffB64,
      );
  }
}

/**
 * Build provider-specific request headers
 *
 * @param provider - Provider name
 * @param apiKey - API key
 * @returns Request headers
 */
export function buildHeaders(
  provider: AIProvider,
  apiKey: string,
): Record<string, string> {
  switch (provider) {
    case "anthropic":
      return buildAnthropicHeaders(apiKey);
    case "google":
      return buildGoogleHeaders();
    case "openai":
    case "custom":
    default:
      return buildOpenAIHeaders(apiKey);
  }
}

/**
 * Build provider-specific endpoint URL
 *
 * @param provider - Provider name
 * @param endpoint - Base endpoint URL
 * @param apiKey - API key
 * @returns Full endpoint URL
 */
export function buildEndpoint(
  provider: AIProvider,
  endpoint: string,
  apiKey: string,
): string {
  switch (provider) {
    case "google":
      return buildGoogleEndpoint(endpoint, apiKey);
    case "anthropic":
      return buildAnthropicEndpoint(endpoint);
    case "openai":
    case "custom":
    default:
      return buildOpenAIEndpoint(endpoint);
  }
}
