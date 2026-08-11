/**
 * Image processing utilities for diff region extraction and cropping
 */

import * as fs from "fs";
import * as path from "path";
import { PNG } from "pngjs";
import type { ImageRegion } from "../types/snapshot";
import { COMPOSITE_SEP, MIN_REGION_AREA } from "./constants";
import { ensureDir } from "./filesystem";

export interface ParsedPNG {
  width: number;
  height: number;
  data: Buffer;
  [key: string]: any; // Allow other PNG properties with any type
}

/**
 * Resolve the path of a PNG file under `dir` whose filename ends with
 * `<safeName>.png`. Returns the most-recently-modified match, or null.
 *
 * @param dir - Directory to search
 * @param safeName - Sanitized snapshot name
 * @returns Full path to the PNG file, or null if not found
 */
export function resolveScreenshotPath(
  dir: string,
  safeName: string,
): string | null {
  const directPath = path.join(dir, `${safeName}.png`);
  if (fs.existsSync(directPath)) return directPath;
  if (!fs.existsSync(dir)) return null;

  const tail = `${path.sep}${safeName}.png`.toLowerCase();
  let bestMatch: string | null = null;
  let bestMtime = -1;

  const walk = (currentDir: string): void => {
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

interface RowBounds {
  minX: number;
  maxX: number;
}

interface RegionGroup {
  y1: number;
  y2: number;
  minX: number;
  maxX: number;
}

/**
 * Scan the composite diff PNG for red pixels (R>200, G<80, B<80) and return
 * an array of bounding rectangles in composite-image coordinates.
 *
 * The composite layout is: [ Baseline | sep | Diff | sep | Actual ].
 * Red pixels live in the middle (diff) panel; they mark changed regions.
 * Adjacent rows within `gapTolerance` pixels are merged into one group.
 * Each resulting rectangle is expanded by `padding` pixels.
 *
 * @param diffBuffer - Buffer containing the composite diff PNG
 * @param gapTolerance - Maximum gap between rows to merge
 * @param padding - Padding to add around each region
 * @returns Array of diff regions in composite coordinates
 */
export function extractDiffRegions(
  diffBuffer: Buffer,
  gapTolerance = 5,
  padding = 10,
): ImageRegion[] {
  const img = PNG.sync.read(diffBuffer);
  const { width, height, data } = img;

  const rowBounds: (RowBounds | null)[] = new Array(height).fill(null);
  for (let y = 0; y < height; y++) {
    let minX = Infinity;
    let maxX = -Infinity;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      if (
        r !== undefined &&
        g !== undefined &&
        b !== undefined &&
        r > 200 &&
        g < 80 &&
        b < 80
      ) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
    if (minX !== Infinity) {
      rowBounds[y] = { minX, maxX };
    }
  }

  const groups: RegionGroup[] = [];
  let group: RegionGroup | null = null;
  for (let y = 0; y <= height; y++) {
    const currentBounds = y < height ? rowBounds[y] : null;
    if (currentBounds) {
      if (!group) {
        group = {
          y1: y,
          y2: y,
          minX: currentBounds.minX,
          maxX: currentBounds.maxX,
        };
      } else {
        group.y2 = y;
        if (currentBounds.minX < group.minX) group.minX = currentBounds.minX;
        if (currentBounds.maxX > group.maxX) group.maxX = currentBounds.maxX;
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
 *
 * @param compositeRegions - Regions in composite image coordinates
 * @param panelWidth - Width of a single panel
 * @returns Regions in single-image coordinates
 */
export function toSingleImageCoords(
  compositeRegions: ImageRegion[],
  panelWidth: number,
): ImageRegion[] {
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
 *
 * @param src - Parsed PNG source image
 * @param region - Region to crop
 * @returns Buffer containing cropped PNG
 */
export function cropRegionFromParsed(
  src: ParsedPNG,
  region: ImageRegion,
): Buffer {
  const { x, y, width, height } = region;
  const dst = new PNG({ width, height });
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const si = ((y + row) * src.width + (x + col)) * 4;
      const di = (row * width + col) * 4;
      const srcData = src.data;
      const dstData = dst.data;
      dstData[di] = srcData[si] ?? 0;
      dstData[di + 1] = srcData[si + 1] ?? 0;
      dstData[di + 2] = srcData[si + 2] ?? 0;
      dstData[di + 3] = srcData[si + 3] ?? 0;
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
 *
 * @param diffBuffer - Buffer containing composite diff image
 * @param region - Region in single-image coordinates
 * @param panelWidth - Width of single panel
 * @returns Buffer containing cropped diff panel region
 */
export function cropDiffPanelRegion(
  diffBuffer: Buffer,
  region: ImageRegion,
  panelWidth: number,
): Buffer {
  const composite = PNG.sync.read(diffBuffer);
  const panelOffset = panelWidth + COMPOSITE_SEP;
  const compositeRegion: ImageRegion = {
    x: region.x + panelOffset,
    y: region.y,
    width: region.width,
    height: region.height,
  };
  return cropRegionFromParsed(composite, compositeRegion);
}

export { MIN_REGION_AREA, ensureDir };
