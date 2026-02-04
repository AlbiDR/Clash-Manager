/**
 * ============================================================================
 * MODULE: UTILITY - BATTLELOG DEBUGGER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Standalone diagnostic engine for verifying Shadow Scout
 *    extraction and recursive seeding logic.
 * 
 * ROLE: Technical purity validator for battlelog analysis.
 * VERSION: 1.0.0
 * ============================================================================
 */

import { CONFIG } from './Configuration';
import Registry from './Registry';

/**
 * Diagnostic function to analyze a player's battle history and identify
 * elite clanless opponents for potential recruitment.
 */
function debugPlayerBattlelogs(): void {
  const S = Registry.Services;
  const playerTag = CONFIG.SYSTEM.PLAYER_TAG;

  if (!playerTag || playerTag === "") {
    S.Reporting.logBanner("DEBUG ERROR: MISSING CONFIGURATION");
    console.error("No PlayerTag found in script properties. Analysis aborted.");
    return;
  }

  S.Reporting.logBanner("Battlelog Analysis Context");
  console.info(`TARGET_SUBJECT: ${playerTag}`);
  console.info(`SYSTEM_STATUS:  ACTIVE_DIAGNOSTIC`);

  // 1. DATA ACQUISITION
  const cb = Math.floor(Date.now() / 900000); 
  const url = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(playerTag)}/battlelog?__cb=${cb}`;
  
  S.Reporting.logStep(1, 2, "Initializing RoyaleAPI Data Feed...");
  const results = S.Network.fetchRoyaleAPI([url]);
  const rawLogs = results[0];

  if (!rawLogs || !Array.isArray(rawLogs)) {
    S.Reporting.logBanner("ACQUISITION FAILURE");
    console.error("Payload Empty or Malformed. Verify API Key functionality.");
    return;
  }

  // 2. ANALYTICAL PROCESSING
  S.Reporting.logStep(2, 2, "Executing Shadow Scout Logic Layer...");
  
  let metrics = {
    total: 0,
    scoutable: 0,
    opponents: 0,
    rejected: 0,
    yielding: 0,
    rawTypes: {} as Record<string, number>
  };

  const scoutableModes = ["ladder", "pathOfLegends", "challenge", "tournament"];
  const clanlessOpponents: Array<{ tag: string; name: string }> = [];

  rawLogs.forEach((battle: any) => {
    metrics.total++;
    const type = battle.type || "unknown";
    metrics.rawTypes[type] = (metrics.rawTypes[type] || 0) + 1;
    
    // PRECISION FILTER: Only analyze modes where recruitment is viable.
    if (scoutableModes.includes(battle.type)) {
      metrics.scoutable++;
      const opponents = battle.opponent || [];
      
      if (Array.isArray(opponents)) {
        opponents.forEach((opp: any) => {
          metrics.opponents++;
          const isClanless = !opp.clan || !opp.clan.tag;
          
          if (isClanless) {
            metrics.yielding++;
            clanlessOpponents.push({
              tag: opp.tag,
              name: opp.name || "Unknown"
            });
          } else {
            metrics.rejected++;
          }
        });
      }
    }
  });

  // 3. STRUCTURED OBSERVABILITY
  const summaryReport = [
    `PLAYER_METRIC:    ${playerTag}`,
    `INGESTION_TOTAL:  ${metrics.total} Battles`,
    `SCOUT_VIABLE:     ${metrics.scoutable} Battles (Standard Modes)`,
    `OPPONENT_POOL:    ${metrics.opponents} Total Subjects`,
    `REJECTION_RATE:   ${metrics.rejected} (Clanned / Ineligible)`,
    `EXTRACTION_YIELD: ${metrics.yielding} Recruitment Seeds Found`,
    "",
    "RAW_TYPE_DISTRIBUTION:",
    ...Object.entries(metrics.rawTypes).map(([type, count]) => `  - ${type.padEnd(20)}: ${count}`),
    "",
    "IDENTIFIED SEEDS [CLANLESS]:",
    ...clanlessOpponents.map(o => `  [+] ${o.tag.padEnd(12)} | ${o.name}`)
  ];

  S.Reporting.logReport("Shadow Scout Diagnostic Result", summaryReport);
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { debugPlayerBattlelogs });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default debugPlayerBattlelogs;
