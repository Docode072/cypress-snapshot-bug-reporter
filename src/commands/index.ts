/**
 * Cypress command registration for `cy.matchSnapshot()`.
 *
 * Import this file (or the support barrel) in your Cypress support file:
 *
 * ```ts
 * // cypress/support/e2e.ts
 * import 'cypress-snapshot-bug-reporter/commands';
 * ```
 *
 * or, if you prefer the support barrel:
 *
 * ```ts
 * import 'cypress-snapshot-bug-reporter/support';
 * ```
 *
 * @module commands
 */

import {
  matchSnapshotImpl,
  type MatchSnapshotOptions,
} from "./matchImageSnapshot";

// ─── Public re-exports ────────────────────────────────────────────────────────

export { matchSnapshotImpl };
export type { MatchSnapshotOptions };

// ─── Command registration ─────────────────────────────────────────────────────

/**
 * Register the `cy.matchSnapshot()` custom command with Cypress.
 *
 * The command supports two call styles:
 *
 * **Page / full-document screenshot**
 * ```ts
 * cy.matchSnapshot('page-name');
 * cy.matchSnapshot('page-name', { capture: 'fullPage', threshold: 0.05 });
 * ```
 *
 * **Element screenshot (chained on a subject)**
 * ```ts
 * cy.get('[data-testid="hero"]').matchSnapshot('hero-section');
 * cy.get('.modal').matchSnapshot('modal', { failOnDiff: true });
 * ```
 *
 * This function is idempotent — calling it more than once will overwrite the
 * previous registration, which is the expected Cypress behaviour.
 */
export function registerCommands(): void {
  // Cypress.Commands.add with prevSubject:'optional' receives the subject as
  // the first argument when chained, or undefined when called top-level.
  // We use `unknown` to stay compatible with strict Cypress typings, then cast
  // inside matchSnapshotImpl.
  // @ts-ignore - Cypress.Commands.add overload signatures are complex
  (Cypress.Commands as any).add(
    "matchSnapshot",
    { prevSubject: "optional" },
    (subject: unknown, name: string, options: MatchSnapshotOptions = {}) => {
      matchSnapshotImpl(subject, name, options);
    },
  );
}

// ─── Auto-register ────────────────────────────────────────────────────────────

// Register the command immediately when this module is imported.
// This mirrors the behaviour of the original `commands.js` and means users
// just need to import the file — they do not have to call `registerCommands()`
// themselves.
registerCommands();
