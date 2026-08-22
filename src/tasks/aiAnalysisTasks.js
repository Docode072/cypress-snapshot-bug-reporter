"use strict";

/**
 * AI-powered diff analysis pipeline.
 *
 * For each changed region detected in a pixelmatch diff, this module:
 *   1. Crops two images from the diff area:
 *        - baseline crop  (what it should look like)
 *        - actual crop    (what it actually looks like)
 *   2. Encodes both as base64 PNG data.
 *   3. Sends them to the configured AI provider with a structured-output prompt.
 *   4. Parses and validates the JSON response.
 *   5. Returns enriched region results including location hierarchy
 *      (table → section → row → column).
 *
 * Provider is selected via environment variables — no SDK dependency:
 *   AI_PROVIDER   = openai | anthropic | google | custom
 *   AI_ENDPOINT   = full API URL
 *   AI_MODEL      = model name
 *   AI_API_KEY    = API key
 *   AI_TIMEOUT_MS = request timeout in ms (default: 60000)
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const { PNG } = require("pngjs");

const {
  MIN_REGION_AREA,
  ensureDir,
  resolveScreenshotPath,
  extractDiffRegions,
  toSingleImageCoords,
  cropRegionFromParsed,
} = require("./imageUtils");

const { writeAnalysisToExcel } = require("./diffExcelWriter");

const {
  DEFAULT_BASELINE_DIR,
  DEFAULT_ACTUAL_DIR,
  DEFAULT_DIFF_DIR,
  DEFAULT_EXCEL_FILE,
} = require("./analysisManifest");

// ---------------------------------------------------------------------------
// AI config resolution
// ---------------------------------------------------------------------------

function resolveAiConfig() {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase().trim();
  const endpoint = (process.env.AI_ENDPOINT || "").trim();
  const model = (process.env.AI_MODEL || "").trim();
  const apiKey = (process.env.AI_API_KEY || "").trim();
  const timeout = parseInt(process.env.AI_TIMEOUT_MS || "60000", 10);

  if (!provider)
    throw new Error("AI_PROVIDER environment variable is not set.");
  if (!endpoint)
    throw new Error("AI_ENDPOINT environment variable is not set.");
  if (!model) throw new Error("AI_MODEL environment variable is not set.");
  if (!apiKey) throw new Error("AI_API_KEY environment variable is not set.");

  return { provider, endpoint, model, apiKey, timeout };
}

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are an expert QA visual bug detection assistant.
You will receive two image crops from the same bounding region of a UI screenshot:
  Image 1 — BASELINE: the expected / reference state
  Image 2 — ACTUAL:   the current / tested state

Analyse the visual difference and report ONLY genuine visual bugs or functional diffs.
Do not include markdown fences, explanations, or any text outside the JSON.

The JSON must match this schema exactly:
{
  "contentType": "<one of: Table, Text, Chart, Form, Card, Image, Unknown>",
  "locationHierarchy": {
    "type": "<one of: table, text, chart, form, card, image>",
    "section": "<section or card title if visible, else omit>",
    "tableName": "<name of the table if visible, else omit>",
    "row":    { "index": <1-based integer>, "label": "<row header / row primary label if visible>" },
    "column": { "index": <1-based integer>, "header": "<column header text if visible>" },
    "element":  "<UI element description for non-table types, else omit>",
    "position": "<rough position e.g. top-left, center, bottom-right, else omit>"
  },
  "baselineValue": "<EXACT single changed value, text, number, color or header in BASELINE. Omit full row>",
  "actualValue":   "<EXACT single changed value, text, number, color or header in ACTUAL. Omit full row>",
  "changeType": "<one of: value_changed, added, removed, color_changed, header_changed, no_change>",
  "changeSummary": "<one concise human-readable sentence describing the exact bug>",
  "confidence": <float 0.0-1.0 indicating your confidence in the analysis>,
  "allChanges": [
    {
      "path":       "<full hierarchy path e.g. Section > TableName > Row N (Label) > Col N (Header)>",
      "baseline":   "<exact baseline value/text/color>",
      "actual":     "<exact actual value/text/color>",
      "changeType": "<value_changed | added | removed | color_changed | header_changed | no_change>"
    }
  ]
}

CRITICAL BUG REPORTING RULES:
- Focus on real visual bugs: value changes, text differences, missing or added components (e.g. missing graph, missing table row), table header changes, and color/theme differences.
- For baselineValue and actualValue: report ONLY the specific changed value/text/number/color (e.g. '$169.80' vs '$173.50', or 'red' vs 'green', or 'Missing Graph' vs 'Graph Visible'). NEVER dump the whole row.
- Ignore pure sub-pixel anti-aliasing text rendering noise where text content is identical. Mark those as 'no_change'.`;

// ---------------------------------------------------------------------------
// Provider payload builders
// ---------------------------------------------------------------------------

function toDataUrl(buffer) {
  return `data:image/png;base64,${buffer.toString("base64")}`;
}

function buildOpenAiPayload(model, baselineB64, actualB64) {
  return {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: SYSTEM_PROMPT },
          {
            type: "image_url",
            image_url: { url: toDataUrl(baselineB64), detail: "high" },
          },
          {
            type: "image_url",
            image_url: { url: toDataUrl(actualB64), detail: "high" },
          },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_tokens: 2048,
  };
}

function buildAnthropicPayload(model, baselineB64, actualB64) {
  const img = (data) => ({
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
          img(baselineB64),
          img(actualB64),
          { type: "text", text: SYSTEM_PROMPT },
        ],
      },
    ],
  };
}

function buildGooglePayload(model, baselineB64, actualB64) {
  const imgPart = (data) => ({
    inline_data: { mime_type: "image/png", data: data.toString("base64") },
  });
  return {
    contents: [
      {
        parts: [
          { text: SYSTEM_PROMPT },
          imgPart(baselineB64),
          imgPart(actualB64),
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json" },
  };
}

function buildPayload(provider, model, baselineB64, actualB64) {
  if (provider === "anthropic")
    return buildAnthropicPayload(model, baselineB64, actualB64);
  if (provider === "google")
    return buildGooglePayload(model, baselineB64, actualB64);
  // openai and custom use OpenAI-compatible format
  return buildOpenAiPayload(model, baselineB64, actualB64);
}

// ---------------------------------------------------------------------------
// HTTP request (Node 16+ compatible — uses built-in https/http)
// ---------------------------------------------------------------------------

function httpRequest(urlStr, options, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const isHttps = url.protocol === "https:";
    const mod = isHttps ? https : http;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method: "POST",
      headers: options.headers,
      timeout: options.timeout,
    };

    const req = mod.request(reqOptions, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode,
          body: Buffer.concat(chunks).toString("utf8"),
        }),
      );
    });

    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`AI request timed out after ${options.timeout}ms`));
    });
    req.on("error", reject);

    if (body) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Provider call
// ---------------------------------------------------------------------------

function buildHeaders(provider, apiKey) {
  const base = { "Content-Type": "application/json" };
  if (provider === "anthropic") {
    return {
      ...base,
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    };
  }
  if (provider === "google") {
    // Gemini uses ?key= query param; the caller appends it to the endpoint.
    return base;
  }
  // openai / azure / custom
  return { ...base, Authorization: `Bearer ${apiKey}` };
}

/**
 * Build the final endpoint URL.
 * Google Gemini requires the API key as a query parameter.
 */
