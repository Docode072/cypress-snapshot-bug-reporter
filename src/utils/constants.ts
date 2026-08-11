/**
 * Constants used throughout the plugin
 */

/**
 * Separator width between panels in composite diff images
 * The composite layout is: [Baseline | sep | Diff | sep | Actual]
 */
export const COMPOSITE_SEP = 8;

/**
 * Default directory paths
 */
export const DEFAULT_BASELINE_DIR = "cypress/snapshots/baseline";
export const DEFAULT_ACTUAL_DIR = "cypress/snapshots/actual";
export const DEFAULT_DIFF_DIR = "cypress/snapshots/diff";
export const DEFAULT_SCREENSHOTS_DIR = "cypress/screenshots";
export const DEFAULT_EXCEL_FILE = "cypress/snapshots/reports/diff-report.xlsx";
export const DEFAULT_MANIFEST_FILE =
  "cypress/snapshots/.analysis-manifest.json";

/**
 * Minimum area (in pixels) for a diff region to be considered significant
 */
export const MIN_REGION_AREA = 100;

/**
 * Default timeout for file operations
 */
export const DEFAULT_FILE_WAIT_TIMEOUT_MS = 5000;

/**
 * Maximum retries for AI provider rate limit errors
 */
export const MAX_AI_RETRIES = 4;

/**
 * Default AI request timeout
 */
export const DEFAULT_AI_TIMEOUT_MS = 60000;
