
import { describe, it, expect } from 'vitest';
import ScoringSystem from '../ScoringSystem';

describe('ScoringSystem Heritage Protocol', () => {
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
    const result = ScoringSystem.computeScores(
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

  it('should boost Veterans with Heritage Score', () => {
    // ⚔️ Scenario: An Active Veteran
    // Trophies: 9000
    // WarDayWins: 100
    // Internal Stats: 1000 Fame (Week), 1000 Donations
    
    // 1. Potential Calculation:
    // (9000 * 1) + (1000 * 0.07) + (100+500 warBonus)*20
    // 9000 + 70 + 12000 = 21070
    // Floor (1/5) = 4214
    
    // 2. Internal Raw:
    //    Fame (1000 * 3) = 3000
    //    Donations (1000 * 50) = 50,000
    //    Trophies (9000 * 0.1) = 900
    //    Total Internal = 53,900
    // 3. Expected Total = 53,900 + 4,214 = 58,114
    
    // @ts-ignore
    const result = ScoringSystem.computeScores(
        1000, 
        0, 
        1000, 
        9000, 
        0, 
        Date.now(), 
        Date.now(),
        100, 
        true
    );

    expect(result.perf).toBeGreaterThanOrEqual(58110);
    expect(result.perf).toBeLessThanOrEqual(58120);
  });
});
