/**
 * Compute the viewport size used before a snapshot capture.
 * Pure helper — safe to unit-test outside Cypress.
 */

export interface FitViewportOptions {
  /**
   * Base viewport width
   */
  baseWidth?: number;

  /**
   * Base viewport height
   */
  baseHeight?: number;

  /**
   * Actual page content width
   */
  pageWidth?: number;

  /**
   * Actual page content height
   */
  pageHeight?: number;

  /**
   * Maximum allowed width
   * @default 8192
   */
  maxWidth?: number;

  /**
   * Maximum allowed height
   * @default 8192
   */
  maxHeight?: number;

  /**
   * Whether to fit viewport to page dimensions
   * @default true
   */
  fitToPage?: boolean;
}

export interface FitViewportResult {
  /**
   * Computed viewport width
   */
  width: number;

  /**
   * Computed viewport height
   */
  height: number;

  /**
   * Whether the viewport was adjusted to fit the page
   */
  fitted: boolean;
}

/**
 * Compute viewport size for snapshot capture, optionally fitting to page dimensions
 *
 * @param options - Viewport computation options
 * @returns Computed viewport dimensions
 */
export function computeFitViewportSize(
  options: FitViewportOptions = {},
): FitViewportResult {
  const {
    baseWidth,
    baseHeight,
    pageWidth,
    pageHeight,
    maxWidth = 8192,
    maxHeight = 8192,
    fitToPage = true,
  } = options;

  const baseW = Number(baseWidth) || 1280;
  const baseH = Number(baseHeight) || 800;
  const maxW = Number(maxWidth) || 8192;
  const maxH = Number(maxHeight) || 8192;

  if (!fitToPage) {
    return {
      width: Math.min(baseW, maxW),
      height: Math.min(baseH, maxH),
      fitted: false,
    };
  }

  const width = Math.min(Math.max(baseW, Number(pageWidth) || 0), maxW);
  // Height stays near the configured viewport; fullPage scrolls for tall pages.
  const height = Math.min(Math.max(baseH, Number(pageHeight) || 0), maxH);

  return {
    width,
    height,
    fitted: width > baseW || height > baseH,
  };
}
