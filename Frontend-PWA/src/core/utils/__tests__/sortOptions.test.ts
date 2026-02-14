import { describe, it, expect } from 'vitest';
import { SORT_DESCRIPTIONS } from "@core/utils/sortOptions";

describe('sortOptions', () => {
  it('should have descriptions for all expected sort keys', () => {
    const expectedKeys = [
      'name',
      'trophies',
      'performance',
      'momentum',
      'donations_day',
      'tenure',
      'last_seen',
      'potential',
      'donations_lifetime',
      'recency'
    ];

    expectedKeys.forEach(key => {
      expect(SORT_DESCRIPTIONS).toHaveProperty(key);
      expect(typeof (SORT_DESCRIPTIONS as any)[key]).toBe('string');
      expect((SORT_DESCRIPTIONS as any)[key].length).toBeGreaterThan(0);
    });
  });

  it('should contain specific keywords in complex descriptions', () => {
    expect(SORT_DESCRIPTIONS.performance).toContain('War Fame');
    expect(SORT_DESCRIPTIONS.momentum).toContain('Δ Score');
    expect(SORT_DESCRIPTIONS.potential).toContain('Hybrid Benchmark');
  });
});
