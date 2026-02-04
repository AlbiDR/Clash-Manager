/**
 * ============================================================================
 * MODULE: UTILITY - BATTLELOG DEBUGGER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Standalone diagnostic engine for verifying Shadow Scout
 *    extraction and recursive seeding logic.
 * 
 * ROLE: Testing tool for analyzing battle logs.
 * VERSION: 1.6.0
 * ============================================================================
 */

import { CONFIG } from './Configuration';
import Registry from './Registry';

/**
 * Analyzes a player's recent matches to find clanless opponents.
 */
function debugPlayerBattlelogs(): void {
  const S = Registry.Services;
  const tag = CONFIG.SYSTEM.PLAYER_TAG;
  const MIN_TROPHIES = 5000; // Skip players below this value

  if (!tag) {
    console.error("Error: Player tag not found.");
    return;
  }

  // Get data from API
  const cb = Math.floor(Date.now() / 900000); 
  const url = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}/battlelog?__cb=${cb}`;
  const rawLogs = S.Network.fetchRoyaleAPI([url])[0];

  if (!rawLogs || !Array.isArray(rawLogs)) {
    console.error(`Error: Could not get data for ${tag}`);
    return;
  }

  // Load saved data for comparison
  const savedPlayers = S.Store.props.getJSON<Record<string, any>>("PROPHET_CACHE_V1", {});
  const weights = CONFIG.HEADHUNTER.WEIGHTS;

  let counts = {
    total: 0,
    matches_checked: 0,
    opponents_seen: 0,
    clanless_found: 0,
    alumni_found: 0,
    low_score_skipped: 0,
    game_types: {} as Record<string, number>
  };

  const allowedModes = [
    "ladder", "pathOfLegends", "challenge", "tournament", 
    "riverRacePvP", "riverRaceDuel", "riverRaceTugOfWar",
    "riverRaceDuelColosseum", "PvP", "trail"
  ];
  
  const found_players: Array<{ t: string; n: string; s: number; h: boolean; mode: string }> = [];

  rawLogs.forEach((battle: any) => {
    counts.total++;
    const type = battle.type || "unknown";
    counts.game_types[type] = (counts.game_types[type] || 0) + 1;
    
    if (allowedModes.includes(type)) {
      counts.matches_checked++;
      (battle.opponent || []).forEach((opp: any) => {
        counts.opponents_seen++;
        const isClanless = !opp.clan || !opp.clan.tag;
        
        if (isClanless) {
          if ((opp.trophies || 0) < MIN_TROPHIES) {
            counts.low_score_skipped++;
            return;
          }

          counts.clanless_found++;
          const cleanTag = opp.tag.replace("#", "").trim().toLowerCase();
          const isReturning = !!savedPlayers[cleanTag];
          if (isReturning) counts.alumni_found++;

          const score = S.Scoring.calculateRecruitRawScore(
            opp.trophies || 0,
            0,
            0,
            false,
            weights
          );

          found_players.push({ 
            t: opp.tag, 
            n: opp.name || "Unknown", 
            s: Math.round(score),
            h: isReturning,
            mode: type
          });
        }
      });
    }
  });

  // Create the final summary
  const summary = [
    `Player: ${tag} | v1.6.0`,
    `----------------------------------------`,
    `Total matches: ${counts.total}`,
    `Match types: ${Object.entries(counts.game_types).map(([k, v]) => `${k}:${v}`).join(", ")}`,
    `Matches scanned: ${counts.matches_checked}`,
    `Clanless found: ${counts.clanless_found} (Alumni: ${counts.alumni_found})`,
    `Skipped (low trophies): ${counts.low_score_skipped}`,
    `----------------------------------------`,
    ...found_players.sort((a,b) => b.s - a.s).map(p => 
      `${p.h ? "[★]" : "[+]"} ${p.t.padEnd(12)} | ${String(p.s).padStart(4)} pts | ${p.mode.padEnd(12)} | ${p.n}`
    )
  ];

  S.Reporting.logReport("BATTLE_LOG_TEST_RESULTS", summary);
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { debugPlayerBattlelogs });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default debugPlayerBattlelogs;
