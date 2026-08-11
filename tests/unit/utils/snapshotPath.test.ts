/**
 * Unit tests for snapshot path utilities
 */

import {
  sanitizeSnapshotName,
  normalizeSpecRoot,
  buildSnapshotKey,
  WINDOWS_INVALID_CHARS,
} from '../../../src/utils/snapshotPath';

describe('snapshotPath utilities', () => {
  describe('sanitizeSnapshotName', () => {
    it('should trim whitespace', () => {
      expect(sanitizeSnapshotName(' Home/Header ')).toBe('Home/Header');
    });

    it('should normalize backslashes to forward slashes', () => {
      expect(sanitizeSnapshotName('A\\B')).toBe('A/B');
    });

    it('should replace Windows invalid characters with underscores', () => {
      expect(sanitizeSnapshotName('bad<>:"|?*name')).toBe('bad_______name');
    });

    it('should handle null and undefined', () => {
      expect(sanitizeSnapshotName(null)).toBe('');
      expect(sanitizeSnapshotName(undefined)).toBe('');
    });
  });

  describe('normalizeSpecRoot', () => {
    it('should extract basename and remove extension', () => {
      expect(normalizeSpecRoot('cypress/e2e/login.cy.js')).toBe('login.cy');
      expect(normalizeSpecRoot('cypress\\e2e\\login.cy.ts')).toBe('login.cy');
      expect(normalizeSpecRoot('./cypress/e2e/a.cy.jsx')).toBe('a.cy');
      expect(normalizeSpecRoot('login.cy.js')).toBe('login.cy');
    });

    it('should handle edge cases', () => {
      expect(normalizeSpecRoot('')).toBe('unknown');
      expect(normalizeSpecRoot(null)).toBe('unknown');
      expect(normalizeSpecRoot(undefined)).toBe('unknown');
    });
  });

  describe('buildSnapshotKey', () => {
    it('should combine spec root and snapshot name', () => {
      expect(buildSnapshotKey('cypress/e2e/login.cy.js', 'Home/Header')).toBe(
        'login.cy/Home/Header'
      );
    });

    it('should throw error for empty snapshot name', () => {
      expect(() => buildSnapshotKey('test.cy.js', '')).toThrow(
        'matchSnapshot requires a name'
      );
    });
  });
});