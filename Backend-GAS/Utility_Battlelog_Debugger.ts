/**
 * ============================================================================
 * MODULE: UTILITY - BATTLELOG DEBUGGER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Standalone diagnostic engine for verifying Shadow Scout
 *    extraction and recursive seeding logic.
 * 
 * ROLE: Technical purity validator for battlelog analysis.
 * VERSION: 1.4.0 (Laboratory Edition)
 * ============================================================================
 */

import { CONFIG } from './Configuration';
import Registry from './Registry';

/**
 * Diagnostic function to analyze a player's battle history.
 * Optimized for token efficiency and high-density technical reporting.
 */
function debugPlayerBattlelogs(): void {
  const S = Registry.Services;
  const tag = CONFIG.SYSTEM.PLAYER_TAG;

  if (!tag) {
    console.error("ERR: Missing PLAYER_TAG");
    return;
  }

  // 1. DATA ACQUISITION
  const cb = Math.floor(Date.now() / 900000); 
  const url = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}/battlelog?__cb=${cb}`;
  
  const results = S.Network.fetchRoyaleAPI([url]);
  const rawLogs = results[0];

  if (!rawLogs || !Array.isArray(rawLogs)) {
    console.error(`ERR: Acquisition Failed for ${tag}`);
    return;
  }

  // 2. ANALYTICAL PROCESSING
  let metrics = {
    total: 0,
    scoutable: 0,
    opponents: 0,
    rejected: 0,
    yielding: 0,
    rawTypes: {} as Record<string, number>
  };

  const scoutableModes = [
    "ladder", "pathOfLegends", "challenge", "tournament", 
    "riverRacePvP", "riverRaceDuel", "riverRaceTugOfWar",
    "riverRaceDuelColosseum", "PvP", "trail"
  ];
  
  const seeds: Array<{ t: string; n: string }> = [];

  rawLogs.forEach((b: any) => {
    metrics.total++;
    const type = b.type || "unk";
    metrics.rawTypes[type] = (metrics.rawTypes[type] || 0) + 1;
    
    if (scoutableModes.includes(type)) {
      metrics.scoutable++;
      (b.opponent || []).forEach((opp: any) => {
        metrics.opponents++;
        if (!opp.clan || !opp.clan.tag) {
          metrics.yielding++;
          seeds.push({ t: opp.tag, n: opp.name || "???" });
        } else {
          metrics.rejected++;
        }
      });
    }
  });

  // 3. TOKEN-EFFICIENT OBSERVABILITY
  const report = [
    `CTX: ${tag} | v1.4.0`,
    `----------------------------------------`,
    `INGESTION: ${metrics.total} total`,
    `DIST: ${Object.entries(metrics.rawTypes).map(([k, v]) => `${k}:${v}`).join(", ")}`,
    `SCOUT: ${metrics.scoutable} matches`,
    `POOL:  ${metrics.opponents} subj`,
    `YIELD: ${metrics.yielding} seeds found`,
    `----------------------------------------`,
    ...seeds.map(s => `+ ${s.t.padEnd(12)} | ${s.n}`)
  ];

  S.Reporting.logReport("SHADOW_LAB_DIAGNOSTIC", report);
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { debugPlayerBattlelogs });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default debugPlayerBattlelogs;

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { debugPlayerBattlelogs });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default debugPlayerBattlelogs;
