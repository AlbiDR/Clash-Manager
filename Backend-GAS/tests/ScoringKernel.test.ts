
import { describe, it, expect } from 'vitest';
import ScoringKernel from '../Scoring_Kernel';

describe('ScoringKernel Strategy', () => {
  const IN_GAME_REQ = 6000;
  const MATH_CONFIG = {
    ELITE_THRESHOLD: 41,
    REBUILD_MIN_PERCENTILE: 0.1,
    BENCHMARK_CLAN_WEIGHT: 0.4,
    BENCHMARK_MARKET_WEIGHT: 0.6
  };

  it('should return in-game requirement if no members', () => {
    const result = ScoringKernel.evaluateTrophyStrategy([], IN_GAME_REQ, MATH_CONFIG);
    expect(result.floor).toBe(IN_GAME_REQ);
    expect(result.mode).toBe('BASE');
  });

  describe('Elite Mode (>41 members)', () => {
    it('should use Median when it is higher than In-Game Req', () => {
      const members = Array(42).fill(0).map((_, i) => ({ trophies: 10000 + i })); 
      const result = ScoringKernel.evaluateTrophyStrategy(members, IN_GAME_REQ, MATH_CONFIG);
      expect(result.mode).toBe('ELITE');
      expect(result.floor).toBeGreaterThan(IN_GAME_REQ);
      expect(result.method).toContain('Elite Mode (Median');
    });

    it('should use In-Game Req when Median is lower', () => {
      const members = Array(42).fill({ trophies: 5000 });
      const result = ScoringKernel.evaluateTrophyStrategy(members, IN_GAME_REQ, MATH_CONFIG);
      expect(result.mode).toBe('ELITE');
      expect(result.floor).toBe(IN_GAME_REQ);
      expect(result.method).toContain('At In-Game Cap');
    });
  });

  describe('Rebuild Mode (<=41 members)', () => {
    it('should use Bottom 10% Average when higher than In-Game Req', () => {
      const members = [
        ...Array(4).fill({ trophies: 7000 }),
        ...Array(36).fill({ trophies: 8000 })
      ];

      const result = ScoringKernel.evaluateTrophyStrategy(members, IN_GAME_REQ, MATH_CONFIG);
      expect(result.mode).toBe('REBUILD');
      expect(result.floor).toBe(7000);
      expect(result.method).toContain('Bot 10% Avg');
    });

    it('should use In-Game Req when Bottom 10% Average is lower', () => {
      const members = [
        ...Array(4).fill({ trophies: 5000 }),
        ...Array(36).fill({ trophies: 8000 })
      ];

      const result = ScoringKernel.evaluateTrophyStrategy(members, IN_GAME_REQ, MATH_CONFIG);
      expect(result.mode).toBe('REBUILD');
      expect(result.floor).toBe(IN_GAME_REQ);
      expect(result.method).toContain('At In-Game Cap');
    });
  });
});
