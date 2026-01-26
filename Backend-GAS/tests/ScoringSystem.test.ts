
import { describe, it, expect } from 'vitest';
import ScoringSystem from '../ScoringSystem';

describe('ScoringSystem Module', () => {
  describe('calculateWarRate', () => {
    it('should return 100 for new players (0 eligible days)', () => {
      expect(ScoringSystem.calculateWarRate(0, 0)).toBe(100);
    });

    it('should calculate correct rate', () => {
      expect(ScoringSystem.calculateWarRate(2, 4)).toBe(50);
      expect(ScoringSystem.calculateWarRate(4, 4)).toBe(100);
    });

    it('should cap rate at 100', () => {
      expect(ScoringSystem.calculateWarRate(10, 4)).toBe(100);
    });
  });

  describe('computeScores', () => {
    it('should calculate raw and perf scores correctly', () => {
      const now = Date.now();
      const lastSeen = now - (2 * 24 * 60 * 60 * 1000); // 2 days ago

      const result = ScoringSystem.computeScores(100, 50, 10, 5000, 80, lastSeen, now);

      expect(result.raw).toBeGreaterThan(0);
      expect(result.perf).toBe(result.raw); // No decay within grace period
    });

    it('should apply decay after grace period', () => {
      const now = Date.now();
      const lastSeen = now - (10 * 24 * 60 * 60 * 1000); // 10 days ago (Grace is 4 days)

      const result = ScoringSystem.computeScores(100, 50, 10, 5000, 80, lastSeen, now);

      expect(result.perf).toBeLessThan(result.raw);
    });
  });

  describe('comparator', () => {
    it('should sort by performance score descending', () => {
      const rowA = new Array(20).fill(0);
      const rowB = new Array(20).fill(0);
      rowA[14] = 100; // perf
      rowB[14] = 200; // perf

      expect(ScoringSystem.comparator(rowA, rowB)).toBeGreaterThan(0); // B before A
    });
  });
});
