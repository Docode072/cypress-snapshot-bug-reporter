/**
 * Main type definitions for cypress-snapshot-bug-reporter
 */

import type { PluginConfig } from "./plugin";
import type { SnapshotOptions, ComparisonResult } from "./snapshot";
import type { AIConfig, AIProvider, AIAnalysisResult } from "./ai";

export * from "./plugin";
export * from "./snapshot";
export * from "./ai";
export * from "./cypress";

/**
 * Configuration options for the snapshot plugin
 */
export interface SnapshotPluginConfig {
  /**
   * Analysis mode:
   * - "after": Run AI analysis after all tests complete
   * - "deferred": User runs analysis manually via CLI
   */
  snapshotOcrMode?: "after" | "deferred";

  /**
   * Directory for baseline (reference) images
   * @default "cypress/snapshots/baseline"
   */
  baselineDir?: string;

  /**
   * Directory for actual (current test run) images
   * @default "cypress/snapshots/actual"
   */
  actualDir?: string;

  /**
   * Directory for diff images
   * @default "cypress/snapshots/diff"
   */
  diffDir?: string;

  /**
   * Path for Excel report output
   * @default "cypress/snapshots/reports/diff-report.xlsx"
   */
  excelFile?: string;

  /**
   * Mismatch threshold (0-1) above which diffs are considered significant
   * @default 0.0
   */
  threshold?: number;

  /**
   * AI provider configuration (optional, can also be set via environment variables)
   */
  aiConfig?: Partial<AIConfig>;
}

/**
 * Version information
 */
export const VERSION = "2.0.0-beta.1";
