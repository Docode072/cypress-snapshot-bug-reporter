/**
 * Type definitions for plugin configuration
 */

import type Cypress from "cypress";

/**
 * Configuration options for the snapshot plugin
 */
export interface PluginConfig {
  /**
   * Analysis mode:
   * - "after": Run AI analysis after all tests complete
   * - "deferred": User runs analysis manually via CLI
   * @default "after"
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
}

/**
 * Resolved plugin configuration with all defaults applied
 */
export interface ResolvedPluginConfig extends Required<PluginConfig> {
  manifestPath: string;
}

/**
 * Task names exposed by the plugin
 */
export type SnapshotTaskName =
  | "snapshotCompare"
  | "snapshotSetBaseline"
  | "snapshotGetConfig"
  | "snapshotRecordDiff"
  | "analyzeDiffRegions";

/**
 * Task arguments map
 */
export interface SnapshotTaskArgs {
  snapshotCompare: {
    name: string;
    baselinePath: string;
    actualPath: string;
    diffPath: string;
    threshold: number;
  };
  snapshotSetBaseline: {
    actualPath: string;
    baselinePath: string;
  };
  snapshotGetConfig: Record<string, never>;
  snapshotRecordDiff: {
    name: string;
    mismatch: number;
    totalPixels: number;
    severity: string;
  };
  analyzeDiffRegions: {
    name: string;
    mismatch?: number;
    totalPixels?: number;
    severity?: string;
  };
}

/**
 * Main plugin function type
 */
export type ConfigSnapshotFn = (
  on: Cypress.PluginEvents,
  config: Cypress.PluginConfigOptions,
  userOptions?: Partial<PluginConfig>,
) => Cypress.PluginConfigOptions;
