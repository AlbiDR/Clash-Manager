/**
 * ============================================================================
 * MODULE: UTILITY - BATTLELOG DEBUGGER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Multi-purpose modular engine for battle log analysis.
 *    Supports recruitment discovery, war participation, and future intel modes.
 * 
 * ROLE: Modular researcher for log-based recruitment and war data.
 * VERSION: 2.7.0 (Precision Nomenclature)
 * ============================================================================
 */

import { CONFIG } from './Configuration';
import Registry from './Registry';

/**
 * Defines the goal of the log analysis.
 */
export enum AnalysisGoal {
  // CORE FUNCTIONS
  RECRUITMENT = "RECRUITMENT",       // Find clanless players
  WAR_INTELLIGENCE = "WAR_STATS",    // Track medals, decks, and participation

  // [PLACEHOLDER] FUTURE ARCHITECTURES
  /**
   * DRAFT: Audit a specific player's activity patterns.
   * Potential use: Check if a member is playing Ladder while skipping War, or determine active timezones.
   */
  ACTIVITY_AUDIT = "ACTIVITY_AUDIT"
}

/**
 * BATTLELOG_PROCESSOR: A modular engine designed to be injected into different modules.
 */
export class BattleLogProcessor {
  
  /**
   * Main entry point. 
   * Orchestrates fetching, statistical analysis, and purpose-driven extraction.
   */
  public static digest(subjectTag: string, goal: AnalysisGoal = AnalysisGoal.RECRUITMENT): any[] {
    const rawData = this.fetch(subjectTag);
    if (!rawData || !rawData.logs.length) return [];

    const stats = this.analyzeBracket(rawData.logs);
    const context = {
      ...stats,
      playerTrophies: rawData.profile.trophies || 0,
      clanRequirement: rawData.profile.clan?.requiredTrophies || 0
    };

    return this.process(rawData.logs, goal, context);
  }

  /**
   * Acquisition: Fetches raw profile and log data.
   */
  private static fetch(tag: string): { profile: any, logs: any[] } | null {
    const S = Registry.Services;
    const pUrl = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}`;
    const lUrl = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}/battlelog?__cb=${Math.floor(Date.now() / 900000)}`;
    const [profile, logs] = S.Network.fetchRoyaleAPI([pUrl, lUrl]);
    
    return (profile && logs) ? { profile, logs } : null;
  }

  /**
   * Statistical Utility: Calculates the bracket average and deviation.
   */
  private static analyzeBracket(logs: any[]): { mean: number, floor: number } {
    const trophies: number[] = [];
    logs.forEach(b => (b.opponent || []).forEach((o: any) => {
       if (typeof o.trophies === 'number') trophies.push(o.trophies);
    }));

    if (trophies.length === 0) return { mean: 0, floor: 0 };

    const mean = trophies.reduce((a, b) => a + b, 0) / trophies.length;
    const variance = trophies.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / trophies.length;
    const stdDev = Math.sqrt(variance);

    // Dynamic quality floor
    return { mean, floor: Math.round(mean - stdDev) };
  }

  /**
   * Processing: Loops through logs and extracts data based on the goal.
   */
  private static process(logs: any[], goal: AnalysisGoal, ctx: any): any[] {
    const results: any[] = [];

    logs.forEach(battle => {
      // PRUNING STEP 1: Purpose-specific mode filtering
      if (goal === AnalysisGoal.WAR_INTELLIGENCE && !battle.type.toLowerCase().includes("race")) return;

      (battle.opponent || []).forEach((opp: any) => {
        
        // PRUNING STEP 2: Goal-specific filtering
        switch (goal) {
          case AnalysisGoal.RECRUITMENT:
            if (opp.clan && opp.clan.tag) return; // Must be clanless
            if (typeof opp.trophies !== 'number') return; // STRICT QUALITY: Must have data
            if (opp.trophies < Math.max(ctx.floor, ctx.clanRequirement)) return; // Must meet quality bar
            break;
            
          case AnalysisGoal.ACTIVITY_AUDIT:
             // [DRAFT] Future Logic: Filter by last 24h only?
             break;
        }

        // PRUNING STEP 3: Universal filters
        if (!opp.tag) return;

        // EXTRACTION: Capture data defined by the goal
        results.push(this.transform(battle, opp, goal, ctx));
      });
    });

    return results;
  }

  /**
   * Transformation: Maps raw API data to a clean, purpose-driven object.
   */
  private static transform(battle: any, opponent: any, goal: AnalysisGoal, ctx: any): any {
    const base = {
      tag: opponent.tag,
      name: opponent.name || "Unknown",
      mode: battle.type,
      time: battle.battleTime
    };

    switch (goal) {
      case AnalysisGoal.RECRUITMENT:
        return {
          ...base,
          trophies: opponent.trophies,
          rel: Math.round(opponent.trophies - ctx.mean)
        };

      case AnalysisGoal.WAR_INTELLIGENCE:
        return {
          ...base,
          medals: battle.challengeId || 0,
          deck: (battle.team[0]?.cards || []).map((c: any) => c.name)
        };

      case AnalysisGoal.ACTIVITY_AUDIT:
        // [PLACEHOLDER] Return time delta analysis
        return {
          ...base,
          minutesAgo: Math.floor((Date.now() - new Date(battle.battleTime).getTime()) / 60000)
        };
        
      default:
        return base;
    }
  }
}

/**
 * Entry point for the laboratory tool (Research Mode).
 */
function debugPlayerBattlelogs(): void {
  const tag = CONFIG.SYSTEM.PLAYER_TAG;
  if (!tag) return;

  const S = Registry.Services;
  const startTime = Date.now();

  // Test the recruitment purpose
  const candidates = BattleLogProcessor.digest(tag, AnalysisGoal.RECRUITMENT);

  const summary = [
    `Target: ${tag} | v2.7.0 (Goal: Recruitment)`,
    `----------------------------------------`,
    `Found: ${candidates.length} candidates.`,
    `Time:  ${((Date.now() - startTime) / 1000).toFixed(2)}s`,
    `----------------------------------------`,
    ...candidates.map(c => `[+] ${c.tag.padEnd(12)} | ${c.trophies} TR (${Math.sign(c.rel) >= 0 ? '+' : ''}${c.rel}) | ${c.mode.padEnd(12)} | ${c.name}`)
  ];

  S.Reporting.logReport("BATTLELOG_EXTRACTOR_YIELD", summary);
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { debugPlayerBattlelogs, BattleLogProcessor, AnalysisGoal });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default debugPlayerBattlelogs;
