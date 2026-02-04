/**
 * ============================================================================
 * MODULE: UTILITY - BATTLELOG DEBUGGER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Standalone diagnostic engine for verifying Shadow Scout
 *    extraction and recursive seeding logic.
 * 
 * ROLE: Technical purity validator for battlelog analysis.
 * VERSION: 1.5.0 (Laboratory Edition)
 * ============================================================================
 */

import { CONFIG } from './Configuration';
import Registry from './Registry';

/**
 * Diagnostic function to analyze a player's battle history.
 * v1.5.0: Integrated Heritage Intelligence & Scoring Simulation.
 */
function debugPlayerBattlelogs(): void {
  const S = Registry.Services;
  const tag = CONFIG.SYSTEM.PLAYER_TAG;

  if (!tag) {
    console.error("ERR: Missing PLAYER_TAG");
    return;
  }

  // DATA ACQUISITION
  const cb = Math.floor(Date.now() / 900000); 
  const url = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}/battlelog?__cb=${cb}`;
  const rawLogs = S.Network.fetchRoyaleAPI([url])[0];

  if (!rawLogs || !Array.isArray(rawLogs)) {
    console.error(`ERR: Empty Payload for ${tag}`);
    return;
  }

  // INTEL HYDRATION
  const prophet = S.Store.props.getJSON<Record<string, any>>("PROPHET_CACHE_V1", {});
  const W = CONFIG.HEADHUNTER.WEIGHTS;

  let metrics = {
    total: 0,
    scoutable: 0,
    opponents: 0,
    yielding: 0,
    heritage: 0,
    rawTypes: {} as Record<string, number>
  };

  const scoutableModes = [
    "ladder", "pathOfLegends", "challenge", "tournament", 
    "riverRacePvP", "riverRaceDuel", "riverRaceTugOfWar",
    "riverRaceDuelColosseum", "PvP", "trail"
  ];
  
  const seeds: Array<{ t: string; n: string; s: number; h: boolean }> = [];

  rawLogs.forEach((b: any) => {
    metrics.total++;
    const type = b.type || "unk";
    metrics.rawTypes[type] = (metrics.rawTypes[type] || 0) + 1;
    
    if (scoutableModes.includes(type)) {
      metrics.scoutable++;
      (b.opponent || []).forEach((opp: any) => {
        metrics.opponents++;
        const isClanless = !opp.clan || !opp.clan.tag;
        
        if (isClanless) {
          metrics.yielding++;
          const cleanTag = opp.tag.replace("#", "").trim().toLowerCase();
          const hasHeritage = !!prophet[cleanTag];
          if (hasHeritage) metrics.heritage++;

          // Simulation: Score based on Trophies + simulated weight
          const score = S.Scoring.calculateRecruitRawScore(
            opp.trophies || 0,
            0, // Unknown donations
            0, // Unknown war wins
            false,
            W
          );

          seeds.push({ 
            t: opp.tag, 
            n: opp.name || "???", 
            s: Math.round(score),
            h: hasHeritage
          });
        }
      });
    }
  });

  // TECHNICAL OBSERVABILITY
  const report = [
    `CTX: ${tag} | v1.5.0`,
    `----------------------------------------`,
    `INGESTION: ${metrics.total} total`,
    `DIST: ${Object.entries(metrics.rawTypes).map(([k, v]) => `${k}:${v}`).join(", ")}`,
    `SCOUT: ${metrics.scoutable} matches`,
    `POOL:  ${metrics.opponents} subj`,
    `YIELD: ${metrics.yielding} seeds (ALUMNI: ${metrics.heritage})`,
    `----------------------------------------`,
    ...seeds.sort((a,b) => b.s - a.s).map(s => 
      `${s.h ? "★" : "+"} ${s.t.padEnd(12)} | ${String(s.s).padStart(4)}pts | ${s.n}`
    )
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
