/**
 * `matchSnapshot` Cypress command implementation.
 *
 * This module implements the browser-side logic for the `cy.matchSnapshot()`
 * custom command. It runs entirely inside the Cypress browser context, so it
 * may use `cy.*` APIs but must NOT import Node-only modules.
 *
 * ### Flow
 *
 * 1. Resolve options (threshold, capture mode, directories, …)
 * 2. Warn if the snapshot name has leading/trailing spaces
 * 3. Expand the viewport to the page's full scroll-width (`applyFitViewport`)
 * 4. Wait a short stabilisation delay
 * 5. Take a screenshot (`cy.screenshot`)
 * 6. Call the `compareSnapshot` task (Node process)
 * 7. Handle the comparison result (logging, context, update-baseline, fail-on-diff)
 */

// ─── Browser-side imports only ────────────────────────────────────────────────
//
// These helpers live in `src/utils/` but only use browser-compatible code.
// The TypeScript compiler will inline their types; at runtime Cypress bundles
// them for the browser.

import { sanitizeSnapshotName, buildSnapshotKey } from "../utils/snapshotPath";
import {
  computeFitViewportSize,
  type FitViewportResult,
} from "../utils/fitViewport";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options accepted by `cy.matchSnapshot()`. */
export interface MatchSnapshotOptions {
  /**
   * Pixel mismatch threshold (0–1).
   * Falls back to `Cypress.env("snapshotThreshold")` then `0.1`.
   */
  threshold?: number;

  /**
   * Whether to throw when a diff is detected.
   * Falls back to `Cypress.env("failOnSnapshotDiff")` then `false`.
   */
  failOnDiff?: boolean;

  /**
   * Include this snapshot in the pending-analysis manifest so the post-run
   * AI report processes it.
   * @default true
   */
  runOcr?: boolean;

  /**
   * Override the analysis mode for this snapshot only.
   * @see resolveCommandOcrMode
   */
  ocrMode?: "after" | "deferred";

  /**
   * Overwrite the baseline with the current screenshot.
   * Falls back to `Cypress.env("snapshotUpdateBaseline")` then `false`.
   */
  updateBaseline?: boolean;

  /** Override the diff directory for context links. */
  diffDir?: string;

  /** Screenshot capture timeout (ms). @default 5000 */
  screenshotTimeout?: number;

  /**
   * Cypress screenshot capture mode.
   * Defaults to `"viewport"` when called on a subject, `"fullPage"` otherwise.
   */
  capture?: "viewport" | "fullPage" | "runner";

  /** Override the viewport width used for fit-to-page calculation. */
  viewportWidth?: number;
  /** Override the viewport height used for fit-to-page calculation. */
  viewportHeight?: number;

  /** Enable/disable fit-to-page viewport expansion. */
  fitToPage?: boolean;
  /** Hard cap on viewport width when fitting. */
  maxViewportWidth?: number;
  /** Hard cap on viewport height when fitting. */
  maxViewportHeight?: number;
}