function buildEndpointUrl(provider, endpoint, apiKey) {
  if (provider === "google") {
    const sep = endpoint.includes("?") ? "&" : "?";
    return `${endpoint}${sep}key=${encodeURIComponent(apiKey)}`;
  }
  return endpoint;
}

const MAX_RETRIES = 4;

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Call the AI provider with exponential back-off retry on 429 (rate limit).
 * Retries up to MAX_RETRIES times with delays: 5s, 10s, 20s, 40s.
 */
async function callAiProvider({
  provider,
  endpoint,
  model,
  apiKey,
  timeout,
  payload,
}) {
  const url = buildEndpointUrl(provider, endpoint, apiKey);
  const headers = buildHeaders(provider, apiKey);
  const body = JSON.stringify(payload);

  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = Math.min(5000 * Math.pow(2, attempt - 1), 40000); // 5s, 10s, 20s, 40s
      console.log(
        `[aiAnalysis] Rate limited (429). Retrying in ${delay / 1000}s... (attempt ${attempt}/${MAX_RETRIES})`,
      );
      await sleep(delay);
    }

    const res = await httpRequest(url, { headers, timeout }, body);

    if (res.status === 429) {
      lastError = new Error(
        `AI provider returned HTTP 429 (rate limit): ${res.body.substring(0, 200)}`,
      );
      continue; // retry
    }

    if (res.status < 200 || res.status >= 300) {
      throw new Error(
        `AI provider returned HTTP ${res.status}: ${res.body.substring(0, 300)}`,
      );
    }

    return res.body;
  }

  throw lastError || new Error("AI provider failed after retries");
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

