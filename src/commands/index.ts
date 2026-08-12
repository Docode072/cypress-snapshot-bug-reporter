/**
 * Cypress command registration for `cy.matchImageSnapshot()`.
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
 * Register the `cy.matchImageSnapshot()` custom command with Cypress.
 * Also registers `cy.matchSnapshot()` as an alias for backward compatibility.
 *
 * The command supports two call styles:
 *
 * **Page / full-document screenshot**
 * ```ts
 * cy.matchImageSnapshot('page-name');
 * cy.matchImageSnapshot('page-name', { capture: 'fullPage', threshold: 0.05 });
 * ```
 *
 * **Element screenshot (chained on a subject)**
 * ```ts
 * cy.get('[data-testid="hero"]').matchImageSnapshot('hero-section');
 * cy.get('.modal').matchImageSnapshot('modal', { failOnDiff: true });
 * ```
 *
 * This function is idempotent — calling it more than once will overwrite the
 * previous registration, which is the expected Cypress behaviour.
 */
export function registerCommands(): void {
  const commandHandler = (
    subject: unknown,
    name: string,
    options: MatchSnapshotOptions = {},
  ) => {
    matchSnapshotImpl(subject, name, options);
  };

  // Primary command name
  // @ts-ignore - Cypress.Commands.add overload signatures are complex
  (Cypress.Commands as any).add(
    "matchImageSnapshot",
    { prevSubject: "optional" },
    commandHandler,
  );

  // Backward-compatible alias
  // @ts-ignore - Cypress.Commands.add overload signatures are complex
  (Cypress.Commands as any).add(
    "matchSnapshot",
    { prevSubject: "optional" },
    commandHandler,
  );
}

// ─── Auto-register ────────────────────────────────────────────────────────────

// Register the commands immediately when this module is imported.
// This mirrors the behaviour of the original `commands.js` and means users
// just need to import the file — they do not have to call `registerCommands()`
// themselves.
registerCommands();