/** Shape of the object returned by the `compareSnapshot` task. */
interface CompareSnapshotResult {
  status:
    | "baseline_created"
    | "size_mismatch"
    | "matched"
    | "noise_ignored"
    | "compared";
  name: string;
  mismatch?: number;
  totalPixels?: number;
  mismatchPercent?: string;
  severity?: string;
  baseline?: { width: number; height: number };
  actual?: { width: number; height: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Attach a key/value pair to the Cypress test context (visible in the
 * Mochawesome / cypress-mochawesome-reporter HTML report).
 *
 * Silently no-ops when the `cy.addTestContext` command is not available.
 *
 * @param title - Context label.
 * @param value - Context value.
 */
function addContext(title: string, value: string): void {
  // `addTestContext` is provided by optional reporter plugins; guard with unknown cast.
  const cyAny = cy as unknown as {
    addTestContext?: (ctx: { title: string; value: string }) => void;
  };
  if (typeof cyAny.addTestContext === "function") {
    cyAny.addTestContext({ title, value });
  }
}

/**
 * Return the spec-relative root used for building snapshot keys.
 *
 * Prefers `Cypress.spec.relative` (Cypress ≥ 10) then `Cypress.spec.name`.
 */
function getSpecSnapshotRoot(): string {
  const spec = Cypress.spec as { relative?: string; name?: string } | undefined;
  return (spec?.relative ?? spec?.name) || "unknown";
}

/**
 * Build the fully-qualified snapshot key: `<specName>/<sanitizedUserName>`.
 *
 * @param name - User-provided snapshot name.
 * @returns Snapshot key path.
 */
function makeSnapshotKey(name: string): string {
  return buildSnapshotKey(getSpecSnapshotRoot(), name);
}

/**
 * Log a Cypress warning when the snapshot name has leading/trailing whitespace.
 * The spaces are trimmed internally so captures still work, but the warning
 * helps users track down inconsistent names.
 *
 * @param name - Raw snapshot name as supplied by the user.
 */
function warnIfSnapshotNameHasSpaces(name: string): void {
  const raw = String(name ?? "");
  if (raw !== raw.trim()) {
    Cypress.log({
      name: "snapshot-warning",
      message: `Snapshot name "${raw}" has leading/trailing spaces; they will be trimmed.`,
      consoleProps: () => ({ name: raw }),
    });
  }
}

/**
 * Build a human-readable path used in report context entries.
 *
 * @param baseDir - Base directory (e.g. `Cypress.env("snapshotDiffDir")`).
 * @param snapshotName - Fully-qualified snapshot key.
 * @returns Forward-slash path string ending in `.png`.
 */
function toReportPath(baseDir: string, snapshotName: string): string {
  const base = String(baseDir ?? "")
    .replace(/\\/g, "/")
    .replace(/\/+$/, "");
  const name = String(snapshotName ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  return `${base}/${name}.png`;
}

/**
 * Normalise the analysis mode for use in the command layer.
 *
 * Unlike the plugin-side resolver, this one only accepts `"after"` and
 * `"deferred"`. Any other value (including `"inline"`) maps to `"after"`.
 *
 * @param raw - Raw mode string (or undefined).
 * @returns `"after"` or `"deferred"`.
 */
function resolveCommandOcrMode(
  raw: string | undefined | null,
): "after" | "deferred" {
  if (raw === "deferred") return "deferred";
  return "after";
}

// ─── Viewport helpers ─────────────────────────────────────────────────────────

/**
 * Read the base viewport dimensions from command options or Cypress env/config.
 *
 * Priority (highest first):
 * 1. `options.viewportWidth` / `options.viewportHeight`
 * 2. `Cypress.env("snapshotViewportWidth")` / `Cypress.env("snapshotViewportHeight")`
 * 3. `Cypress.config("viewportWidth")` / `Cypress.config("viewportHeight")`
 * 4. Hardcoded defaults 1280 × 800
 *
 * @param options - Per-call snapshot options.
 * @returns Resolved base viewport dimensions.
 */
function resolveBaseViewport(options: MatchSnapshotOptions = {}): {
  width: number;
  height: number;
} {
  const width =
    options.viewportWidth ??
    (Cypress.env("snapshotViewportWidth") as number | undefined) ??
    (Cypress.config("viewportWidth") as number | undefined) ??
    1280;
  const height =
    options.viewportHeight ??
    (Cypress.env("snapshotViewportHeight") as number | undefined) ??
    (Cypress.config("viewportHeight") as number | undefined) ??
    800;
  return { width: Number(width), height: Number(height) };
}

/**
 * Expand the Cypress viewport to the page's full scroll-width (and optionally
 * scroll-height) before taking a screenshot.
 *
 * This prevents horizontal clipping on wide pages while still allowing
 * `fullPage` to scroll vertically for tall content.
 *
 * **Important:** This function only chains Cypress commands — it must not mix
 * synchronous returns with `cy.*` calls inside the same `.then()`.
 *
 * @param options - Per-call snapshot options.
 * @returns Cypress chain that resolves after the viewport has been applied.
 */
function applyFitViewport(options: MatchSnapshotOptions = {}): void {
  const base = resolveBaseViewport(options);

  const rawFitToPage = options.fitToPage ?? Cypress.env("snapshotFitToPage");
  const fitToPage = rawFitToPage !== false && rawFitToPage !== "false";

  const maxWidth = Number(
    options.maxViewportWidth ?? Cypress.env("snapshotMaxViewportWidth") ?? 8192,
  );
  const maxHeight = Number(
    options.maxViewportHeight ??
      Cypress.env("snapshotMaxViewportHeight") ??
      8192,
  );

  // Never request a viewport larger than the launched browser window.
  const launchWidth = Number(Cypress.env("snapshotLaunchWidth")) || maxWidth;
  const launchHeight = Number(Cypress.env("snapshotLaunchHeight")) || maxHeight;
  const effectiveMaxWidth = Math.min(maxWidth, launchWidth);
  const effectiveMaxHeight = Math.min(maxHeight, launchHeight);

  /**
   * Verify the viewport was actually applied by comparing requested vs actual
   * document dimensions. Logs a warning on mismatch (e.g. browser window too
   * small) but does NOT fail the test.
   */
  function verifyApplied(requested: {
    width: number;
    height: number;
    fitted: boolean;
  }): void {
    cy.document({ log: false }).then((doc) => {
      const appliedW = doc.documentElement.clientWidth;
      const appliedH = doc.documentElement.clientHeight;

      Cypress.log({
        name: "snapshot-viewport",
        message: `${requested.width}×${requested.height}${requested.fitted ? " (fit)" : ""} → actual ${appliedW}×${appliedH}`,
        consoleProps: () => ({
          requested,
          actual: { width: appliedW, height: appliedH },
          launchWindow: { width: launchWidth, height: launchHeight },
          configViewport: {
            width: Cypress.config("viewportWidth"),
            height: Cypress.config("viewportHeight"),
          },
        }),
      });

      if (Math.abs(appliedW - requested.width) > 2) {
        Cypress.log({
          name: "snapshot-viewport-warn",
          message:
            `Viewport width not fully applied (wanted ${requested.width}, got ${appliedW}). ` +
            `Browser window may be too small.`,
        });
      }
    });
  }

  if (!fitToPage) {
    cy.viewport(base.width, base.height);
    cy.then(() => verifyApplied({ ...base, fitted: false }));
    return;
  }

  cy.document({ log: false }).then((doc) => {
    const el = doc.documentElement;
    const body = doc.body ?? el;

    const pageWidth = Math.max(
      el.scrollWidth || 0,
      el.clientWidth || 0,
      body.scrollWidth || 0,
      body.clientWidth || 0,
      base.width,
    );
    const pageHeight = Math.max(
      el.clientHeight || 0,
      body.clientHeight || 0,
      base.height,
    );

    const size = computeFitViewportSize({
      baseWidth: base.width,
      baseHeight: base.height,
      pageWidth,
      pageHeight,
      maxWidth: effectiveMaxWidth,
      maxHeight: effectiveMaxHeight,
      fitToPage: true,
    });

    cy.viewport(size.width, size.height);
    cy.then(() => verifyApplied(size));
  });
}

// ─── Result handler ───────────────────────────────────────────────────────────

/**
 * Process the result of the `compareSnapshot` task.
 *
 * Responsibilities:
 * - Log the comparison outcome via `cy.log`
 * - Attach rich context to the Mochawesome report
 * - Queue the snapshot for AI analysis if applicable
 * - Trigger a baseline update when `autoUpdate` is set
 * - Throw an assertion error when `failOnDiff` is set and a diff was detected
 *
 * @param result - Object returned by the `compareSnapshot` task.
 * @param ctx - Options and resolved values from the calling command.
 */
function handleCompareResult(
  result: CompareSnapshotResult,
  ctx: {
    snapshotKey: string;
    diffDir: string;
    runOcr: boolean;
    ocrMode: "after" | "deferred";
    autoUpdate: boolean;
    failOnDiff: boolean;
    screenshotTimeout: number;
  },
): void {
  const {
    snapshotKey,
    diffDir,
    runOcr,
    ocrMode,
    autoUpdate,
    failOnDiff,
    screenshotTimeout,
  } = ctx;

  cy.log(
    `[snapshot] ${result.name} → ${result.status}` +
      (result.severity ? ` | ${result.severity}` : "") +
      (result.mismatchPercent ? ` | ${result.mismatchPercent}` : ""),
  );

  // ── Contextual annotations ─────────────────────────────────────────────────

  if (result.status === "baseline_created") {
    addContext("Snapshot", `Baseline created: ${snapshotKey}`);
  }

  if (result.status === "size_mismatch" && result.baseline && result.actual) {
    addContext(
      "Size Mismatch",
      `${result.baseline.width}×${result.baseline.height} vs ${result.actual.width}×${result.actual.height}`,
    );
  }

  const hasDiff = result.status === "compared" && (result.mismatch ?? 0) > 0;

  if (hasDiff) {
    addContext(
      `Severity: ${result.severity ?? "Unknown"}`,
      `${result.mismatch} pixels (${result.mismatchPercent})`,
    );
    addContext("Diff Image", toReportPath(diffDir, snapshotKey));
  }

  // ── Queue for AI analysis ──────────────────────────────────────────────────

  if (hasDiff && runOcr) {
    cy.task("recordPendingAnalysis", {
      name: snapshotKey,
      mismatch: result.mismatch,
      totalPixels: result.totalPixels,
      severity: result.severity,
      mismatchPercent: result.mismatchPercent,
    }).then((rec) => {
      const pending = (rec as { pending?: number }).pending;
      if (ocrMode === "deferred") {
        cy.log(
          `[ocr] deferred (${pending} pending) — run npx cypress-snapshot-ocr-report after the run`,
        );
        addContext(
          "OCR",
          `Deferred [${result.severity}] — run cypress-snapshot-bug-reporter manually`,
        );
      } else {
        cy.log(
          `[ocr] recorded (${pending} pending) — Excel report auto-runs after cypress run`,
        );
        addContext(
          "OCR",
          `Pending [${result.severity}] — processed after the run`,
        );
      }
    });
  }

  // ── Baseline auto-update ───────────────────────────────────────────────────

  if (
    autoUpdate &&
    ["matched", "noise_ignored", "compared", "size_mismatch"].includes(
      result.status,
    )
  ) {
    cy.task("updateBaseline", { name: snapshotKey, screenshotTimeout }).then(
      () => {
        cy.log(`[snapshot] baseline updated: ${snapshotKey}`);
        addContext("Snapshot", `Updated: ${snapshotKey}`);
      },
    );
  }

  // ── Fail on diff ───────────────────────────────────────────────────────────

  if (hasDiff && failOnDiff) {
    throw new Error(
      `[${result.severity ?? "Unknown"}] Mismatch "${snapshotKey}": ${result.mismatchPercent}`,
    );
  }
}

// ─── Command implementation ───────────────────────────────────────────────────

/**
 * Cypress command implementation for `cy.matchSnapshot()` (and its chained
 * variant `cy.get(…).matchSnapshot()`).
 *
 * This function is registered with `Cypress.Commands.add` in
 * {@link registerMatchSnapshotCommand}.  It should not be called directly.
 *
 * @param subject - Optional DOM subject when used as a chained command.
 * @param name - Unique snapshot name (required).
 * @param options - Per-call options.
 */
export function matchSnapshotImpl(
  // JQuery is provided by Cypress's bundled jQuery — no import needed
  subject: unknown,
  name: string,
  options: MatchSnapshotOptions = {},
): void {
  // ── Validate inputs ────────────────────────────────────────────────────────

  if (!name) {
    throw new Error("matchSnapshot requires a name");
  }

  warnIfSnapshotNameHasSpaces(name);

  // ── Resolve options ────────────────────────────────────────────────────────

  const threshold =
    options.threshold ??
    (Cypress.env("snapshotThreshold") as number | undefined) ??
    0.1;

  const failOnDiff =
    options.failOnDiff ??
    (Cypress.env("failOnSnapshotDiff") as boolean | undefined) ??
    false;

  const runOcr = options.runOcr ?? true;

  const ocrMode = resolveCommandOcrMode(
    options.ocrMode ??
      (Cypress.env("snapshotOcrMode") as string | undefined) ??
      "after",
  );

  const autoUpdate =
    options.updateBaseline ??
    (Cypress.env("snapshotUpdateBaseline") as boolean | undefined) ??
    false;

  const diffDir =
    options.diffDir ??
    (Cypress.env("snapshotDiffDir") as string | undefined) ??
    "cypress/snapshots/diff";

  const screenshotTimeout =
    options.screenshotTimeout ??
    (Cypress.env("snapshotScreenshotTimeout") as number | undefined) ??
    5000;

  // fullPage for page shots so vertical content is included.
  // Width is handled by applyFitViewport (scroll-width expansion).
  // Explicit capture: "viewport" is an escape hatch for a fixed-size frame.
  const capture: "viewport" | "fullPage" | "runner" =
    options.capture ??
    (Cypress.env("snapshotCapture") as
      "fullPage" | "viewport" | "runner" | undefined) ??
    (subject ? "viewport" : "fullPage");

  // ── Build snapshot key ─────────────────────────────────────────────────────

  const safeName = sanitizeSnapshotName(name);
  const snapshotKey = makeSnapshotKey(name);

  // ── Capture screenshot ─────────────────────────────────────────────────────

  // We need the captured path so the Node-side task can locate the file.
  // `onAfterScreenshot` fires synchronously within the Cypress task pipeline,
  // so it is safe to close over this mutable variable.
  let capturedScreenshotPath: string | null = null;

  const screenshotOptions = {
    capture,
    overwrite: true,
    onAfterScreenshot(_$el: unknown, props: { path?: string }) {
      if (props?.path) capturedScreenshotPath = props.path;
    },
  };

  // 1) Grow viewport to full page width (prevents horizontal crop).
  // 2) Wait a short time for layout to stabilise.
  // 3) Capture screenshot — fullPage scrolls vertically; element screenshot stays fixed.
  // 4) Compare via Node-side task.
  applyFitViewport(options);
  cy.wait(150);

  if (subject) {
    cy.wrap(subject as Parameters<typeof cy.wrap>[0], {
      log: false,
    }).screenshot(safeName, screenshotOptions as Cypress.ScreenshotOptions);
  } else {
    cy.screenshot(safeName, screenshotOptions as Cypress.ScreenshotOptions);
  }

  // Defer the task call until after the screenshot so `capturedScreenshotPath`
  // is set. Keep the chain flat — do NOT nest `cy.task().then()` inside a
  // `cy.then(() => { … })`.
  cy.then(() =>
    cy.task(
      "compareSnapshot",
      {
        name: snapshotKey,
        screenshotPath: capturedScreenshotPath,
        threshold,
        screenshotTimeout,
      },
      { timeout: 30_000 },
    ),
  ).then((result) => {
    handleCompareResult(result as CompareSnapshotResult, {
      snapshotKey,
      diffDir,
      runOcr,
      ocrMode,
      autoUpdate,
      failOnDiff,
      screenshotTimeout,
    });
  });
}

// Ensure FitViewportResult is used (re-exported for consumers if needed)
export type { FitViewportResult };
