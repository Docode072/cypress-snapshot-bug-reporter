#!/usr/bin/env node
"use strict";

/**
 * Post-run AI analysis report generator (shared by plugin `after:run` and the CLI).
 *
 * During `cypress run`, both analysis modes (`"after"` and `"deferred"`) perform
 * only the pixel compare and record each diff to a `pending-analysis.json` manifest.
 * This script builds the Excel report outside of Cypress:
 *
 *   1. Read the manifest (for output directories + per-diff severity).
 *   2. Process every PNG in the diff/ folder through the AI vision pipeline.
 *   3. Write structured results to diff-report.xlsx (16 annotated columns).
 *
 * Invoked automatically when snapshotOcrMode is `"after"` (plugin after:run),
 * or manually when mode is `"deferred"`:
 *   npx cypress-snapshot-bug-reporter
 *   node scripts/snapshot-analysis-report.js [pathToPendingManifest]
 *
 * Required environment variables:
 *   AI_PROVIDER, AI_ENDPOINT, AI_MODEL, AI_API_KEY
 *   (see src/tasks/aiAnalysisTasks.js for full documentation)
 *
 * Environment overrides (used when no manifest is found):
 *   SNAPSHOT_PENDING_ANALYSIS_FILE, SNAPSHOT_DIFF_DIR, SNAPSHOT_BASELINE_DIR,
 *   SNAPSHOT_ACTUAL_DIR, SNAPSHOT_EXCEL_FILE
 */

const fs   = require("fs");
const path = require("path");

const {
  analyzeDiffRegions,
} = require(path.join(__dirname, "..", "src", "tasks", "aiAnalysisTasks"));

const {
  readManifest,
  DEFAULT_PENDING_FILE,
  DEFAULT_BASELINE_DIR,
  DEFAULT_ACTUAL_DIR,
  DEFAULT_DIFF_DIR,
  DEFAULT_EXCEL_FILE,
} = require(path.join(__dirname, "..", "src", "tasks", "analysisManifest"));

function log(msg) {
  console.log(`[snapshot-analysis-report] ${msg}`);
}

function resolveConfig(overrides = {}) {
  const manifestPath =
    overrides.manifestPath ||
    process.argv[2]        ||
    process.env.SNAPSHOT_PENDING_ANALYSIS_FILE ||
    DEFAULT_PENDING_FILE;

  const manifest = readManifest(manifestPath);
  const dirs = (manifest && manifest.dirs) || {};

  return {
    manifestPath,
    manifest,
    baselineDir: dirs.baselineDir || process.env.SNAPSHOT_BASELINE_DIR || DEFAULT_BASELINE_DIR,
    actualDir:   dirs.actualDir   || process.env.SNAPSHOT_ACTUAL_DIR   || DEFAULT_ACTUAL_DIR,
    diffDir:     dirs.diffDir     || process.env.SNAPSHOT_DIFF_DIR     || DEFAULT_DIFF_DIR,
    excelFile:   dirs.excelFile   || process.env.SNAPSHOT_EXCEL_FILE   || DEFAULT_EXCEL_FILE,
  };
}

// Recursively list every diff PNG as a "name" relative to diffDir (no
// extension, forward-slash separated) — matching how snapshots are named.
function listDiffNames(diffDir) {
  const names = [];
  if (!fs.existsSync(diffDir)) return names;

  const walk = (currentDir) => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const full = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
        const rel = path.relative(diffDir, full)
          .replace(/\\/g, "/")
          .replace(/\.png$/i, "");
        names.push(rel);
      }
    }
  };

  walk(diffDir);
  return names;
}

