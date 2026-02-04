/**
 * ============================================================================
 * MODULE: UTILITY - BATTLELOG DEBUGGER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Modular engine for extracting recruitment seeds from battle logs.
 *    Uses statistical bracket detection and strict rule-based pruning.
 * 
 * ROLE: Modular researcher for log-based recruitment.
 * VERSION: 2.1.0 (Dynamic Modular Engine)
 * ============================================================================
 */

import { CONFIG } from './Configuration';
import Registry from './Registry';

/**
 * SHADOW_LOGIC: A modular class for log-based recruitment discovery.
 * Designed for direct integration into the Headhunter scanner.
 */
export class ShadowLogic {
  /**
   * Main entry point for log extraction.
   * Returns a clean list of candidates that passed all statistical and policy filters.
   */
  public static extractFromLogs(subjectTag: string): any[] {
    const S = Registry.Services;
    
    // 1. DATA ACQUISITION
    const pUrl = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(subjectTag)}`;
    const lUrl = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(subjectTag)}/battlelog?__cb=${Math.floor(Date.now() / 900000)}`;
    
    const [profile, logs] = S.Network.fetchRoyaleAPI([pUrl, lUrl]);
    
    if (!profile || !logs || !Array.isArray(logs)) return [];

    // 2. STATISTICAL BRACKET ANALYSIS
    // We determine the "skill level" of the session by looking at all opponents encountered.
    const allOpponentTrophies: number[] = [];
    logs.forEach(b => {
      (b.opponent || []).forEach((opp: any) => {
        if (opp.trophies) allOpponentTrophies.push(opp.trophies);
      });
    });

    if (allOpponentTrophies.length === 0) return [];

    const mean = allOpponentTrophies.reduce((a, b) => a + b, 0) / allOpponentTrophies.length;
    const variance = allOpponentTrophies.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / allOpponentTrophies.length;
    const stdDev = Math.sqrt(variance);

    // 3. DYNAMIC PRUNING RULES
    // We calculate a floor that adapts to the session while respecting clan policy.
    const statisticalFloor = Math.round(mean - stdDev);
    const clanInGameRequirement = profile.clan?.requiredTrophies || 0;
    const projectFloor = CONFIG.HEADHUNTER.MIN_TROPHIES || 0; // Removing fallback '5000'

    // The effective floor is the highest of all dynamic and static rules.
    const effectiveFloor = Math.max(statisticalFloor, clanInGameRequirement, projectFloor);

    const candidates: any[] = [];
    const ignoredModes = ["boatBattle", "unknown"];

    // 4. EFFICIENT FILTERING LOOP
    logs.forEach(battle => {
      if (ignoredModes.includes(battle.type)) return;

      (battle.opponent || []).forEach((opp: any) => {
        // PRIORITY PRUNING: Clanless check first (Fastest/Least overhead)
        if (opp.clan && opp.clan.tag) return;

        // QUALITY PRUNING: Trophy Floor check
        const tr = opp.trophies || 0;
        if (tr < effectiveFloor) return;

        // All filters passed
        candidates.push({
          tag: opp.tag,
          name: opp.name || "Unknown",
          trophies: tr,
          mode: battle.type,
          source: "SHADOW_SCOUT",
          bracketAvg: Math.round(mean)
        });
      });
    });

    return candidates;
  }
}

/**
 * Entry point for the laboratory tool.
 * Utilizes the modular ShadowLogic class above.
 */
function debugPlayerBattlelogs(): void {
  const tag = CONFIG.SYSTEM.PLAYER_TAG;
  if (!tag) {
    console.error("Error: Player tag missing from configuration.");
    return;
  }

  const S = Registry.Services;
  const startTime = Date.now();

  // Call the modular logic
  const candidates = ShadowLogic.extractFromLogs(tag);

  // Simple, efficient report
  const summary = [
    `Target: ${tag} | v2.1.0 (Dynamic)`,
    `----------------------------------------`,
    `Analysis: ${candidates.length} candidates extracted.`,
    `Execution: ${((Date.now() - startTime) / 1000).toFixed(2)}s`,
    `----------------------------------------`,
    ...candidates.map(c => `[+] ${c.tag.padEnd(12)} | ${c.trophies} TR (vs ${c.bracketAvg} avg) | ${c.mode.padEnd(12)} | ${c.name}`)
  ];

  S.Reporting.logReport("SHADOW_ENGINE_YIELD", summary);
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { debugPlayerBattlelogs });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default debugPlayerBattlelogs;
