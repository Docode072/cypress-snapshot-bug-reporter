/**
 * Analysis orchestrator - coordinates diff region analysis workflow
 */

import * as fs from "fs";
import * as path from "path";
import { PNG } from "pngjs";
import type {
  AIAnalysisResult,
  BatchAnalysisResult,
  AnalysisParams,
} from "../types/ai";
import type { ImageRegion } from "../types/snapshot";
import {
  extractDiffRegions,
  toSingleImageCoords,
  cropRegionFromParsed,
  cropDiffPanelRegion,
  resolveScreenshotPath,
  type ParsedPNG,
} from "../utils/imageUtils";
import { MIN_REGION_AREA } from "../utils/constants";
import {
  DEFAULT_BASELINE_DIR,
  DEFAULT_ACTUAL_DIR,
  DEFAULT_DIFF_DIR,
  DEFAULT_EXCEL_FILE,
} from "../utils/constants";
import { resolveAIConfig } from "../ai/config";
import { analyzeImagesWithAI } from "../ai/retry";
import { parseAIResponse } from "../ai/parser";
import { sleep } from "../utils/filesystem";

/**
 * Analyze a single diff region using AI
 *
 * @param region - Region coordinates
 * @param baselinePng - Parsed baseline image
 * @param actualPng - Parsed actual image
 * @param diffBuffer - Composite diff image buffer
 * @param panelWidth - Width of single panel in composite
 * @returns AI analysis result for the region
 */
async function analyzeRegion(
  region: ImageRegion,
  baselinePng: ParsedPNG,
  actualPng: ParsedPNG,
  diffBuffer: Buffer,
  panelWidth: number,
): Promise<AIAnalysisResult> {
  const aiConfig = resolveAIConfig();

  const baselineCrop = cropRegionFromParsed(baselinePng, region);
  const actualCrop = cropRegionFromParsed(actualPng, region);
  const diffCrop = cropDiffPanelRegion(diffBuffer, region, panelWidth);

  const rawResponse = await analyzeImagesWithAI(
    aiConfig,
    baselineCrop,
    actualCrop,
    diffCrop,
  );

  const structured = parseAIResponse(aiConfig.provider, rawResponse, region);

  return { region, ...structured };
}

/**
 * Analyze all diff regions for a snapshot
 *
 * @param params - Analysis parameters
 * @returns Batch analysis result
 */
export async function analyzeDiffRegions(
  params: AnalysisParams,
): Promise<BatchAnalysisResult> {
  const {
    name,
    mismatch: _mismatch = 0,
    totalPixels: _totalPixels = 0,
    severity: _severity = "Low",
    BASELINE_DIR = DEFAULT_BASELINE_DIR,
    ACTUAL_DIR = DEFAULT_ACTUAL_DIR,
    DIFF_DIR = DEFAULT_DIFF_DIR,
    EXCEL_FILE = DEFAULT_EXCEL_FILE,
  } = params;

  // Resolve file paths
  const safeName = name.replace(/\//g, path.sep);
  const diffPath = path.join(DIFF_DIR, `${safeName}.png`);
  const baselinePath = path.join(BASELINE_DIR, `${safeName}.png`);
  const actualPath = resolveScreenshotPath(ACTUAL_DIR, safeName);

  if (!fs.existsSync(diffPath)) {
    return { status: "no_diff_image", name, regionsProcessed: 0 };
  }
  if (!actualPath) {
    return { status: "no_actual_image", name, regionsProcessed: 0 };
  }
  if (!fs.existsSync(baselinePath)) {
    return { status: "no_baseline_image", name, regionsProcessed: 0 };
  }

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

  if (regions.length === 0) {
    return { status: "no_red_regions", name, regionsProcessed: 0 };
  }

  // Resolve AI config
  let aiConfig;
  try {
    aiConfig = resolveAIConfig();
  } catch (configErr) {
    return {
      status: "ai_config_error",
      name,
      regionsProcessed: 0,
      error: configErr instanceof Error ? configErr.message : String(configErr),
    };
  }

  const regionDelay = aiConfig.regionDelay || 0;

  // Analyze each region sequentially to respect rate limits
  const results: AIAnalysisResult[] = [];
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    if (!region) continue; // Type guard
    if (i > 0 && regionDelay > 0) {
      await sleep(regionDelay);
    }
    try {
      const result = await analyzeRegion(
        region,
        baselinePng,
        actualPng,
        diffBuffer,
        panelWidth,
      );
      results.push(result);
    } catch (regionErr) {
      // Single failing region degrades gracefully
      results.push({
        region,
        contentType: "Unknown",
        locationHierarchy: { type: "image" },
        baselineValue: "",
        actualValue: "",
        changeType: "value_changed",
        changeSummary:
          regionErr instanceof Error
            ? `Analysis failed: ${regionErr.message}`
            : "Analysis failed",
        confidence: 0,
        allChanges: [],
        error:
          regionErr instanceof Error ? regionErr.message : String(regionErr),
      });
    }
  }

  // Filter out "no_change" regions
  const diffResults = results.filter((r) => r.changeType !== "no_change");

  if (diffResults.length === 0) {
    return {
      status: "no_changes_detected",
      name,
      regionsProcessed: results.length,
    };
  }

  // Note: Excel writing is delegated to external module for now
  // This will be implemented in the next module

  return {
    status: "success",
    name,
    regionsProcessed: diffResults.length,
    excelPath: EXCEL_FILE,
    results: diffResults,
  };
}

/**
 * Create analysis tasks factory (matches old API for plugin.js compatibility)
 *
 * @param options - Directory options
 * @returns Analysis tasks object
 */
export function makeAnalysisTasks(options: {
  baselineDir?: string;
  actualDir?: string;
  diffDir?: string;
  excelFile?: string;
}) {
  const BASELINE_DIR = options.baselineDir || DEFAULT_BASELINE_DIR;
  const ACTUAL_DIR = options.actualDir || DEFAULT_ACTUAL_DIR;
  const DIFF_DIR = options.diffDir || DEFAULT_DIFF_DIR;
  const EXCEL_FILE = options.excelFile || DEFAULT_EXCEL_FILE;

  return {
    analyzeDiffRegions: (params: AnalysisParams) =>
      analyzeDiffRegions({
        ...params,
        BASELINE_DIR,
        ACTUAL_DIR,
        DIFF_DIR,
        EXCEL_FILE,
      }),
  };
}