// Merge manifest items (which carry severity / mismatch metadata) with the
// PNGs that actually exist in the diff folder.
// The diff folder is the source of truth for WHAT to process; the manifest
// enriches it with metadata.
function buildWorkList({ manifest, diffDir }) {
  const metaByName = new Map();
  if (manifest && Array.isArray(manifest.items)) {
    for (const item of manifest.items) {
      if (item && item.name) metaByName.set(item.name, item);
    }
  }

  const diffNames = listDiffNames(diffDir);
  const seen      = new Set();
  const work      = [];

  for (const name of diffNames) {
    seen.add(name);
    const meta = metaByName.get(name) || {};
    work.push({
      name,
      mismatch:    meta.mismatch    || 0,
      totalPixels: meta.totalPixels || 0,
      severity:    meta.severity    || "Low",
    });
  }

  // Include manifest items whose diff PNG is missing so they are reported
  // as skipped rather than silently dropped.
  for (const [name, meta] of metaByName) {
    if (!seen.has(name)) {
      work.push({
        name,
        mismatch:    meta.mismatch    || 0,
        totalPixels: meta.totalPixels || 0,
        severity:    meta.severity    || "Low",
        missingDiff: true,
      });
    }
  }

  return work;
}

async function runAnalysisReport(overrides = {}) {
  const cfg = resolveConfig(overrides);

  log(`Manifest: ${cfg.manifestPath}${cfg.manifest ? "" : " (not found — using defaults)"}`);
  log(`Diff dir: ${cfg.diffDir}`);
  log(`Excel:    ${cfg.excelFile}`);
  log(`Provider: ${process.env.AI_PROVIDER || "(not set)"}`);
  log(`Model:    ${process.env.AI_MODEL    || "(not set)"}`);

  const work = buildWorkList({ manifest: cfg.manifest, diffDir: cfg.diffDir });

  if (work.length === 0) {
    log("No diffs to process. Nothing to do.");
    return { status: "empty", processed: 0, failed: 0, skipped: 0, excelFile: cfg.excelFile };
  }

  // Fresh report per run: remove any Excel from a previous run so the output
  // reflects only the current run's diffs.
  try {
    if (fs.existsSync(cfg.excelFile)) fs.unlinkSync(cfg.excelFile);
  } catch (e) {
    log(`Warning: could not remove existing Excel (${e.message}). It will be appended to instead.`);
  }

  let processed = 0;
  let failed    = 0;
  let skipped   = 0;

  for (const item of work) {
    if (item.missingDiff) {
      skipped += 1;
      log(`SKIP  ${item.name} — diff image not found`);
      continue;
    }

    // Each item is independently guarded so one bad image can't abort the batch.
    try {
      const res = await analyzeDiffRegions({
        name:        item.name,
        mismatch:    item.mismatch,
        totalPixels: item.totalPixels,
        severity:    item.severity,
        BASELINE_DIR: cfg.baselineDir,
        ACTUAL_DIR:   cfg.actualDir,
        DIFF_DIR:     cfg.diffDir,
        EXCEL_FILE:   cfg.excelFile,
      });

      if (res.status === "success") {
        processed += 1;
        log(`OK    ${item.name} [${item.severity}] — ${res.regionsProcessed} region(s)`);
      } else if (res.status === "ai_config_error") {
        failed += 1;
        log(`FAIL  ${item.name} — AI config error: ${res.error}`);
      } else {
        skipped += 1;
        log(`SKIP  ${item.name} — ${res.status}`);
      }
    } catch (err) {
      failed += 1;
      log(`FAIL  ${item.name} — ${err && err.message ? err.message : err}`);
    }
  }

  log(`Done. ${processed} processed, ${failed} failed, ${skipped} skipped.`);
  if (processed > 0) log(`Report written to ${cfg.excelFile}`);

  return { status: "done", processed, failed, skipped, excelFile: cfg.excelFile };
}

async function main() {
  await runAnalysisReport();
}

module.exports = { runAnalysisReport, resolveConfig, buildWorkList, log };

if (require.main === module) {
  main()
    .then(() => {
      // Exit 0 even if some items failed: analysis problems must not break CI.
      process.exit(0);
    })
    .catch((err) => {
      // Truly unexpected failure — log and still exit 0 to keep pipeline green.
      log(`Unexpected error: ${err && err.stack ? err.stack : err}`);
      process.exit(0);
    });
}
