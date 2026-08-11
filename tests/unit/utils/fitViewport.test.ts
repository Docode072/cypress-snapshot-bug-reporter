/**
 * Unit tests for viewport fitting utilities
 */

import { computeFitViewportSize, type FitViewportOptions } from '../../../src/utils/fitViewport';

describe('computeFitViewportSize', () => {
  describe('with fitToPage disabled', () => {
    it('should return base dimensions when fitToPage is false', () => {
      const result = computeFitViewportSize({
        baseWidth: 1280,
        baseHeight: 800,
        pageWidth: 2400,
        pageHeight: 1600,
        fitToPage: false,
      });

      expect(result).toEqual({
        width: 1280,
        height: 800,
        fitted: false,
      });
    });

    it('should respect max dimensions even when fitToPage is false', () => {
      const result = computeFitViewportSize({
        baseWidth: 10000,
        baseHeight: 10000,
        maxWidth: 2000,
        maxHeight: 2000,
        fitToPage: false,
      });

      expect(result).toEqual({
        width: 2000,
        height: 2000,
        fitted: false,
      });
    });
  });

  describe('with fitToPage enabled (default)', () => {
    it('should return base dimensions when content fits', () => {
      const result = computeFitViewportSize({
        baseWidth: 1280,
        baseHeight: 800,
        pageWidth: 1280,
        pageHeight: 800,
      });

      expect(result).toEqual({
        width: 1280,
        height: 800,
        fitted: false,
      });
    });

    it('should expand viewport to fit larger content', () => {
      const result = computeFitViewportSize({
        baseWidth: 1280,
        baseHeight: 800,
        pageWidth: 2400,
        pageHeight: 1600,
      });

      expect(result).toEqual({
        width: 2400,
        height: 1600,
        fitted: true,
      });
    });
  });

  describe('default values and edge cases', () => {
    it('should use default base dimensions', () => {
      const result = computeFitViewportSize({});

      expect(result).toEqual({
        width: 1280, // Default base width
        height: 800, // Default base height
        fitted: false,
      });
    });

    it('should handle undefined page dimensions', () => {
      const result = computeFitViewportSize({
        baseWidth: 1280,
        baseHeight: 800,
        pageWidth: undefined,
        pageHeight: undefined,
      });

      expect(result).toEqual({
        width: 1280,
        height: 800,
        fitted: false,
      });
    });
  });
});