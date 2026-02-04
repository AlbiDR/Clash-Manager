/**
 * ============================================================================
 * MODULE: UTILITY - BATTLELOG DEBUGGER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Modular engine for extracting recruitment seeds from battle logs.
 *    Optimized for pruning efficiency and future Headhunter integration.
 * 
 * ROLE: Modular researcher for log-based recruitment.
 * VERSION: 2.0.0 (Modular Engine)
 * ============================================================================
 */

import { CONFIG } from './Configuration';
import Registry from './Registry';

/**
 * SHADOW_LOGIC: A modular class designed for injection into the Headhunter.
 */
export class ShadowLogic {
  /**
   * Main entry point for log extraction.
   * Returns a clean list of candidates that passed all pruning filters.
   */
  public static extractFromLogs(subjectTag: string): any[] {
    const S = Registry.Services;
    
    // 1. DATA ACQUISITION
    const pUrl = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(subjectTag)}`;
    const lUrl = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(subjectTag)}/battlelog?__cb=${Math.floor(Date.now() / 900000)}`;
    
    const [profile, logs] = S.Network.fetchRoyaleAPI([pUrl, lUrl]);
    
    if (!profile || !logs || !Array.isArray(logs)) return [];

    // 2. DYNAMIC REQUIREMENTS
    // We fetch the Clan's in-game requirement via the subject player's current clan data 
    // OR we could use a cached clan profile. For this laboratory, we use the subject's local context.
    const clanInGameRequirement = profile.clan?.tag === CONFIG.SYSTEM.CLAN_TAG ? profile.clan.requiredTrophies : 0;
    const globalMin = CONFIG.HEADHUNTER.MIN_TROPHIES || 5000;
    const effectiveFloor = Math.max(clanInGameRequirement, globalMin);

    const candidates: any[] = [];
    const ignoredModes = ["boatBattle", "unknown"];

    // 3. EFFICIENT PRUNING LOOP
    logs.forEach(battle => {
      // Filter 1: Mode Check
      if (ignoredModes.includes(battle.type)) return;

      (battle.opponent || []).forEach((opp: any) => {
        // Filter 2: Clanless Check (Primary Pruning)
        if (opp.clan && opp.clan.tag) return;

        // Filter 3: Trophy Floor (Quality Pruning)
        const tr = opp.trophies || 0;
        if (tr < effectiveFloor) return;

        // All filters passed: Add to the recruitment seed pool
        candidates.push({
          tag: opp.tag,
          name: opp.name || "Unknown",
          trophies: tr,
          mode: battle.type,
          source: "SHADOW_SCOUT"
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
    `Context: ${tag} | v2.0.0`,
    `----------------------------------------`,
    `Analysis result: ${candidates.length} candidates found.`,
    `Execution time: ${((Date.now() - startTime) / 1000).toFixed(2)}s`,
    `----------------------------------------`,
    ...candidates.map(c => `[+] ${c.tag.padEnd(12)} | ${c.trophies} TR | ${c.mode.padEnd(12)} | ${c.name}`)
  ];

  S.Reporting.logReport("BATTLELOG_EXTRACTION_SUCCESS", summary);
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { debugPlayerBattlelogs });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default debugPlayerBattlelogs;
