// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect } from 'vitest';
import { SORT_DESCRIPTIONS, LEADERBOARD_SORT_OPTIONS, RECRUITER_SORT_OPTIONS } from "@core/utils/sortOptions";

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
      const desc = (SORT_DESCRIPTIONS as any)[key];
      expect(typeof desc).toBe('object');
      expect(typeof desc.short).toBe('string');
      expect(typeof desc.full).toBe('string');
      expect(desc.short.length).toBeGreaterThan(0);
      expect(desc.full.length).toBeGreaterThan(0);
    });
  });

  it('should contain specific keywords in complex descriptions', () => {
    expect(SORT_DESCRIPTIONS.performance.full).toContain('War Fame');
    expect(SORT_DESCRIPTIONS.momentum.full).toContain('Δ Score');
    expect(SORT_DESCRIPTIONS.potential.full).toContain('Hybrid Benchmark');
  });

  it('should have correctly structured LEADERBOARD_SORT_OPTIONS', () => {
    expect(Array.isArray(LEADERBOARD_SORT_OPTIONS)).toBe(true);
    expect(LEADERBOARD_SORT_OPTIONS.length).toBeGreaterThan(0);
    LEADERBOARD_SORT_OPTIONS.forEach(opt => {
      expect(opt).toHaveProperty('label');
      expect(opt).toHaveProperty('value');
      expect(opt).toHaveProperty('desc');
      expect(opt).toHaveProperty('fullDesc');
      expect(typeof opt.desc).toBe('string');
      expect(typeof opt.fullDesc).toBe('string');
    });

    // Specific check for a known option
    const perf = LEADERBOARD_SORT_OPTIONS.find(o => o.value === 'score');
    expect(perf?.label).toBe('Performance');
    expect(perf?.desc).toBe(SORT_DESCRIPTIONS.performance.short);
    expect(perf?.fullDesc).toBe(SORT_DESCRIPTIONS.performance.full);
  });

  it('should have correctly structured RECRUITER_SORT_OPTIONS', () => {
    expect(Array.isArray(RECRUITER_SORT_OPTIONS)).toBe(true);
    expect(RECRUITER_SORT_OPTIONS.length).toBeGreaterThan(0);
    RECRUITER_SORT_OPTIONS.forEach(opt => {
      expect(opt).toHaveProperty('label');
      expect(opt).toHaveProperty('value');
      expect(opt).toHaveProperty('desc');
      expect(opt).toHaveProperty('fullDesc');
      expect(typeof opt.desc).toBe('string');
      expect(typeof opt.fullDesc).toBe('string');
    });

    // Specific check for a known option
    const potential = RECRUITER_SORT_OPTIONS.find(o => o.value === 'score');
    expect(potential?.label).toBe('Potential');
    expect(potential?.desc).toBe(SORT_DESCRIPTIONS.potential.short);
    expect(potential?.fullDesc).toBe(SORT_DESCRIPTIONS.potential.full);
  });
});
