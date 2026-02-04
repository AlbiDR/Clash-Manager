/**
 * ============================================================================
 * MODULE: UTILITY - BATTLELOG DEBUGGER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Standalone diagnostic engine for verifying Shadow Scout
 *    extraction and recursive seeding logic.
 * 
 * ROLE: Testing tool for analyzing battle logs.
 * VERSION: 1.7.0
 * ============================================================================
 */

import { CONFIG } from './Configuration';
import Registry from './Registry';

/**
 * Analyzes a player's recent matches to find clanless opponents.
 * Uses a dynamic trophy floor based on the target player's trophies.
 */
function debugPlayerBattlelogs(): void {
  const S = Registry.Services;
  const tag = CONFIG.SYSTEM.PLAYER_TAG;

  if (!tag) {
    console.error("Error: Player tag not found.");
    return;
  }

  // Get subject player info for dynamic baseline
  const playerUrl = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}`;
  const playerProfile = S.Network.fetchRoyaleAPI([playerUrl])[0];
  
  if (!playerProfile) {
    console.error(`Error: Could not fetch profile for ${tag}`);
    return;
  }

  const subjectTrophies = playerProfile.trophies || 0;
  // DYNAMIC FLOOR: 90% of the player's trophies to ensure relevant quality
  const dynamicFloor = Math.floor(subjectTrophies * 0.9);

  // Get battle logs
  const cb = Math.floor(Date.now() / 900000); 
  const logUrl = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}/battlelog?__cb=${cb}`;
  const rawLogs = S.Network.fetchRoyaleAPI([logUrl])[0];

  if (!rawLogs || !Array.isArray(rawLogs)) {
    console.error(`Error: Could not get battle data for ${tag}`);
    return;
  }

  // Load saved data for comparison
  const savedPlayers = S.Store.props.getJSON<Record<string, any>>("PROPHET_CACHE_V1", {});
  const weights = CONFIG.HEADHUNTER.WEIGHTS;

  let counts = {
    total: 0,
    matches_scanned: 0,
    opponents_found: 0,
    potential_recruits: 0,
    alumni: 0,
    skipped_low_score: 0,
    match_types: {} as Record<string, number>
  };

  const allowedModes = [
    "ladder", "pathOfLegends", "challenge", "tournament", 
    "riverRacePvP", "riverRaceDuel", "riverRaceTugOfWar",
    "riverRaceDuelColosseum", "PvP", "trail"
  ];
  
  const results: Array<{ tag: string; name: string; score: number; returning: boolean; mode: string }> = [];

  rawLogs.forEach((battle: any) => {
    counts.total++;
    const type = battle.type || "unknown";
    counts.match_types[type] = (counts.match_types[type] || 0) + 1;
    
    if (allowedModes.includes(type)) {
      counts.matches_scanned++;
      (battle.opponent || []).forEach((opp: any) => {
        counts.opponents_found++;
        const isClanless = !opp.clan || !opp.clan.tag;
        
        if (isClanless) {
          if ((opp.trophies || 0) < dynamicFloor) {
            counts.skipped_low_score++;
            return;
          }

          counts.potential_recruits++;
          const cleanTag = opp.tag.replace("#", "").trim().toLowerCase();
          const isReturning = !!savedPlayers[cleanTag];
          if (isReturning) counts.alumni++;

          const score = S.Scoring.calculateRecruitRawScore(
            opp.trophies || 0,
            0,
            0,
            false,
            weights
          );

          results.push({ 
            tag: opp.tag, 
            name: opp.name || "Unknown", 
            score: Math.round(score),
            returning: isReturning,
            mode: type
          });
        }
      });
    }
  });

  // Create the final summary
  const summary = [
    `Target: ${tag} (${subjectTrophies} trophies) | v1.7.0`,
    `----------------------------------------`,
    `Trophy Floor (Dynamic): ${dynamicFloor}`,
    `Total matches: ${counts.total}`,
    `Match types: ${Object.entries(counts.match_types).map(([k, v]) => `${k}:${v}`).join(", ")}`,
    `Matches scanned: ${counts.matches_scanned}`,
    `Clanless found: ${counts.potential_recruits} (Alumni: ${counts.alumni})`,
    `Skipped (below floor): ${counts.skipped_low_score}`,
    `----------------------------------------`,
    ...results.sort((a,b) => b.score - a.score).map(p => 
      `${p.returning ? "[★]" : "[+]"} ${p.tag.padEnd(12)} | ${String(p.score).padStart(4)} pts | ${p.mode.padEnd(12)} | ${p.name}`
    )
  ];

  S.Reporting.logReport("BATTLE_LOG_ANALYSIS_SUMMARY", summary);
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { debugPlayerBattlelogs });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default debugPlayerBattlelogs;
