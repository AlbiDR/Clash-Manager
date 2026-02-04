/**
 * ============================================================================
 * MODULE: UTILITY - BATTLELOG DEBUGGER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Standalone diagnostic engine for verifying Shadow Scout
 *    extraction and recursive seeding logic.
 * 
 * ROLE: Testing tool for analyzing battle logs.
 * VERSION: 1.9.0
 * ============================================================================
 */

import { CONFIG } from './Configuration';
import Registry from './Registry';

/**
 * Analyzes a player's recent matches to find clanless opponents.
 * Uses statistical standard deviation to eliminate outliers without fixed values.
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
  
  // 2. Statistical Analysis of the Matchmaking Environment
  let allTrophies: number[] = [];
  rawLogs.forEach(b => {
    (b.opponent || []).forEach((opp: any) => {
      if (opp.trophies) allTrophies.push(opp.trophies);
    });
  });

  if (allTrophies.length === 0) {
    console.error("Error: No opponent data found in logs.");
    return;
  }

  // Calculate Mean
  const mean = allTrophies.reduce((a, b) => a + b, 0) / allTrophies.length;
  
  // Calculate Standard Deviation (SD)
  // This measures the "spread" of player skill in the current session.
  const variance = allTrophies.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / allTrophies.length;
  const stdDev = Math.sqrt(variance);

  // DYNAMIC STATISTICAL FLOOR: 
  // We set the floor at (Mean - 1 Standard Deviation). 
  // This mathematically targets the top ~84% of players encountered, 
  // naturally filtering out the low-skill outliers of that specific session.
  const statisticalFloor = Math.round(mean - stdDev);

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
        if (tr < statisticalFloor) {
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
          delta: Math.round(tr - mean), 
          returning: isReturning,
          mode: type
        });
      }
    });
  });

  // 4. Reporting
  const summary = [
    `Subject: ${tag} (${subjectTrophies} trophies) | v1.9.0`,
    `----------------------------------------`,
    `Session Average: ${Math.round(mean)} trophies`,
    `Session Spread:  ±${Math.round(stdDev)} (Standard Deviation)`,
    `Statistical Floor: ${statisticalFloor} trophies`,
    `Current matches:   ${counts.total}`,
    `Found recruits:    ${counts.recruits_found} (Alumni: ${counts.alumni})`,
    `Filtered Out:      ${counts.filtered_out} (Outliers)`,
    `----------------------------------------`,
    ...results.sort((a,b) => b.score - a.score).map(p => {
      const deltaStr = p.delta >= 0 ? `+${p.delta}` : `${p.delta}`;
      return `${p.returning ? "[★]" : "[+]"} ${p.tag.padEnd(12)} | ${String(p.score).padStart(4)} pts | ${deltaStr.padStart(5)} rel | ${p.mode.padEnd(12)} | ${p.name}`;
    })
  ];

  S.Reporting.logReport("STATISTICAL_BRACKET_ANALYSIS", summary);
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { debugPlayerBattlelogs });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default debugPlayerBattlelogs;
