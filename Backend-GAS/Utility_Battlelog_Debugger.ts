/**
 * ============================================================================
 * MODULE: UTILITY - BATTLELOG DEBUGGER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Modular engine for extracting recruitment seeds from battle logs.
 *    Uses statistical analysis and pure rule-based pruning.
 * 
 * ROLE: Modular researcher for log-based recruitment.
 * VERSION: 2.2.0 (Open-Mode Dynamic Engine)
 * ============================================================================
 */

import { CONFIG } from './Configuration';
import Registry from './Registry';

/**
 * SHADOW_LOGIC: A modular class for log-based recruitment discovery.
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

    // 2. STATISTICAL ANALYSIS
    // We analyze ALL opponents found in the logs to understand the bracket.
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

    // 3. POLICY & BRACKET FLOOR
    const statisticalFloor = Math.round(mean - stdDev);
    const clanInGameRequirement = profile.clan?.requiredTrophies || 0;
    const projectFloor = CONFIG.HEADHUNTER.MIN_TROPHIES || 0;

    const effectiveFloor = Math.max(statisticalFloor, clanInGameRequirement, projectFloor);

    const candidates: any[] = [];

    // 4. OPEN-MODE PRUNING LOOP
    // We no longer skip any modes. If an opponent is clanless and meets the quality 
    // requirements, they are a valid lead regardless of where they were found.
    logs.forEach(battle => {
      (battle.opponent || []).forEach((opp: any) => {
        
        // PRUNING 1: Clan Presence (Exclude those we can't recruit)
        if (opp.clan && opp.clan.tag) return;

        // PRUNING 2: Quality Floor (Exclude outliers and policy violations)
        const tr = opp.trophies || 0;
        if (tr < effectiveFloor) return;

        // All filters passed: Capture potential recruit
        candidates.push({
          tag: opp.tag,
          name: opp.name || "Unknown",
          trophies: tr,
          mode: battle.type || "unknown",
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
 */
function debugPlayerBattlelogs(): void {
  const tag = CONFIG.SYSTEM.PLAYER_TAG;
  if (!tag) {
    console.error("Error: Player tag missing from configuration.");
    return;
  }

  const S = Registry.Services;
  const startTime = Date.now();

  const candidates = ShadowLogic.extractFromLogs(tag);

  const summary = [
    `Target: ${tag} | v2.2.0 (Open-Mode)`,
    `----------------------------------------`,
    `Extracted: ${candidates.length} candidates.`,
    `Execution: ${((Date.now() - startTime) / 1000).toFixed(2)}s`,
    `----------------------------------------`,
    ...candidates.map(c => `[+] ${c.tag.padEnd(12)} | ${c.trophies} TR (vs ${c.bracketAvg}) | ${c.mode.padEnd(12)} | ${c.name}`)
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
