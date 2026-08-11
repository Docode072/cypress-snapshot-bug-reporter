/**
 * Type definitions for snapshot comparison and image processing
 */

/**
 * Result of a snapshot comparison
 */
export interface ComparisonResult {
  /**
   * Unique identifier for the snapshot
   */
  name: string;

  /**
   * Path to the baseline image
   */
  baselinePath: string;

  /**
   * Path to the actual (current) image
   */
  actualPath: string;

  /**
   * Path to the diff image (if differences found)
   */
  diffPath?: string;

  /**
   * Whether the images match within the threshold
   */
  pass: boolean;

  /**
   * Number of pixels that differ
   */
  diffPixels: number;

  /**
   * Total pixels in the image
   */
  totalPixels: number;

  /**
   * Percentage of pixels that differ (0-1)
   */
  mismatchPercentage: number;

  /**
   * Severity classification based on mismatch percentage
   */
  severity: "Low" | "Medium" | "High" | "Critical";

  /**
   * Whether this is a new snapshot (no baseline exists)
   */
  isNewSnapshot?: boolean;

  /**
   * Dimensions of the compared images
   */
  dimensions: {
    width: number;
    height: number;
  };
}

/**
 * Rectangular region coordinates
 */
export interface ImageRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Parsed PNG image data
 */
export interface ParsedImage {
  width: number;
  height: number;
  data: Buffer;
}

/**
 * Viewport dimensions
 */
export interface ViewportDimensions {
  width: number;
  height: number;
}

/**
 * Computed fit viewport result
 */
export interface FitViewportResult {
  width: number;
  height: number;
  shouldResize: boolean;
  scale?: number;
}

/**
 * Snapshot path configuration
 */
export interface SnapshotPathConfig {
  baselineDir: string;
  actualDir: string;
  diffDir: string;
  specRoot: string;
  snapshotName: string;
}

/**
 * Options for matchImageSnapshot command
 */
export interface SnapshotOptions {
  threshold?: number;
  ocrMode?: "after" | "deferred";
  baselineDir?: string;
  actualDir?: string;
  diffDir?: string;
  baseViewport?: ViewportDimensions;
  capture?: "viewport" | "fullPage" | "runner";
  padding?: number;
  delay?: number;
  timeout?: number;
  failOnSnapshotDiff?: boolean;
  overwrite?: boolean;
}