/**
 * Extract the JSON content string from a provider response body.
 * Each provider wraps the model output differently.
 */
function extractJsonString(provider, rawBody) {
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch (e) {
    throw new Error(
      `Provider response is not valid JSON: ${rawBody.substring(0, 200)}`,
    );
  }

  if (provider === "anthropic") {
    const block = parsed.content && parsed.content[0];
    if (!block || block.type !== "text")
      throw new Error("Unexpected Anthropic response shape");
    return block.text;
  }

  if (provider === "google") {
    const part =
      parsed.candidates &&
      parsed.candidates[0] &&
      parsed.candidates[0].content &&
      parsed.candidates[0].content.parts &&
      parsed.candidates[0].content.parts[0];
    if (!part || !part.text)
      throw new Error("Unexpected Google response shape");
    return part.text;
  }

  // OpenAI / custom
  const choice = parsed.choices && parsed.choices[0];
  if (!choice) throw new Error("Unexpected OpenAI response shape — no choices");
  return choice.message && choice.message.content
    ? choice.message.content
    : JSON.stringify(parsed); // json_object mode returns full JSON
}

/**
 * Parse and lightly validate the structured JSON from the model.
 * Returns a normalised result object, filling defaults for missing fields.
 */
function parseAiResponse(provider, rawBody) {
  const jsonStr = extractJsonString(provider, rawBody);

  let result;
  try {
    result = JSON.parse(jsonStr);
  } catch (e) {
    // Attempt to extract the first {...} block if the model leaked surrounding text
    const match = jsonStr.match(/\{[\s\S]*\}/);
    if (!match)
      throw new Error(
        `Model did not return valid JSON: ${jsonStr.substring(0, 200)}`,
      );
    result = JSON.parse(match[0]);
  }

  // Normalise required top-level fields
  return {
    contentType: result.contentType || "Unknown",
    locationHierarchy: result.locationHierarchy || {},
    baselineValue: result.baselineValue || "",
    actualValue: result.actualValue || "",
    changeType: result.changeType || "value_changed",
    changeSummary: result.changeSummary || "",
    confidence: typeof result.confidence === "number" ? result.confidence : 0.5,
    allChanges: Array.isArray(result.allChanges) ? result.allChanges : [],
  };
}

// ---------------------------------------------------------------------------
// Region analysis
// ---------------------------------------------------------------------------

/**
 * Analyse a single diff region by calling the AI provider with two image crops.
 * Returns the structured analysis result merged with the original region bounds.
 */
