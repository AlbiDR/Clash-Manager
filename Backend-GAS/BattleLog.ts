/**
 * ============================================================================
 * MODULE: SERVICE - BATTLELOG
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Multi-purpose modular engine for battle log analysis.
 *    Supports recruitment discovery, war participation, and future intel modes.
 * 
 * ROLE: Modular researcher for log-based recruitment and war data.
 * VERSION: 1.0.0 (Extracted Service)
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
 * BATTLELOG CONTRACT
 */
export interface BattleLogContract {
  digest(subjectTag: string, goal: AnalysisGoal): any[];
}

/**
 * BATTLELOG: A modular engine for log-based intelligence.
 */
const BattleLog: BattleLogContract = {
  /**
   * Main entry point. 
   * Orchestrates fetching, statistical analysis, and purpose-driven extraction.
   */
  digest(subjectTag: string, goal: AnalysisGoal = AnalysisGoal.RECRUITMENT): any[] {
    const rawData = this.fetch(subjectTag);
    if (!rawData || !rawData.logs.length) return [];

    const stats = this.analyzeBracket(rawData.logs);
    const context = {
      ...stats,
      playerTrophies: rawData.profile.trophies || 0,
      clanRequirement: rawData.profile.clan?.requiredTrophies || 0
    };

    return this.process(rawData.logs, goal, context);
  },

  /**
   * Acquisition: Fetches raw profile and log data.
   */
  fetch(tag: string): { profile: any, logs: any[] } | null {
    const S = Registry.Services;
    const pUrl = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}`;
    const lUrl = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}/battlelog?__cb=${Math.floor(Date.now() / 900000)}`;
    const [profile, logs] = S.Network.fetchRoyaleAPI([pUrl, lUrl]);
    
    return (profile && logs) ? { profile, logs } : null;
  },

  /**
   * Helper: Extracts trophy count from either 'trophies' or 'startingTrophies'.
   */
  extractTrophies(opponent: any): number | null {
    if (typeof opponent.trophies === 'number') return opponent.trophies;
    if (typeof opponent.startingTrophies === 'number') return opponent.startingTrophies;
    return null;
  },

  /**
   * Statistical Utility: Calculates the bracket average and deviation.
   */
  analyzeBracket(logs: any[]): { mean: number, floor: number } {
    const trophies: number[] = [];
    logs.forEach(b => (b.opponent || []).forEach((o: any) => {
       const tr = this.extractTrophies(o);
       if (tr !== null) trophies.push(tr);
    }));

    if (trophies.length === 0) return { mean: 0, floor: 0 };

    const mean = trophies.reduce((a, b) => a + b, 0) / trophies.length;
    const variance = trophies.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / trophies.length;
    const stdDev = Math.sqrt(variance);

    return { mean, floor: Math.round(mean - stdDev) };
  },

  /**
   * Processing: Loops through logs and extracts data based on the goal.
   */
  process(logs: any[], goal: AnalysisGoal, ctx: any): any[] {
    const results: any[] = [];

    logs.forEach(battle => {
      if (goal === AnalysisGoal.WAR_INTELLIGENCE && !battle.type.toLowerCase().includes("race")) return;

      (battle.opponent || []).forEach((opp: any) => {
        switch (goal) {
          case AnalysisGoal.RECRUITMENT:
            if (opp.clan && opp.clan.tag) return;
            const tr = this.extractTrophies(opp);
            if (tr === null) return;
            if (tr < Math.max(ctx.floor, ctx.clanRequirement)) return;
            break;
        }
        if (!opp.tag) return;
        results.push(this.transform(battle, opp, goal, ctx));
      });
    });

    return results;
  },

  /**
   * Transformation: Maps raw API data to a clean, purpose-driven object.
   */
  transform(battle: any, opponent: any, goal: AnalysisGoal, ctx: any): any {
    const base = {
      tag: opponent.tag,
      name: opponent.name || "Unknown",
      mode: battle.type,
      time: battle.battleTime
    };

    switch (goal) {
      case AnalysisGoal.RECRUITMENT:
        const tr = this.extractTrophies(opponent) || 0;
        return {
          ...base,
          trophies: tr,
          rel: Math.round(tr - ctx.mean)
        };
      case AnalysisGoal.WAR_INTELLIGENCE:
        return {
          ...base,
          medals: battle.challengeId || 0,
          deck: (battle.team[0]?.cards || []).map((c: any) => c.name)
        };
      default:
        return base;
    }
  }
};

export default BattleLog;

