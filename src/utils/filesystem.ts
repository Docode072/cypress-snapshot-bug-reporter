/**
 * Filesystem utility functions
 */

import * as fs from "fs";
import * as path from "path";
import { execFileSync } from "child_process";

/**
 * Ensure directory exists, creating it recursively if needed
 *
 * @param filePath - Path to file (directory will be extracted)
 */
export function ensureDir(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Remove file if it exists (non-throwing)
 *
 * @param filePath - Path to file to remove
 */
export function removeIfExists(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

/**
 * Remove directory recursively if it exists (non-throwing)
 *
 * @param dir - Directory path to remove
 */
export function removeDir(dir: string): void {
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } catch (_e) {
    // Non-fatal: directory removal is best-effort
  }
}

/**
 * Empty directory contents but keep the directory itself
 *
 * @param dir - Directory to empty
 */
export function emptyDir(dir: string): void {
  try {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, entry), { recursive: true, force: true });
    }
  } catch (_e) {
    // Non-fatal
  }
}

/**
 * Check if two paths resolve to the same location (case-insensitive)
 *
 * @param left - First path
 * @param right - Second path
 * @returns True if paths are the same
 */
export function samePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

/**
 * Wait for a file to exist, polling at intervals
 *
 * @param filePath - File path to wait for
 * @param timeoutMs - Maximum time to wait in milliseconds
 * @returns Promise resolving to true if file appears, false if timeout
 */
export function waitForFile(
  filePath: string,
  timeoutMs = 5000,
): Promise<boolean> {
  return new Promise((resolve) => {
    const start = Date.now();

    const poll = (): void => {
      if (fs.existsSync(filePath)) {
        resolve(true);
        return;
      }
      if (Date.now() - start >= timeoutMs) {
        resolve(false);
        return;
      }
      setTimeout(poll, 50);
    };

    poll();
  });
}

/**
 * List all PNG files in a directory recursively
 *
 * @param dir - Directory to search
 * @param maxDepth - Maximum recursion depth
 * @returns Array of full paths to PNG files
 */
export function listPngFiles(dir: string, maxDepth = 5): string[] {
  const files: string[] = [];
  if (!fs.existsSync(dir)) return files;

  const walk = (currentDir: string, depth: number): void => {
    if (depth > maxDepth) return;
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          walk(fullPath, depth + 1);
          continue;
        }
        if (entry.isFile() && entry.name.toLowerCase().endsWith(".png")) {
          files.push(fullPath);
        }
      }
    } catch (_e) {
      // Non-fatal: continue walking
    }
  };

  walk(dir, 0);
  return files;
}

/**
 * Hide a directory on Windows (best-effort, non-fatal on failure)
 *
 * @param dir - Directory to hide
 */
export function hideDir(dir: string): void {
  if (process.platform !== "win32") return;
  try {
    execFileSync("attrib", ["+h", dir], { stdio: "ignore" });
  } catch (_e) {
    // Cosmetic operation - failures are non-fatal
  }
}

/**
 * Sleep for specified milliseconds
 *
 * @param ms - Milliseconds to sleep
 * @returns Promise that resolves after delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
