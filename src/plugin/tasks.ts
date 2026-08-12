/**
 * Cypress task registration for the snapshot plugin.
 *
 * This module wires the plugin's Node-side task handlers into Cypress's
 * `on("task", …)` event and also registers lifecycle hooks:
 *
 * - `after:spec`  — empties the scratch capture directory between specs
 * - `after:run`   — removes the scratch directory and (optionally) fires the
 *                   post-run AI analysis report
 * - `before:browser:launch` — ensures the browser window is large enough to
 *                   avoid screenshot cropping
 *
 * All of these handlers are registered by {@link registerTasks}.
 */

import * as path from "path";
import { spawnSync } from "child_process";
import { emptyDir, removeDir } from "../utils/filesystem";
import type { ResolvedConfig } from "./config";

// ─── Cypress event types ───────────────────────────────────────────────────────
//
// The Cypress type for `on` is `Cypress.PluginEvents`, which is a strict
// overloaded function. We use a looser signature here so the plugin compiles
// even when `@types/cypress` is not installed.

/** Minimal `PluginEvents` surface needed by this module. */
type PluginOn = (event: string, handler: (...args: never[]) => unknown) => void;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Read the pending-analysis manifest and, if it contains entries, spawn the
 * post-run AI analysis script in a child process.
 *
 * The script runs outside the Cypress process so that its duration and any
 * errors it produces never affect the Cypress exit code.
 *
 * @param pendingAnalysisFile - Absolute path to the manifest JSON.
 * @param excelFile - Fallback Excel report path (used when the manifest does
 *   not record one).
 */
