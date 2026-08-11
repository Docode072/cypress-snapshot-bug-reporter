"use strict";

const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const { COMPOSITE_SEP } = require("./constants");

const MIN_REGION_AREA = 100;

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Resolve the path of a PNG file under `dir` whose filename ends with
 * `<safeName>.png`.  Returns the most-recently-modified match, or null.
 */
function resolveScreenshotPath(dir, safeName) {
  const directPath = path.join(dir, `${safeName}.png`);
  if (fs.existsSync(directPath)) return directPath;
  if (!fs.existsSync(dir)) return null;

  const tail = `${path.sep}${safeName}.png`.toLowerCase();
  let bestMatch = null;
  let bestMtime = -1;

  const walk = (currentDir) => {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!fullPath.toLowerCase().endsWith(tail)) continue;

      const { mtimeMs } = fs.statSync(fullPath);
      if (mtimeMs > bestMtime) {
        bestMtime = mtimeMs;
        bestMatch = fullPath;
      }
    }
  };

  walk(dir);
  return bestMatch;
}

/**
 * Scan the composite diff PNG for red pixels (R>200, G<80, B<80) and return
 * an array of bounding rectangles in composite-image coordinates.
 *
 * The composite layout is: [ Baseline | sep | Diff | sep | Actual ].
 * Red pixels live in the middle (diff) panel; they mark changed regions.
 * Adjacent rows within `gapTolerance` pixels are merged into one group.
 * Each resulting rectangle is expanded by `padding` pixels.
 */
function extractDiffRegions(diffBuffer, gapTolerance = 5, padding = 10) {
  const img = PNG.sync.read(diffBuffer);
  const { width, height, data } = img;

  const rowBounds = new Array(height).fill(null);
  for (let y = 0; y < height; y++) {
    let minX = Infinity,
      maxX = -Infinity;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] > 200 && data[i + 1] < 80 && data[i + 2] < 80) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (minX !== Infinity) rowBounds[y] = { minX, maxX };
  }

  const groups = [];
  let group = null;
  for (let y = 0; y <= height; y++) {
    if (y < height && rowBounds[y]) {
      if (!group) {
        group = {
          y1: y,
          y2: y,
          minX: rowBounds[y].minX,
          maxX: rowBounds[y].maxX,
        };
      } else {
        group.y2 = y;
        if (rowBounds[y].minX < group.minX) group.minX = rowBounds[y].minX;
        if (rowBounds[y].maxX > group.maxX) group.maxX = rowBounds[y].maxX;
      }
    } else if (group) {
      let bridged = false;
      for (let gap = 1; gap <= gapTolerance && y + gap < height; gap++) {
        if (rowBounds[y + gap]) {
          bridged = true;
          break;
        }
      }
      if (!bridged) {
        groups.push(group);
        group = null;
      }
    }
  }

  return groups.map((g) => {
    const x = Math.max(0, g.minX - padding);
    const y = Math.max(0, g.y1 - padding);
    return {
      x,
      y,
      width: Math.min(width - x, g.maxX - g.minX + padding * 2),
      height: Math.min(height - y, g.y2 - g.y1 + padding * 2),
    };
  });
}

/**
 * Convert regions found in composite-image coordinates (where the diff panel
 * is the middle of three panels) to coordinates that apply directly to the
 * single-panel baseline.png / actual.png files.
 *
 * Composite layout: [ Baseline(W) | sep(COMPOSITE_SEP) | Diff(W) | sep | Actual(W) ]
 * The red-pixel scan hits the diff panel; subtracting (W + sep) maps back to
 * single-panel x.
 */
function toSingleImageCoords(compositeRegions, panelWidth) {
  const panelOffset = panelWidth + COMPOSITE_SEP;
  return compositeRegions
    .map((r) => {
      const adjX = Math.max(0, r.x - panelOffset);
      const adjWidth = Math.min(panelWidth - adjX, r.width);
      return { x: adjX, y: r.y, width: adjWidth, height: r.height };
    })
    .filter((r) => r.width > 0 && r.height > 0);
}

/**
 * Crop a rectangular region from an already-parsed PNG object and return the
 * result as a raw PNG Buffer.
 */
function cropRegionFromParsed(src, { x, y, width, height }) {
  const dst = new PNG({ width, height });
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const si = ((y + row) * src.width + (x + col)) * 4;
      const di = (row * width + col) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
  return PNG.sync.write(dst);
}

/**
 * Crop the middle (pixel-diff) panel of the 3-panel composite diff image at
 * the given single-image region coordinates, and return it as a PNG Buffer.
 *
 * The diff panel starts at x = panelWidth + COMPOSITE_SEP in the composite.
 * The red/yellow pixelmatch highlights in this crop tell the AI model exactly
 * which pixels changed, improving annotation precision.
 */
function cropDiffPanelRegion(diffBuffer, region, panelWidth) {
  const composite = PNG.sync.read(diffBuffer);
  const panelOffset = panelWidth + COMPOSITE_SEP;
  const compositeRegion = {
    x: region.x + panelOffset,
    y: region.y,
    width: region.width,
    height: region.height,
  };
  return cropRegionFromParsed(composite, compositeRegion);
}

module.exports = {
  MIN_REGION_AREA,
  ensureDir,
  resolveScreenshotPath,
  extractDiffRegions,
  toSingleImageCoords,
  cropRegionFromParsed,
  cropDiffPanelRegion,
};
