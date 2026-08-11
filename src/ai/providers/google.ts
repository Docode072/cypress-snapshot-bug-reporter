/**
 * Google Gemini provider payload builder
 */

import type { AIProviderPayload } from "./types";

/**
 * Build Google Gemini API payload
 *
 * @param model - Model name
 * @param systemPrompt - System prompt text
 * @param baselineB64 - Baseline image buffer
 * @param actualB64 - Actual image buffer
 * @param diffB64 - Diff image buffer
 * @returns Google Gemini API payload
 */
export function buildGooglePayload(
  _model: string,
  systemPrompt: string,
  baselineB64: Buffer,
  actualB64: Buffer,
  diffB64: Buffer,
): AIProviderPayload {
  const imgPart = (data: Buffer) => ({
    inline_data: {
      mime_type: "image/png",
      data: data.toString("base64"),
    },
  });

  return {
    contents: [
      {
        parts: [
          { text: systemPrompt },
          imgPart(baselineB64),
          imgPart(actualB64),
          imgPart(diffB64),
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
    },
  };
}

/**
 * Build request headers for Google Gemini
 * Note: API key is passed as query parameter, not header
 *
 * @returns Request headers
 */
export function buildGoogleHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
  };
}

/**
 * Build endpoint URL for Google Gemini
 * Appends API key as query parameter
 *
 * @param endpoint - Base endpoint URL
 * @param apiKey - Google API key
 * @returns Full endpoint URL with API key
 */
export function buildGoogleEndpoint(endpoint: string, apiKey: string): string {
  const sep = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${sep}key=${encodeURIComponent(apiKey)}`;
}