function spawnAnalysisReport(
  pendingAnalysisFile: string,
  excelFile: string,
): void {
  // Lazy-require so this module remains importable in browser-side bundles
  // (even though it will never be executed there).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { readManifest } = require("../tasks/analysisManifest") as {
    readManifest: (
      file: string,
    ) => { items?: unknown[]; dirs?: { excelFile?: string } } | null;
  };

  const manifest = readManifest(pendingAnalysisFile);
  if (
    !manifest ||
    !Array.isArray(manifest.items) ||
    manifest.items.length === 0
  ) {
    return;
  }

  const scriptPath = path.join(
    __dirname,
    "..",
    "..",
    "scripts",
    "snapshot-analysis-report.js",
  );
  const excelPath = manifest.dirs?.excelFile ?? excelFile;

  console.log(
    `[snapshot-reporter] Running AI analysis report (${manifest.items.length} pending)…`,
  );

  let result: ReturnType<typeof spawnSync>;
  try {
    result = spawnSync(process.execPath, [scriptPath, pendingAnalysisFile], {
      stdio: "inherit",
      env: process.env,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[snapshot-reporter] Analysis report failed: ${message}`);
    return;
  }

  if (result.error) {
    console.warn(
      `[snapshot-reporter] Analysis report failed to start: ${result.error.message}`,
    );
    return;
  }

  if (result.status === 0) {
    console.log(
      `[snapshot-reporter] Analysis report complete. Excel: ${excelPath}`,
    );
  } else {
    console.warn(
      `[snapshot-reporter] Analysis report exited with code ${result.status ?? "unknown"} ` +
        `(Cypress exit code unaffected)`,
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Register all Cypress tasks and lifecycle event hooks for the snapshot plugin.
 *
 * Must be called inside `setupNodeEvents` after the Cypress config has been
 * resolved and all required directories have been created.
 *
 * @param on - The Cypress plugin events function.
 * @param cfg - Fully-resolved plugin configuration.
 * @param tempDir - Absolute path to the scratch capture directory.
 * @param defaultScreenshotsDir - Original `screenshotsFolder` value (before override).
 *
 * @example
 * ```ts
 * // cypress.config.ts
 * import { configSnapshot } from 'cypress-snapshot-bug-reporter';
 *
 * export default defineConfig({
 *   e2e: {
 *     setupNodeEvents(on, config) {
 *       return configSnapshot(on, config);
 *     },
 *   },
 * });
 * ```
 */
export function registerTasks(
  on: PluginOn,
  cfg: ResolvedConfig,
  tempDir: string,
  defaultScreenshotsDir: string,
): void {
  // ── Task registration ──────────────────────────────────────────────────────
  //
  // Lazy-require the JS task modules so that this file compiles cleanly even
  // before those modules are converted to TypeScript.

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { makeSnapshotTasks } = require("../tasks/snapshotTasks") as {
    makeSnapshotTasks: (opts: {
      baselineDir: string;
      actualDir: string;
      diffDir: string;
      screenshotsDir: string;
      defaultScreenshotsDir: string;
      screenshotTimeout: number;
    }) => {
      compareSnapshot: (params: unknown) => Promise<unknown>;
      updateBaseline: (params: unknown) => Promise<unknown>;
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { makeAnalysisTasks } = require("../tasks/aiAnalysisTasks") as {
    makeAnalysisTasks: (opts: {
      baselineDir: string;
      actualDir: string;
      diffDir: string;
      excelFile: string;
    }) => {
      analyzeDiffRegions: (params: unknown) => Promise<unknown>;
    };
  };

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { makeManifestTasks } = require("../tasks/analysisManifest") as {
    makeManifestTasks: (opts: {
      baselineDir: string;
      actualDir: string;
      diffDir: string;
      excelFile: string;
      pendingFile: string;
    }) => {
      initPendingManifest: () => void;
      recordPendingAnalysis: (params: unknown) => unknown;
    };
  };

  const snapshotTasks = makeSnapshotTasks({
    baselineDir: cfg.baselineDir,
    actualDir: cfg.actualDir,
    diffDir: cfg.diffDir,
    screenshotsDir: tempDir,
    defaultScreenshotsDir,
    screenshotTimeout: cfg.screenshotTimeout,
  });

  const analysisTasks = makeAnalysisTasks({
    baselineDir: cfg.baselineDir,
    actualDir: cfg.actualDir,
    diffDir: cfg.diffDir,
    excelFile: cfg.excelFile,
  });

  const manifestTasks = makeManifestTasks({
    baselineDir: cfg.baselineDir,
    actualDir: cfg.actualDir,
    diffDir: cfg.diffDir,
    excelFile: cfg.excelFile,
    pendingFile: cfg.pendingAnalysisFile,
  });

  // Both analysis modes record diffs during the run → start with a clean manifest.
  manifestTasks.initPendingManifest();

  // Register snapshot tasks.
  // `on('task', …)` in Cypress accepts an object map of task handlers.
  // We cast to avoid strict type checking issues with PluginOn signature.
  (on as any)("task", {
    /**
     * Compare the captured screenshot against the baseline.
     * Creates the baseline on first run; otherwise produces a diff image.
     */
    compareSnapshot: snapshotTasks.compareSnapshot,

    /**
     * Copy the actual screenshot over the baseline, promoting it as the new
     * reference image.
     */
    updateBaseline: snapshotTasks.updateBaseline,

    /**
     * Trigger AI analysis of a diff image's changed regions.
     * Available for advanced / manual `cy.task()` use; `matchSnapshot` never
     * calls this directly — analysis always runs outside the Cypress process.
     */
    analyzeDiffRegions: analysisTasks.analyzeDiffRegions,

    /**
     * Append a diff entry to the pending-analysis manifest JSON so that the
     * post-run script knows which snapshots to analyse.
     */
    recordPendingAnalysis: manifestTasks.recordPendingAnalysis,
  });

  // ── Lifecycle hooks ────────────────────────────────────────────────────────

  /**
   * After each spec: empty the scratch directory so captures from one spec
   * cannot pollute the next. The directory itself is preserved so its hidden
   * attribute (on Windows) survives between specs.
   */
  on("after:spec", () => {
    emptyDir(tempDir);
    return null;
  });

  /**
   * After the whole run: remove the scratch directory entirely.
   *
   * NOTE: `after:run` fires in `cypress run` but NOT in interactive
   * `cypress open`. When `analysisMode` is `"after"`, kick off the AI report.
   */
  on("after:run", () => {
    removeDir(tempDir);

    if (cfg.analysisMode === "after") {
      console.log(
        `\n[cypress-snapshot-bug-reporter] 🤖 Spawning AI analysis report...`,
      );
      spawnAnalysisReport(cfg.pendingAnalysisFile, cfg.excelFile);
    }

    return null;
  });

  /**
   * Before browser launch: set the window size to match (or exceed) the
   * configured viewport.
   *
   * **Important:** Cypress only keeps ONE `before:browser:launch` handler.
   * If you register another one in your own `setupNodeEvents`, it will
   * silently override this one and viewport sizing will stop working.
   * Configure sizes via `viewportWidth` / `viewportHeight` options instead.
   */
  (
    on as (
      event: string,
      handler: (
        browser: { name: string; family: string },
        launchOptions: {
          preferences?: Record<string, unknown>;
          args?: string[];
        },
      ) => { preferences?: Record<string, unknown>; args?: string[] },
    ) => void
  )("before:browser:launch", (browser, launchOptions) => {
    const { launchWidth, launchHeight } = cfg;

    if (browser.name === "electron") {
      launchOptions.preferences = launchOptions.preferences ?? {};
      launchOptions.preferences["width"] = launchWidth;
      launchOptions.preferences["height"] = launchHeight;
    }

    // Chromium-family browsers: pass --window-size to prevent screenshot
    // clipping when the viewport is wider than the default window.
    if (browser.family === "chromium" && Array.isArray(launchOptions.args)) {
      launchOptions.args = launchOptions.args.filter(
        (arg) => typeof arg !== "string" || !arg.startsWith("--window-size="),
      );
      launchOptions.args.push(`--window-size=${launchWidth},${launchHeight}`);
    }

    return launchOptions;
  });
}
