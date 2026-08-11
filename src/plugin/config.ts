/**
 * Plugin configuration resolution and validation.
 *
 * Responsible for:
 * - Merging user-supplied options with sensible defaults
 * - Resolving all directory/file paths relative to the Cypress project root
 * - Validating and normalising the `snapshotOcrMode` / `analysisMode` setting
 * - Computing browser launch dimensions that prevent screenshot cropping
 */

import * as fs from "fs";
import * as path from "path";

// ─── Public types ─────────────────────────────────────────────────────────────

/**
 * User-facing options accepted by {@link configSnapshot}.
 * Every field is optional; defaults are applied during resolution.
 */
export interface SnapshotPluginOptions {
  /**
   * Analysis mode.
   * - `"after"` (default) — AI analysis report runs automatically after `cypress run`
   * - `"deferred"` — Record diffs during the run; user triggers analysis manually
   *   via `npx cypress-snapshot-bug-reporter`
   * - `"inline"` — Removed; falls back to `"after"` with a deprecation warning
   */
  snapshotOcrMode?: "after" | "deferred" | "inline" | string;

  /** Override the baseline image directory. @default "<projectRoot>/cypress/snapshots/baseline" */
  baselineDir?: string;

  /** Override the actual (current-run) image directory. @default "<projectRoot>/cypress/snapshots/actual" */
  actualDir?: string;

  /** Override the diff image directory. @default "<projectRoot>/cypress/snapshots/diff" */
  diffDir?: string;

  /** Override the Excel report output path. @default "<projectRoot>/cypress/snapshots/reports/diff-report.xlsx" */
  excelFile?: string;

  /** Override the pending-analysis manifest path. @default "<projectRoot>/cypress/snapshots/reports/pending-analysis.json" */
  pendingAnalysisFile?: string;

  /** Whether to overwrite the baseline with every new screenshot. @default false */
  updateBaseline?: boolean;

  /** Milliseconds to wait for a screenshot file to appear. @default 5000 */
  screenshotTimeout?: number;

  /**
   * Screenshot capture mode forwarded to `cy.screenshot()`.
   * @default "fullPage"
   */
  capture?: "fullPage" | "viewport" | "runner";

  // ── Viewport / browser-window sizing ───────────────────────────────────────

  /**
   * Viewport width (pixels). Alias: `browserWidth`.
   * @default 1280
   */
  viewportWidth?: number;

  /** @alias viewportWidth */
  browserWidth?: number;

  /**
   * Viewport height (pixels). Alias: `browserHeight`.
   * @default 800
   */
  viewportHeight?: number;

  /** @alias viewportHeight */
  browserHeight?: number;

  /**
   * Expand the viewport to the full page scroll-width before capture.
   * Prevents horizontal clipping on wide content.
   * @default true
   */
  fitToPage?: boolean;

  /**
   * Hard cap on the viewport width used when `fitToPage` is `true`.
   * @default 8192
   */
  maxViewportWidth?: number;

  /**
   * Hard cap on the viewport height used when `fitToPage` is `true`.
   * @default 8192
   */
  maxViewportHeight?: number;
}

/** Analysis mode after resolution/normalisation. */
export type AnalysisMode = "after" | "deferred";

/**
 * Fully-resolved plugin configuration.
 * All optional fields are replaced with their computed values.
 */
