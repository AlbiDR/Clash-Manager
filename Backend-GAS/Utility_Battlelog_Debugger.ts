/**
 * ============================================================================
 * MODULE: UTILITY - BATTLELOG DEBUGGER
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Multi-purpose modular engine for battle log analysis.
 *    Supports recruitment discovery, war participation, and future intel modes.
 * 
 * ROLE: Modular researcher for log-based recruitment and war data.
 * VERSION: 2.8.0 (Service Consumer)
 * ============================================================================
 */

import { CONFIG } from './Configuration';
import Registry from './Registry';
import { BattleLogProcessor, AnalysisGoal } from './Service_BattleLog';

/**
 * Entry point for the laboratory tool (Research Mode).
 */
function debugPlayerBattlelogs(): void {
  const tag = CONFIG.SYSTEM.PLAYER_TAG;
  if (!tag) return;

  const S = Registry.Services;
  const startTime = Date.now();

  // Test the recruitment purpose
  const candidates = BattleLogProcessor.digest(tag, AnalysisGoal.RECRUITMENT);

  const summary = [
    `Target: ${tag} | v2.8.0 (Goal: Recruitment)`,
    `----------------------------------------`,
    `Found: ${candidates.length} candidates.`,
    `Time:  ${((Date.now() - startTime) / 1000).toFixed(2)}s`,
    `----------------------------------------`,
    ...candidates.map(c => `[+] ${c.tag.padEnd(12)} | ${c.trophies} TR (${Math.sign(c.rel) >= 0 ? '+' : ''}${c.rel}) | ${c.mode.padEnd(12)} | ${c.name}`)
  ];

  S.Reporting.logReport("BATTLELOG_EXTRACTOR_YIELD", summary);
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { debugPlayerBattlelogs, BattleLogProcessor, AnalysisGoal });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default debugPlayerBattlelogs;
