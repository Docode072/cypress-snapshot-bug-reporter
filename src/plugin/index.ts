/**
 * Main plugin entry-point for `cypress-snapshot-bug-reporter`.
 *
 * ## Quick-start
 *
 * ```ts
 * // cypress.config.ts
 * import { defineConfig } from 'cypress';
 * import { configSnapshot } from 'cypress-snapshot-bug-reporter/plugin';
 *
 * export default defineConfig({
 *   e2e: {
 *     setupNodeEvents(on, config) {
 *       // ⚠ You MUST return config so that the overridden screenshotsFolder
 *       //   takes effect. Without the return, screenshots land in the default
 *       //   location and the plugin cannot find them.
 *       return configSnapshot(on, config);
 *     },
 *   },
 * });
 * ```
 *
 * @module plugin
 */

import * as fs from "fs";
import * as path from "path";

// Load .env file automatically so users don't need to configure dotenv themselves
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("dotenv").config();
} catch (_e) {
  // dotenv is a dependency, but if it somehow fails, continue silently
}

import { hideDir, removeDir } from "../utils/filesystem";
import {
  resolveConfig,
  ensurePluginDirectories,
  applyCypressConfig,
  resolveAnalysisMode,
  type SnapshotPluginOptions,
  type ResolvedConfig,
  type AnalysisMode,
} from "./config";
import { registerTasks } from "./tasks";

// ─── Public re-exports ────────────────────────────────────────────────────────

export { resolveAnalysisMode };
export type { SnapshotPluginOptions, ResolvedConfig, AnalysisMode };

// ─── Cypress type shim ────────────────────────────────────────────────────────
//
// The `cypress` package is a *peer* dependency — it is not listed in
// `dependencies` or `devDependencies`. This shim lets the file compile without
// a hard `import type … from 'cypress'`, which would require the type package
// to always be present.

/** Minimal surface of the Cypress plugin config object used by this module. */
interface CypressPluginConfigOptions {
  projectRoot?: string;
  isInteractive?: boolean;
  screenshotsFolder?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  env?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Minimal surface of the Cypress plugin events function. */
type CypressPluginEvents = (
  event: string,
  handler: (...args: unknown[]) => unknown,
) => void;

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Configure the snapshot plugin inside Cypress's `setupNodeEvents`.
 *
 * ### What this function does
 *
 * 1. Resolves all options (directories, viewport sizes, analysis mode) with
 *    sensible defaults.
 * 2. Creates all required output directories.
 * 3. Sets up a hidden scratch directory for raw captures, keeping the user's
 *    `cypress/snapshots/` folder tidy.
 * 4. Registers the `compareSnapshot`, `updateBaseline`, `analyzeDiffRegions`,
 *    and `recordPendingAnalysis` Cypress tasks.
 * 5. Hooks `after:spec`, `after:run`, and `before:browser:launch` for
 *    lifecycle management and browser-window sizing.
 * 6. Mutates and returns `config` so Cypress picks up the overridden viewport
 *    and `screenshotsFolder` values.
 *
 * ### Return value
 *
 * The modified `config` object **must** be returned from `setupNodeEvents`,
 * otherwise Cypress ignores the `screenshotsFolder` override and screenshots
 * land in the wrong directory.
 *
 * @param on - Cypress plugin events registration function.
 * @param config - Mutable Cypress plugin configuration object.
 * @param options - Optional user configuration. All fields have defaults.
 * @returns The mutated `config` object (must be returned by the caller).
 *
 * @example
 * ```ts
 * // Minimal usage — all defaults
 * setupNodeEvents(on, config) {
 *   return configSnapshot(on, config);
 * }
 * ```
 *
 * @example
 * ```ts
 * // Custom directories and viewport
 * setupNodeEvents(on, config) {
 *   return configSnapshot(on, config, {
 *     baselineDir: 'test/snapshots/baseline',
 *     actualDir:   'test/snapshots/actual',
 *     diffDir:     'test/snapshots/diff',
 *     viewportWidth:  1440,
 *     viewportHeight: 900,
 *   });
 * }
 * ```
 *
 * @example
 * ```ts
 * // Deferred analysis — run report manually after the test suite
 * setupNodeEvents(on, config) {
 *   return configSnapshot(on, config, { snapshotOcrMode: 'deferred' });
 * }
 * ```
 */
export function configSnapshot(
  on: CypressPluginEvents,
  config: CypressPluginConfigOptions,
  options: SnapshotPluginOptions = {},
): CypressPluginConfigOptions {
  // 1. Resolve all configuration values.
  const cfg = resolveConfig(config, options);

  // 2. Ensure output directories exist.
  ensurePluginDirectories(cfg);

  // 3. Locate the original screenshotsFolder BEFORE we override it.
  //    When `setupNodeEvents` does not return `config`, Cypress uses this path
  //    instead. The tasks fall back to it as a secondary search location.
  const projectRoot = config.projectRoot ?? process.cwd();
  const defaultScreenshotsDir =
    (config.screenshotsFolder as string | undefined) ??
    path.join(projectRoot, "cypress", "screenshots");

  // 4. Set up the hidden scratch directory for raw captures.
  //    A dot-prefix hides it on macOS/Linux; on Windows we also set the
  //    hidden file attribute (see `hideDir`). Clear any leftovers from a
  //    previously interrupted run, then (re)create and hide it.
  const tempDir = path.join(projectRoot, "cypress", ".csr-temp");
  removeDir(tempDir);
  fs.mkdirSync(tempDir, { recursive: true });
  hideDir(tempDir);

  // 5. Write all resolved values back onto the Cypress config object so that
  //    they propagate into `Cypress.env()` and `Cypress.config()`.
  applyCypressConfig(config, cfg, tempDir, defaultScreenshotsDir);

  // 6. Register tasks and lifecycle hooks.
  registerTasks(on as any, cfg, tempDir, defaultScreenshotsDir);

  // 7. Emit startup diagnostics.
  logStartupInfo(cfg);

  return config;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Print a human-readable summary of the resolved configuration to stdout.
 * This appears in the terminal when `cypress run` starts.
 *
 * @param cfg - Fully-resolved plugin configuration.
 */
function logStartupInfo(cfg: ResolvedConfig): void {
  const aiProvider = process.env["AI_PROVIDER"] ?? "(AI_PROVIDER not set)";
  const aiModel = process.env["AI_MODEL"] ?? "(AI_MODEL not set)";

  console.log(`[snapshot-reporter] Baseline:   ${cfg.baselineDir}`);
  console.log(
    `[snapshot-reporter] Viewport:   ${cfg.width}×${cfg.height}` +
      (cfg.fitToPage
        ? ` (fit-to-page on, browser window ${cfg.launchWidth}×${cfg.launchHeight})`
        : ""),
  );
  console.log(
    `[snapshot-reporter] Analysis:   AI pipeline (provider: ${aiProvider}; model: ${aiModel})`,
  );

  if (cfg.analysisMode === "after") {
    console.log(
      `[snapshot-reporter] Mode: after (default) — pixel compare during the run; ` +
        `AI analysis report auto-generated after cypress run when diffs are pending`,
    );
    if (cfg.isInteractive) {
      console.log(
        `[snapshot-reporter] Interactive mode (cypress open): after:run does not fire, ` +
          `so analysis will not auto-run. After your session, run: npx cypress-snapshot-bug-reporter`,
      );
    }
  } else {
    console.log(
      `[snapshot-reporter] Mode: deferred — pixel compare during the run; ` +
        `AI analysis is NOT auto-run. After cypress run, execute: npx cypress-snapshot-bug-reporter`,
    );
  }
}
