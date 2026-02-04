/**
 * ============================================================================
 * MODULE: UTILITY - BATTLELOG DEBUGGER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Standalone diagnostic engine for verifying Shadow Scout
 *    extraction and recursive seeding logic.
 * 
 * ROLE: Testing tool for analyzing battle logs.
 * VERSION: 1.8.0
 * ============================================================================
 */

import { CONFIG } from './Configuration';
import Registry from './Registry';

/**
 * Analyzes a player's recent matches to find clanless opponents.
 * Uses adaptive benchmarking to detect the actual skill bracket.
 */
function debugPlayerBattlelogs(): void {
  const S = Registry.Services;
  const tag = CONFIG.SYSTEM.PLAYER_TAG;

  if (!tag) {
    console.error("Error: Player tag not found.");
    return;
  }

  // 1. Initial Data Fetch
  const playerUrl = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}`;
  const logUrl = `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}/battlelog?__cb=${Math.floor(Date.now() / 900000)}`;
  
  const [playerProfile, rawLogs] = S.Network.fetchRoyaleAPI([playerUrl, logUrl]);
  
  if (!playerProfile || !rawLogs || !Array.isArray(rawLogs)) {
    console.error(`Error: Could not fetch complete data for ${tag}`);
    return;
  }

  const subjectTrophies = playerProfile.trophies || 0;
  
  // 2. Adaptive Bracket Analysis
  // We look at EVERY opponent to see what the actual matchmaking environment looks like.
  let allOpponentTrophies: number[] = [];
  rawLogs.forEach(b => {
    (b.opponent || []).forEach((opp: any) => {
      if (opp.trophies) allOpponentTrophies.push(opp.trophies);
    });
  });

  const bracketAvg = allOpponentTrophies.length > 0 
    ? Math.round(allOpponentTrophies.reduce((a, b) => a + b, 0) / allOpponentTrophies.length)
    : subjectTrophies;

  // DYNAMIC FILTER: Focus on players within a reasonable range of the bracket average.
  // Instead of a fixed floor, we ignore players more than 1000 trophies below the bracket.
  const adaptiveFloor = bracketAvg - 1000;

  // 3. Processing
  const savedPlayers = S.Store.props.getJSON<Record<string, any>>("PROPHET_CACHE_V1", {});
  const weights = CONFIG.HEADHUNTER.WEIGHTS;

  let counts = {
    total: 0,
    opponents_evaluated: 0,
    recruits_found: 0,
    alumni: 0,
    filtered_out: 0,
    modes: {} as Record<string, number>
  };

  const ignoredModes = ["boatBattle", "unknown"];
  
  interface ScoutResult {
    tag: string;
    name: string;
    score: number;
    trophies: number;
    delta: number;
    returning: boolean;
    mode: string;
  }
  const results: ScoutResult[] = [];

  rawLogs.forEach((battle: any) => {
    counts.total++;
    const type = battle.type || "unknown";
    counts.modes[type] = (counts.modes[type] || 0) + 1;
    
    if (ignoredModes.includes(type)) return;

    (battle.opponent || []).forEach((opp: any) => {
      counts.opponents_evaluated++;
      const isClanless = !opp.clan || !opp.clan.tag;
      
      if (isClanless) {
        const tr = opp.trophies || 0;
        if (tr < adaptiveFloor) {
          counts.filtered_out++;
          return;
        }

        counts.recruits_found++;
        const cleanTag = opp.tag.replace("#", "").trim().toLowerCase();
        const isReturning = !!savedPlayers[cleanTag];
        if (isReturning) counts.alumni++;

        const score = S.Scoring.calculateRecruitRawScore(tr, 0, 0, false, weights);

        results.push({ 
          tag: opp.tag, 
          name: opp.name || "Unknown", 
          score: Math.round(score),
          trophies: tr,
          delta: tr - bracketAvg, // Difference from the bracket average
          returning: isReturning,
          mode: type
        });
      }
    });
  });

  // 4. Reporting
  const summary = [
    `Subject: ${tag} (${subjectTrophies} trophies) | v1.8.0`,
    `----------------------------------------`,
    `Detected Bracket Avg: ${bracketAvg} trophies`,
    `Adaptive Floor:       ${adaptiveFloor} trophies`,
    `Matches scanned:      ${counts.total}`,
    `Found recruits:       ${counts.recruits_found} (Alumni: ${counts.alumni})`,
    `Skipped (Low Quality): ${counts.filtered_out}`,
    `----------------------------------------`,
    ...results.sort((a,b) => b.score - a.score).map(p => {
      const deltaStr = p.delta >= 0 ? `+${p.delta}` : `${p.delta}`;
      return `${p.returning ? "[★]" : "[+]"} ${p.tag.padEnd(12)} | ${String(p.score).padStart(4)} pts | ${deltaStr.padStart(5)} rel | ${p.mode.padEnd(12)} | ${p.name}`;
    })
  ];

  S.Reporting.logReport("DYNAMIC_BRACKET_ANALYSIS", summary);
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { debugPlayerBattlelogs });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default debugPlayerBattlelogs;
