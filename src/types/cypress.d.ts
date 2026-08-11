/**
 * Type declarations for Cypress custom commands
 * This file augments the Cypress namespace to add type support for custom commands
 */

/// <reference types="cypress" />

declare namespace Cypress {
  interface SnapshotOptions {
    /**
     * Percentage threshold for pixel mismatch (0-1)
     * @default 0.0
     */
    threshold?: number;

    /**
     * Analysis mode for this specific snapshot
     * - "after": Run AI analysis after tests complete
     * - "deferred": Run analysis manually via CLI
     */
    ocrMode?: "after" | "deferred";

    /**
     * Custom baseline directory override for this snapshot
     */
    baselineDir?: string;

    /**
     * Custom actual directory override for this snapshot
     */
    actualDir?: string;

    /**
     * Custom diff directory override for this snapshot
     */
    diffDir?: string;

    /**
     * Base viewport dimensions to fit the screenshot into
     * If the element is larger, it will be scaled down to fit
     */
    baseViewport?: {
      width: number;
      height: number;
    };

    /**
     * Whether to capture the entire page (scrolling) or just the viewport
     * @default false
     */
    capture?: "viewport" | "fullPage" | "runner";

    /**
     * Padding around the element when capturing
     * @default 0
     */
    padding?: number;

    /**
     * Delay in milliseconds before capturing the screenshot
     * @default 0
     */
    delay?: number;

    /**
     * Timeout for screenshot capture in milliseconds
     * @default 30000
     */
    timeout?: number;

    /**
     * Whether to fail the test if the snapshot differs
     * @default true
     */
    failOnSnapshotDiff?: boolean;

    /**
     * Whether to overwrite/update the baseline snapshot
     * @default false
     */
    overwrite?: boolean;
  }

  interface Chainable<Subject = any> {
    /**
     * Compare a visual snapshot of the current element or page
     *
     * @param snapshotName - Unique name for the snapshot (without .png extension)
     * @param options - Optional configuration for the snapshot comparison
     *
     * @example
     * cy.get('[data-testid="dashboard"]').matchImageSnapshot('dashboard-view');
     *
     * @example
     * cy.matchImageSnapshot('full-page', {
     *   capture: 'fullPage',
     *   threshold: 0.01
     * });
     *
     * @example
     * cy.get('.modal').matchImageSnapshot('modal', {
     *   baseViewport: { width: 1280, height: 720 },
     *   padding: 10
     * });
     */
    matchImageSnapshot(
      snapshotName: string,
      options?: SnapshotOptions,
    ): Chainable<Subject>;

    /**
     * Internal command used by the plugin
     * @private
     */
    snapshotTask(
      taskName: string,
      args: Record<string, unknown>,
    ): Chainable<unknown>;
  }

  interface ResolvedConfigOptions {
    snapshotOcrMode?: "after" | "deferred";
    baselineDir?: string;
    actualDir?: string;
    diffDir?: string;
    excelFile?: string;
  }
}

export {};
