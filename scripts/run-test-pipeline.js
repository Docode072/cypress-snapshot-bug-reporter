#!/usr/bin/env node
"use strict";

/**
 * End-to-end test runner for the AI diff-analysis pipeline.
 *
 * Uses the test images already in test/basline and test/actual,
 * generates the 3-panel composite diff with pixelmatch,
 * then runs the full AI analysis pipeline and writes diff-report.xlsx.
 *
 * Usage:
 *   node scripts/run-test-pipeline.js
 *
 * Env vars (can also be set here directly for quick testing):
 *   AI_PROVIDER, AI_ENDPOINT, AI_MODEL, AI_API_KEY
 */

// ---------------------------------------------------------------------------
// Inline AI credentials for quick test — set via env or override here
// ---------------------------------------------------------------------------
process.env.AI_PROVIDER = process.env.AI_PROVIDER || "google";

// For Google Gemini the model name is embedded in the endpoint URL.
// AI_MODEL is kept in sync so logs show the right name.
const GEMINI_MODEL = process.env.AI_MODEL || "gemini-3.5-flash-lite";
process.env.AI_MODEL    = GEMINI_MODEL;
process.env.AI_ENDPOINT = process.env.AI_ENDPOINT ||
  `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
process.env.AI_API_KEY  = process.env.AI_API_KEY  || "";
process.env.AI_TIMEOUT_MS    = "120000"; // 2 min
process.env.AI_REGION_DELAY_MS = "3000"; // 3s between regions — gentler on free-tier quota

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const fs   = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

const ROOT         = path.join(__dirname, "..");
const BASELINE_DIR = path.join(ROOT, "test", "basline");   // existing dir (typo in name preserved)
const ACTUAL_DIR   = path.join(ROOT, "test", "actual");
const DIFF_DIR     = path.join(ROOT, "test", "diff");
const EXCEL_FILE   = path.join(ROOT, "test", "report", "diff-report.xlsx");

// The snapshot name mirrors the sub-path under each image dir.
const SNAPSHOT_NAME = "actual1.cy.js/image";

// ---------------------------------------------------------------------------
// Import pipeline modules
// ---------------------------------------------------------------------------
const { analyzeDiffRegions } = require(path.join(ROOT, "src", "tasks", "aiAnalysisTasks"));

// ---------------------------------------------------------------------------
// Pixelmatch + composite helpers (same logic as snapshotTasks.js)
// ---------------------------------------------------------------------------
let pixelmatch;
try {
  const pm = require("pixelmatch");
  pixelmatch = pm.default || pm;
} catch (e) {
  console.error("pixelmatch not found — run: npm install");
  process.exit(1);
}

const COMPOSITE_SEP = 8;

const PIXELMATCH_OPTIONS = {
  threshold:    0.1,
  includeAA:    false,
  alpha:        0.35,
  diffColor:    [220, 38, 38],  // red
  diffColorAlt: [234, 179, 8],  // yellow
};

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function copyPanel(src, dst, offsetX) {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const si = (y * src.width  + x) * 4;
      const di = (y * dst.width  + (x + offsetX)) * 4;
      dst.data[di]     = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
}

function drawSeparator(dst, offsetX, sepWidth) {
  for (let y = 0; y < dst.height; y++) {
    for (let x = 0; x < sepWidth; x++) {
      const di = (y * dst.width + (offsetX + x)) * 4;
      dst.data[di] = dst.data[di + 1] = dst.data[di + 2] = 45;
      dst.data[di + 3] = 255;
    }
  }
}

function createCompositeDiff(baseline, actual, diff) {
  const SEP    = COMPOSITE_SEP;
  const W      = baseline.width;
  const H      = baseline.height;
  const totalW = W * 3 + SEP * 2;

  const composite = new PNG({ width: totalW, height: H });
  composite.data.fill(0);
  for (let i = 3; i < composite.data.length; i += 4) composite.data[i] = 255;

  copyPanel(baseline,  composite, 0);
  drawSeparator(composite, W,          SEP);
  copyPanel(diff,      composite, W + SEP);
  drawSeparator(composite, W * 2 + SEP, SEP);
  copyPanel(actual,    composite, W * 2 + SEP * 2);

  return PNG.sync.write(composite);
}

function cropToSameSize(img1, img2) {
  const w = Math.min(img1.width,  img2.width);
  const h = Math.min(img1.height, img2.height);
  if (img1.width === w && img1.height === h &&
      img2.width === w && img2.height === h) return { img1, img2 };

  const crop = (src) => {
    const dst = new PNG({ width: w, height: h });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const si = (y * src.width + x) * 4;
        const di = (y * w          + x) * 4;
        dst.data[di]     = src.data[si];
        dst.data[di + 1] = src.data[si + 1];
        dst.data[di + 2] = src.data[si + 2];
        dst.data[di + 3] = src.data[si + 3];
      }
    }
    return dst;
  };
  return { img1: crop(img1), img2: crop(img2) };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("\n========================================");
  console.log(" AI Diff-Analysis Pipeline — Test Run  ");
  console.log("========================================\n");

  // 1. Resolve image paths
  const safeName    = SNAPSHOT_NAME.replace(/\//g, path.sep);
  const baselinePath = path.join(BASELINE_DIR, `${safeName}.png`);
  const actualPath   = path.join(ACTUAL_DIR,   `${safeName}.png`);
  const diffPath     = path.join(DIFF_DIR,      `${safeName}.png`);

  console.log(`Baseline : ${baselinePath}`);
  console.log(`Actual   : ${actualPath}`);
  console.log(`Diff out : ${diffPath}`);
  console.log(`Excel out: ${EXCEL_FILE}\n`);

  if (!fs.existsSync(baselinePath)) {
    console.error(`ERROR: Baseline image not found: ${baselinePath}`);
    process.exit(1);
  }
  if (!fs.existsSync(actualPath)) {
    console.error(`ERROR: Actual image not found: ${actualPath}`);
    process.exit(1);
  }

  // 2. Read images
  console.log("Step 1/3 — Reading images...");
  const baselineImg = PNG.sync.read(fs.readFileSync(baselinePath));
  const actualImg   = PNG.sync.read(fs.readFileSync(actualPath));

  console.log(`  Baseline size: ${baselineImg.width}x${baselineImg.height}`);
  console.log(`  Actual size  : ${actualImg.width}x${actualImg.height}`);

  // 3. Align sizes and run pixelmatch
  console.log("\nStep 2/3 — Running pixelmatch to generate diff...");
  const { img1, img2 } = cropToSameSize(baselineImg, actualImg);
  const diff           = new PNG({ width: img1.width, height: img1.height });
  const totalPixels    = img1.width * img1.height;

  const mismatch = pixelmatch(img1.data, img2.data, diff.data, img1.width, img1.height, PIXELMATCH_OPTIONS);
  const pct      = ((mismatch / totalPixels) * 100).toFixed(4);
  const severity = pct > 2 ? "Critical" : pct > 0.5 ? "High" : pct > 0.05 ? "Medium" : "Low";

  console.log(`  Mismatched pixels: ${mismatch} / ${totalPixels} (${pct}%) → Severity: ${severity}`);

  if (mismatch === 0) {
    console.log("\n  Images are identical — no diff to analyse. Done.");
    return;
  }

  // 4. Write composite diff PNG
  ensureDir(path.dirname(diffPath));
  const compositeBuf = createCompositeDiff(img1, img2, diff);
  fs.writeFileSync(diffPath, compositeBuf);
  console.log(`  Composite diff saved to: ${diffPath}`);

  // 5. Run AI analysis
  console.log(`\nStep 3/3 — Sending to AI (${process.env.AI_PROVIDER} / ${process.env.AI_MODEL})...`);
  console.log("  (This may take up to 60–120 seconds for Gemini with large images)\n");

  ensureDir(path.dirname(EXCEL_FILE));

  const result = await analyzeDiffRegions({
    name:        SNAPSHOT_NAME,
    mismatch,
    totalPixels,
    severity,
    BASELINE_DIR,
    ACTUAL_DIR,
    DIFF_DIR,
    EXCEL_FILE,
  });

  // 6. Report
  console.log("\n========================================");
  if (result.status === "success") {
    console.log(` ✅  Analysis complete!`);
    console.log(`     Regions analysed : ${result.regionsProcessed}`);
    console.log(`     Excel report     : ${result.excelPath}`);
    if (result.results && result.results.length > 0) {
      console.log("\n  Region summaries:");
      result.results.forEach((r, i) => {
        const loc = r.locationHierarchy || {};
        const path_str = [loc.tableName, loc.section,
          loc.row    ? `Row ${loc.row.index}${loc.row.label ? ` (${loc.row.label})` : ""}` : null,
          loc.column ? `Col ${loc.column.index}${loc.column.header ? ` (${loc.column.header})` : ""}` : null,
        ].filter(Boolean).join(" > ");
        console.log(`  [${i + 1}] ${r.contentType} | ${r.changeType} | ${path_str || r.changeSummary}`);
        console.log(`       Baseline: ${r.baselineValue}  →  Actual: ${r.actualValue}  (confidence: ${(r.confidence * 100).toFixed(0)}%)`);
      });
    }
  } else if (result.status === "ai_config_error") {
    console.log(` ❌  AI config error: ${result.error}`);
  } else {
    console.log(` ⚠️  Status: ${result.status}`);
  }
  console.log("========================================\n");
}

main().catch((err) => {
  console.error("\nFATAL:", err && err.stack ? err.stack : err);
  process.exit(1);
});
