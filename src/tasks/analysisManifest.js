"use strict";

const fs = require("fs");
const { ensureDir } = require("./imageUtils");

const DEFAULT_BASELINE_DIR = "cypress/snapshots/baseline";
const DEFAULT_ACTUAL_DIR = "cypress/snapshots/actual";
const DEFAULT_DIFF_DIR = "cypress/snapshots/diff";
const DEFAULT_EXCEL_FILE = "cypress/snapshots/reports/diff-report.xlsx";
const DEFAULT_PENDING_FILE = "cypress/snapshots/reports/pending-analysis.json";

/**
 * Read and parse the analysis manifest JSON file.
 * Returns null if the file is absent or not valid JSON.
 */
function readManifest(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return null;
  }
}

/**
 * (Re)create an empty manifest at the start of a Cypress run.
 * Records the resolved output directories so the post-run script needs no
 * extra configuration.
 */
function initPendingManifest({
  PENDING_FILE = DEFAULT_PENDING_FILE,
  BASELINE_DIR = DEFAULT_BASELINE_DIR,
  ACTUAL_DIR = DEFAULT_ACTUAL_DIR,
  DIFF_DIR = DEFAULT_DIFF_DIR,
  EXCEL_FILE = DEFAULT_EXCEL_FILE,
} = {}) {
  ensureDir(PENDING_FILE);
  const manifest = {
    version: 2,
    createdAt: new Date().toISOString(),
    dirs: {
      baselineDir: BASELINE_DIR,
      actualDir: ACTUAL_DIR,
      diffDir: DIFF_DIR,
      excelFile: EXCEL_FILE,
    },
    items: [],
  };
  fs.writeFileSync(PENDING_FILE, JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Append (or replace) a pending analysis entry for a single diff.
 * Called once per snapshot comparison that produces a diff, during the test run.
 */
function recordPendingAnalysis({
  name,
  mismatch = 0,
  totalPixels = 0,
  severity = "Low",
  mismatchPercent,
  PENDING_FILE = DEFAULT_PENDING_FILE,
}) {
  const manifest = readManifest(PENDING_FILE) || {
    version: 2,
    createdAt: new Date().toISOString(),
    dirs: {},
    items: [],
  };
  if (!Array.isArray(manifest.items)) manifest.items = [];

  // Replace any existing entry for the same snapshot name.
  manifest.items = manifest.items.filter((i) => i.name !== name);
  manifest.items.push({
    name,
    mismatch,
    totalPixels,
    severity,
    mismatchPercent,
    recordedAt: new Date().toISOString(),
  });

  ensureDir(PENDING_FILE);
  fs.writeFileSync(PENDING_FILE, JSON.stringify(manifest, null, 2));
  return { status: "recorded", name, pending: manifest.items.length };
}

/**
 * Factory: returns manifest task functions pre-bound to the resolved paths.
 */
function makeManifestTasks(options = {}) {
  const PENDING_FILE = options.pendingFile || DEFAULT_PENDING_FILE;
  const BASELINE_DIR = options.baselineDir || DEFAULT_BASELINE_DIR;
  const ACTUAL_DIR = options.actualDir || DEFAULT_ACTUAL_DIR;
  const DIFF_DIR = options.diffDir || DEFAULT_DIFF_DIR;
  const EXCEL_FILE = options.excelFile || DEFAULT_EXCEL_FILE;

  return {
    initPendingManifest: () =>
      initPendingManifest({
        PENDING_FILE,
        BASELINE_DIR,
        ACTUAL_DIR,
        DIFF_DIR,
        EXCEL_FILE,
      }),
    recordPendingAnalysis: (params) =>
      recordPendingAnalysis({ ...params, PENDING_FILE }),
  };
}

module.exports = {
  readManifest,
  initPendingManifest,
  recordPendingAnalysis,
  makeManifestTasks,
  DEFAULT_BASELINE_DIR,
  DEFAULT_ACTUAL_DIR,
  DEFAULT_DIFF_DIR,
  DEFAULT_EXCEL_FILE,
  DEFAULT_PENDING_FILE,
};