async function analyzeRegion({
  region,
  baselinePng,
  actualPng,
  diffBuffer,
  panelWidth,
  aiConfig,
}) {
  const baselineCrop = cropRegionFromParsed(baselinePng, region);
  const actualCrop = cropRegionFromParsed(actualPng, region);

  const payload = buildPayload(
    aiConfig.provider,
    aiConfig.model,
    baselineCrop,
    actualCrop,
  );

  const rawResponse = await callAiProvider({ ...aiConfig, payload });

  const structured = parseAiResponse(aiConfig.provider, rawResponse);

  return { region, ...structured };
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run AI analysis for all diff regions of a single snapshot comparison.
 *
 * Mirrors the signature of the old `ocrDiffRegions` function so the calling
 * script (`snapshot-analysis-report.js`) needs minimal changes.
 */
async function analyzeDiffRegions({
  name,
  mismatch = 0,
  totalPixels = 0,
  severity = "Low",
  BASELINE_DIR = DEFAULT_BASELINE_DIR,
  ACTUAL_DIR = DEFAULT_ACTUAL_DIR,
  DIFF_DIR = DEFAULT_DIFF_DIR,
  EXCEL_FILE = DEFAULT_EXCEL_FILE,
}) {
  // Resolve file paths
  const safeName = name.replace(/\//g, path.sep);
  const diffPath = path.join(DIFF_DIR, `${safeName}.png`);
  const baselinePath = path.join(BASELINE_DIR, `${safeName}.png`);
  const actualPath = resolveScreenshotPath(ACTUAL_DIR, safeName);

  if (!fs.existsSync(diffPath))
    return { status: "no_diff_image", name, regionsProcessed: 0 };
  if (!actualPath)
    return { status: "no_actual_image", name, regionsProcessed: 0 };
  if (!fs.existsSync(baselinePath))
    return { status: "no_baseline_image", name, regionsProcessed: 0 };

  // Read images
  const diffBuffer = fs.readFileSync(diffPath);
  const actualPng = PNG.sync.read(fs.readFileSync(actualPath));
  const baselinePng = PNG.sync.read(fs.readFileSync(baselinePath));
  const panelWidth = actualPng.width;

  // Find changed regions
  const compositeRegions = extractDiffRegions(diffBuffer);
  const regions = toSingleImageCoords(compositeRegions, panelWidth).filter(
    (r) => r.width * r.height >= MIN_REGION_AREA,
  );

  if (regions.length === 0)
    return { status: "no_red_regions", name, regionsProcessed: 0 };

  // Resolve AI config (throws if env vars are missing)
  let aiConfig;
  try {
    aiConfig = resolveAiConfig();
  } catch (configErr) {
    return {
      status: "ai_config_error",
      name,
      regionsProcessed: 0,
      error: configErr.message,
    };
  }

  const source = `ai-${aiConfig.provider}`;

  // Delay between region calls to respect API rate limits.
  // Default: 2s for google free tier, 0 for paid/other providers.
  const defaultDelay = aiConfig.provider === "google" ? 2000 : 0;
  const regionDelay = parseInt(
    process.env.AI_REGION_DELAY_MS || String(defaultDelay),
    10,
  );

  // Analyse each region sequentially (not parallel) to avoid rate limits.
  const results = [];
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    if (i > 0 && regionDelay > 0) {
      await sleep(regionDelay);
    }
    try {
      const result = await analyzeRegion({
        region,
        baselinePng,
        actualPng,
        diffBuffer,
        panelWidth,
        aiConfig,
      });
      results.push(result);
    } catch (regionErr) {
      // A single failing region degrades gracefully; log and continue.
      results.push({
        region,
        contentType: "Unknown",
        locationHierarchy: {},
        baselineValue: "",
        actualValue: "",
        changeType: "value_changed",
        changeSummary: `Analysis failed: ${regionErr.message}`,
        confidence: 0,
        allChanges: [],
        error: regionErr.message,
      });
    }
  }

  // Filter out any "no_change" regions — we only report actual visual differences
  const diffResults = results.filter((r) => r.changeType !== "no_change");

  if (diffResults.length === 0) {
    return {
      status: "no_changes_detected",
      name,
      regionsProcessed: results.length,
    };
  }

  // Write filtered structured output to Excel
  await writeAnalysisToExcel(name, diffResults, severity, EXCEL_FILE, source);

  return {
    status: "success",
    name,
    regionsProcessed: diffResults.length,
    excelPath: EXCEL_FILE,
    results: diffResults,
  };
}

// ---------------------------------------------------------------------------
// Factory (mirrors makeOcrTasks pattern for plugin.js compatibility)
// ---------------------------------------------------------------------------

function makeAnalysisTasks(options = {}) {
  const BASELINE_DIR = options.baselineDir || DEFAULT_BASELINE_DIR;
  const ACTUAL_DIR = options.actualDir || DEFAULT_ACTUAL_DIR;
  const DIFF_DIR = options.diffDir || DEFAULT_DIFF_DIR;
  const EXCEL_FILE = options.excelFile || DEFAULT_EXCEL_FILE;

  return {
    analyzeDiffRegions: (params) =>
      analyzeDiffRegions({
        ...params,
        BASELINE_DIR,
        ACTUAL_DIR,
        DIFF_DIR,
        EXCEL_FILE,
      }),
  };
}

module.exports = {
  makeAnalysisTasks,
  analyzeDiffRegions,
  resolveAiConfig,
};
