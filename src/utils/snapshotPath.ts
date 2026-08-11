/**
 * Shared snapshot path helpers (Node + Cypress command layer).
 *
 * Storage layout:
 *   <baseline|actual|diff>/<specName>/<userPath>.png
 * e.g.
 *   cypress/snapshots/baseline/login.cy/Home/Header.png
 */

import * as path from "path";

export const WINDOWS_INVALID_CHARS = /[<>:"|?*]/g;

/**
 * Sanitize a snapshot name for use in file paths
 * Removes leading/trailing whitespace, normalizes slashes, and replaces invalid characters
 *
 * @param name - The snapshot name to sanitize
 * @returns Sanitized snapshot name safe for file paths
 */
export function sanitizeSnapshotName(name: string | undefined | null): string {
  return String(name || "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/$/, "")
    .replace(WINDOWS_INVALID_CHARS, "_");
}

/**
 * Normalize spec file path to a folder name
 * Extracts just the file name (no path) and removes extension
 *
 * Examples:
 *   "cypress/e2e/login.cy.js" → "login.cy"
 *   "login.cy.ts" → "login.cy"
 *
 * @param relative - Relative spec file path
 * @returns Normalized spec folder name
 */
export function normalizeSpecRoot(relative: string | undefined | null): string {
  const normalized = String(relative || "unknown")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");

  const base = path.posix.basename(normalized) || "unknown";

  return base
    .replace(/\.(js|ts|jsx|tsx|mjs|cjs|coffee)$/i, "")
    .replace(WINDOWS_INVALID_CHARS, "_");
}

/**
 * Build full snapshot key used for baseline/actual/diff paths
 * Format: <specName>/<userPath>
 *
 * @param specRelative - Relative path to the spec file
 * @param name - User-provided snapshot name
 * @returns Full snapshot key path
 * @throws Error if name is empty after sanitization
 */
export function buildSnapshotKey(specRelative: string, name: string): string {
  const specRoot = normalizeSpecRoot(specRelative);
  const safeName = sanitizeSnapshotName(name);
  if (!safeName) {
    throw new Error("matchSnapshot requires a name");
  }
  return `${specRoot}/${safeName}`;
}