export interface ResolvedConfig {
  /** Absolute path to the baseline image directory. */
  baselineDir: string;
  /** Absolute path to the actual (current-run) image directory. */
  actualDir: string;
  /** Absolute path to the diff image directory. */
  diffDir: string;
  /** Absolute path to the reports directory. */
  reportsDir: string;
  /** Absolute path to the Excel report file. */
  excelFile: string;
  /** Absolute path to the pending-analysis manifest JSON. */
  pendingAnalysisFile: string;
  /** Resolved analysis mode. */
  analysisMode: AnalysisMode;
  /** Whether Cypress is running in interactive mode (`cypress open`). */
  isInteractive: boolean;
  /** Configured viewport width (pixels). */
  width: number;
  /** Configured viewport height (pixels). */
  height: number;
  /** Whether to fit the viewport to the page scroll width before capture. */
  fitToPage: boolean;
  /** Maximum viewport width when fitting. */
  maxViewportWidth: number;
  /** Maximum viewport height when fitting. */
  maxViewportHeight: number;
  /**
   * Browser-window launch width.
   * Capped at {@link LAUNCH_WIDTH_CAP} so Electron can still open reliably.
   */
  launchWidth: number;
  /**
   * Browser-window launch height.
   * Capped at {@link LAUNCH_HEIGHT_CAP} so Electron can still open reliably.
   */
  launchHeight: number;
  /** Whether to overwrite baseline on every run. */
  updateBaseline: boolean;
  /** Milliseconds to wait for a screenshot file. */
  screenshotTimeout: number;
  /** Screenshot capture mode. */
  capture: "fullPage" | "viewport" | "runner";
}

// ─── Internal constants ───────────────────────────────────────────────────────

/** Maximum browser-window width to keep Electron stable at high DPI. */
const LAUNCH_WIDTH_CAP = 3840;
/** Maximum browser-window height to keep Electron stable at high DPI. */
const LAUNCH_HEIGHT_CAP = 2160;

// ─── Public helpers ───────────────────────────────────────────────────────────

/**
 * Resolve and normalise the `snapshotOcrMode` / `analysisMode` option.
 *
 * Mapping:
 * - `undefined | null | "after"` → `"after"`
 * - `"deferred"` → `"deferred"`
 * - `"inline"` → `"after"` with a deprecation warning
 * - any other value → `"after"` with an unknown-value warning
 *
 * @param raw - The raw value provided by the user (or `undefined`).
 * @returns The resolved {@link AnalysisMode}.
 */
export function resolveAnalysisMode(
  raw: string | undefined | null,
): AnalysisMode {
  if (raw === undefined || raw === null || raw === "after") return "after";
  if (raw === "deferred") return "deferred";

  if (raw === "inline") {
    console.warn(
      `[snapshot-reporter] snapshotOcrMode "inline" is removed; falling back to "after". ` +
        `Analysis runs after the Cypress run (not during tests).`,
    );
    return "after";
  }

  console.warn(
    `[snapshot-reporter] Unknown snapshotOcrMode "${raw}"; falling back to "after".`,
  );
  return "after";
}

/**
 * Resolve all plugin configuration from user-supplied options and the Cypress
 * config object, applying defaults for every missing value.
 *
 * This function is **pure** with respect to the filesystem — it reads nothing
 * and writes nothing. Directory creation is handled by the caller.
 *
 * @param cypressConfig - The Cypress plugin config object (read-only here).
 * @param options - User-supplied plugin options.
 * @returns Fully-resolved {@link ResolvedConfig}.
 */
export function resolveConfig(
  cypressConfig: { projectRoot?: string; isInteractive?: boolean },
  options: SnapshotPluginOptions = {},
): ResolvedConfig {
  const root = cypressConfig.projectRoot || process.cwd();
  const snapshotsRoot = path.join(root, "cypress", "snapshots");
  const reportsDir = path.join(snapshotsRoot, "reports");

  const baselineDir =
    options.baselineDir ?? path.join(snapshotsRoot, "baseline");
  const actualDir = options.actualDir ?? path.join(snapshotsRoot, "actual");
  const diffDir = options.diffDir ?? path.join(snapshotsRoot, "diff");
  const excelFile =
    options.excelFile ?? path.join(reportsDir, "diff-report.xlsx");
  const pendingAnalysisFile =
    options.pendingAnalysisFile ??
    path.join(reportsDir, "pending-analysis.json");

  const analysisMode = resolveAnalysisMode(options.snapshotOcrMode);
  const isInteractive = cypressConfig.isInteractive === true;

  const width = options.viewportWidth ?? options.browserWidth ?? 1280;
  const height = options.viewportHeight ?? options.browserHeight ?? 800;
  const fitToPage = options.fitToPage ?? true;
  const maxViewportWidth = options.maxViewportWidth ?? 8192;
  const maxViewportHeight = options.maxViewportHeight ?? 8192;

  // Compute browser launch dimensions.
  // The window must be at least as large as the viewport, but capped so Electron
  // can still open reliably on all platforms.
  const launchWidth = fitToPage
    ? Math.max(width, Math.min(maxViewportWidth, LAUNCH_WIDTH_CAP))
    : width;
  const launchHeight = fitToPage
    ? Math.max(height, Math.min(maxViewportHeight, LAUNCH_HEIGHT_CAP))
    : height;

  return {
    baselineDir,
    actualDir,
    diffDir,
    reportsDir,
    excelFile,
    pendingAnalysisFile,
    analysisMode,
    isInteractive,
    width,
    height,
    fitToPage,
    maxViewportWidth,
    maxViewportHeight,
    launchWidth,
    launchHeight,
    updateBaseline: options.updateBaseline ?? false,
    screenshotTimeout: options.screenshotTimeout ?? 5000,
    capture: options.capture ?? "fullPage",
  };
}

