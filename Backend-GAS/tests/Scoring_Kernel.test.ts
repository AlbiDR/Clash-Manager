
import { describe, it, expect } from 'vitest';
import ScoringKernel from '../Scoring_Kernel';

describe('ScoringKernel Strategy', () => {
  const IN_GAME_REQ = 6000;

  it('should return in-game requirement if no members', () => {
    const result = ScoringKernel.calcTrophyFloor([], IN_GAME_REQ);
    expect(result.floor).toBe(IN_GAME_REQ);
    expect(result.mode).toBe('BASE');
  });

  describe('Elite Mode (>41 members)', () => {
    it('should use Median when it is higher than In-Game Req', () => {
      // 42 members. Sorted: [1000, 1000, ... 7000, 7000]
      // Median index of 42 is 21.
      
      const members = Array(42).fill(0).map((_, i) => ({ trophies: 10000 + i })); 
      // All > 6000. Median ~ 10021.
      
      const result = ScoringKernel.calcTrophyFloor(members, IN_GAME_REQ);
      expect(result.mode).toBe('ELITE');
      expect(result.floor).toBeGreaterThan(IN_GAME_REQ);
      expect(result.method).toContain('Elite Mode (Median');
    });

    it('should use In-Game Req when Median is lower', () => {
      // 42 members. All 5000.
      const members = Array(42).fill({ trophies: 5000 });
      
      const result = ScoringKernel.calcTrophyFloor(members, IN_GAME_REQ);
      expect(result.mode).toBe('ELITE');
      expect(result.floor).toBe(IN_GAME_REQ);
      expect(result.method).toContain('At In-Game Cap');
    });
  });

  describe('Rebuild Mode (<=41 members)', () => {
    it('should use Bottom 10% Average when higher than In-Game Req', () => {
      // 40 members.
      // Bottom 10% of 40 is 4 members.
      // Let's make bottom 4 have 7000, rest 8000.
      const members = [
        ...Array(4).fill({ trophies: 7000 }),
        ...Array(36).fill({ trophies: 8000 })
      ];

      const result = ScoringKernel.calcTrophyFloor(members, IN_GAME_REQ);
      expect(result.mode).toBe('REBUILD');
      expect(result.floor).toBe(7000);
      expect(result.method).toContain('Bot 10% Avg');
    });

    it('should use In-Game Req when Bottom 10% Average is lower', () => {
      // 40 members. Bottom 4 have 5000.
      const members = [
        ...Array(4).fill({ trophies: 5000 }),
        ...Array(36).fill({ trophies: 8000 })
      ];

      const result = ScoringKernel.calcTrophyFloor(members, IN_GAME_REQ);
      expect(result.mode).toBe('REBUILD');
      expect(result.floor).toBe(IN_GAME_REQ);
      expect(result.method).toContain('At In-Game Cap');
    });
  });
});
