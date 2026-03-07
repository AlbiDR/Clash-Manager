
import { describe, it, expect } from 'vitest';
import Scoring from '../Scoring';

describe('Scoring Heritage Protocol', () => {
  it('should apply Heritage Floor (Potential/5) to Performance Score', () => {
    // ⚔️ Scenario: A "Perfect Recruit" fresh joiner
    // Trophies: 9000
    // WarDayWins: 100
    // Internal Stats: 0 Fame, 0 Donations
    
    // 1. Calculate Expected Recruit Potential
    // Trophies * 1.0 = 9000
    // WarWins * 20.0 = 2000
    // Donations * 0.07 = 0
    // Total Potential = 11,000
    // Heritage Floor (1/5) = 2,200

    // 2. Calculate Expected Internal Score
    // Trophies * 0.1 = 900
    // Fame/Donations = 0
    // Internal Raw = 900
    
    // 3. Expected Total Perf = Internal (900) + Floor (2200) = 3100
    
    // @ts-ignore
    const result = Scoring.computeScores(
        0, // currentFame
        0, // avgFame
        0, // donations
        9000, // trophies
        0, // warRate
        Date.now(), // lastSeen
        Date.now(), // now
        100, // warDayWins (New Param)
        false // hasRecentWar (New Param)
    );

    // Allow for small rounding differences
    expect(result.perf).toBeGreaterThanOrEqual(3099); 
    expect(result.perf).toBeLessThanOrEqual(3101);
  });

  it('should apply Quadratic Induction Blessing (Day 0 = 100%)', () => {
    // Trophies: 9000 -> 9000 Skill
    // WarWins: 100 -> 2000 War
    // Total Potential = 11,000 / 5 = 2200
    // Internal Raw = 900
    // Total Perf = 900 + 2200 = 3100
    
    // @ts-ignore
    const result = Scoring.computeScores(0, 0, 0, 9000, 0, Date.now(), Date.now(), 100, false, 0);
    expect(result.perf).toBeGreaterThanOrEqual(3099);
    expect(result.perf).toBeLessThanOrEqual(3101);
  });

  it('should apply Quadratic Decay at Day 5 (Factor = 0.25)', () => {
    // 1. Total Blessing (at Day 0) = 2200
    // 2. Factor = ((10 - 5) / 10)^2 = 0.5^2 = 0.25
    // 3. Adjusted Bias = 2200 * 0.25 = 550
    // 4. Internal Raw = 900
    // 5. Final Perf = 900 + 550 = 1450
    
    // @ts-ignore
    const result = Scoring.computeScores(0, 0, 0, 9000, 0, Date.now(), Date.now(), 100, false, 5);
    expect(result.perf).toBeGreaterThanOrEqual(1449);
    expect(result.perf).toBeLessThanOrEqual(1451);
  });

  it('should hit exactly zero at Day 10 (Induction End)', () => {
    // 1. Internal Raw (9000 trophies * 0.1) = 900
    // 2. Heritage Bias = 0
    // 3. Final Perf = 900
    
    // @ts-ignore
    const result = Scoring.computeScores(0, 0, 0, 9000, 0, Date.now(), Date.now(), 100, false, 10);
    expect(result.perf).toBe(900);
  });
  it('should apply Recent War Activity bonus (500 points potential)', () => {
    // ⚔️ Scenario: A recruit who has fought recently according to Prophet log
    // Trophies: 9000 (900 raw)
    // Wins: 0 (0 potential)
    // Recent War: True (500 bonus * 20 weight = 10,000 potential)
    // Trophies Skill Potential: 9000 * 1.0 = 9000
    // Total Potential = 19,000
    // Bias = 19,000 / 5 = 3800
    // Total Perf = 900 (Internal) + 3800 (Bias) = 4700
    
    // @ts-ignore
    const result = Scoring.computeScores(0, 0, 0, 9000, 0, Date.now(), Date.now(), 0, true, 0);
    expect(result.perf).toBe(4700);
  });
});
