/**
 * AI response parsing and validation
 */

import type { AIProvider } from "../types/ai";
import type { AIAnalysisResult } from "../types/ai";
import type { ImageRegion } from "../types/snapshot";

interface RawAIResponse {
  contentType?: string;
  locationHierarchy?: unknown;
  baselineValue?: string;
  actualValue?: string;
  changeType?: string;
  changeSummary?: string;
  confidence?: number;
  allChanges?: unknown[];
}

/**
 * Extract the JSON content string from a provider response body
 * Each provider wraps the model output differently
 *
 * @param provider - AI provider name
 * @param rawBody - Raw response body from API
 * @returns Extracted JSON string
 * @throws Error if response cannot be parsed
 */
export function extractJSONString(
  provider: AIProvider,
  rawBody: string,
): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBody);
  } catch (e) {
    throw new Error(
      `Provider response is not valid JSON: ${rawBody.substring(0, 200)}`,
    );
  }

  if (provider === "anthropic") {
    const response = parsed as {
      content?: Array<{ type: string; text?: string }>;
    };
    const block = response.content?.[0];
    if (!block || block.type !== "text" || !block.text) {
      throw new Error("Unexpected Anthropic response shape");
    }
    return block.text;
  }

  if (provider === "google") {
    const response = parsed as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };
    const part = response.candidates?.[0]?.content?.parts?.[0];
    if (!part?.text) {
      throw new Error("Unexpected Google response shape");
    }
    return part.text;
  }

  // OpenAI / custom
  const response = parsed as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };
  const choice = response.choices?.[0];
  if (!choice) {
    throw new Error("Unexpected OpenAI response shape — no choices");
  }
  return choice.message?.content || JSON.stringify(parsed);
}

/**
 * Parse and validate the structured JSON from the AI model
 * Returns a normalized result object, filling defaults for missing fields
 *
 * @param provider - AI provider name
 * @param rawBody - Raw response body from API
 * @param region - Original image region
 * @returns Parsed and validated AI analysis result
 * @throws Error if JSON cannot be parsed
 */
export function parseAIResponse(
  provider: AIProvider,
  rawBody: string,
  _region: ImageRegion,
): Omit<AIAnalysisResult, "region"> {
  const jsonStr = extractJSONString(provider, rawBody);

  let result: RawAIResponse;
  try {
    result = JSON.parse(jsonStr) as RawAIResponse;
  } catch (e) {
    // Attempt to extract the first {...} block if the model leaked surrounding text
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (!match) {
      throw new Error(
        `Model did not return valid JSON: ${jsonStr.substring(0, 200)}`,
      );
    }
    result = JSON.parse(match[0]) as RawAIResponse;
  }

  // Normalize required top-level fields
  return {
    contentType: (result.contentType ||
      "Unknown") as AIAnalysisResult["contentType"],
    locationHierarchy: (result.locationHierarchy ||
      {}) as AIAnalysisResult["locationHierarchy"],
    baselineValue: result.baselineValue || "",
    actualValue: result.actualValue || "",
    changeType: (result.changeType ||
      "value_changed") as AIAnalysisResult["changeType"],
    changeSummary: result.changeSummary || "",
    confidence: typeof result.confidence === "number" ? result.confidence : 0.5,
    allChanges: Array.isArray(result.allChanges)
      ? (result.allChanges as AIAnalysisResult["allChanges"])
      : [],
  };
}