/**
 * Ensure all required plugin directories exist, creating them recursively as
 * needed.
 *
 * @param cfg - Resolved plugin configuration.
 */
export function ensurePluginDirectories(cfg: ResolvedConfig): void {
  for (const dir of [
    cfg.baselineDir,
    cfg.actualDir,
    cfg.diffDir,
    cfg.reportsDir,
  ]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Apply resolved configuration values back onto the Cypress config object so
 * that they are available to Cypress commands via `Cypress.env()` and
 * `Cypress.config()`.
 *
 * @param cypressConfig - The mutable Cypress config object.
 * @param cfg - Resolved plugin configuration.
 * @param tempDir - The scratch directory used for raw captures.
 * @param defaultScreenshotsDir - Original `screenshotsFolder` value (before override).
 */
export function applyCypressConfig(
  cypressConfig: Record<string, unknown>,
  cfg: ResolvedConfig,
  tempDir: string,
  defaultScreenshotsDir: string,
): void {
  // Keep viewport dimensions in sync so cy.viewport() works as expected.
  cypressConfig["viewportWidth"] = cfg.width;
  cypressConfig["viewportHeight"] = cfg.height;

  // Redirect Cypress screenshot output to the scratch directory.
  // The original path is preserved in the env so tasks can fall back to it.
  cypressConfig["screenshotsFolder"] = tempDir;

  cypressConfig["env"] =
    (cypressConfig["env"] as Record<string, unknown>) ?? {};
  const env = cypressConfig["env"] as Record<string, unknown>;

  env["snapshotBaselineDir"] = cfg.baselineDir;
  env["snapshotActualDir"] = cfg.actualDir;
  env["snapshotDiffDir"] = cfg.diffDir;
  env["snapshotExcelFile"] = cfg.excelFile;
  env["snapshotPendingAnalysisFile"] = cfg.pendingAnalysisFile;
  // `snapshotAnalysisMode` is the canonical key; `snapshotOcrMode` is the
  // legacy alias read by `commands.js` / `cy.matchSnapshot()`.
  env["snapshotAnalysisMode"] = cfg.analysisMode;
  env["snapshotOcrMode"] = cfg.analysisMode;
  env["snapshotUpdateBaseline"] = cfg.updateBaseline;
  env["snapshotScreenshotTimeout"] = cfg.screenshotTimeout;
  env["snapshotViewportWidth"] = cfg.width;
  env["snapshotViewportHeight"] = cfg.height;
  env["snapshotCapture"] = cfg.capture;
  env["snapshotFitToPage"] = cfg.fitToPage;
  env["snapshotMaxViewportWidth"] = cfg.maxViewportWidth;
  env["snapshotMaxViewportHeight"] = cfg.maxViewportHeight;
  env["snapshotLaunchWidth"] = cfg.launchWidth;
  env["snapshotLaunchHeight"] = cfg.launchHeight;
  env["snapshotDefaultScreenshotsDir"] = defaultScreenshotsDir;
}
