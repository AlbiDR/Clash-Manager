
import { CONFIG } from './Configuration';
import Registry from './Registry';
import HeadhunterStore from './Headhunter_Store';
import HeadhunterScanner from './Headhunter_Scanner';
import HeadhunterView from './Headhunter_View';
import type { Recruit } from './Headhunter_Types';

declare var SpreadsheetApp: any;
declare var Sheets: any;
declare function refreshWebPayload(): void;

/**
 * MODULE: HEADHUNTER (Core Orchestrator)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: The Director of the Recruitment Pipeline.
 *    Orchestrates: Strategy -> Store -> Scanner -> View.
 * ============================================================================
 */
const VER_HEADHUNTER = "12.3.0";

export interface IHeadhunter {
  scout(): void;
}

const Headhunter: IHeadhunter = {
  scout(): void {
    const startTime = Date.now();
    const S = Registry.Services;
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const safeSheet = (name: string) => {
      let s = ss.getSheetByName(name);
      if (!s) {
         s = ss.insertSheet(name);
         S.View.enforceGlobalTabHygiene();
      }
      return s;
    };

    let sheet = safeSheet(CONFIG.SHEETS.HH);
    
    // 1. INITIALIZE [1/9]
    const schemaResults = S.Schema.bootDynamicSchema();
    S.Reporting.logReport(`[1/9] INITIALIZE: HEADHUNTER PIPELINE v${VER_HEADHUNTER}`, [
      `CONFIG: Clan ${CONFIG.SYSTEM.CLAN_TAG || "ERR"} | Mode: RAPID_GLOBAL_SCOUT | Target: ${CONFIG.HEADHUNTER.TARGET}`,
      `STATUS: Sheets Synced (${schemaResults})`
    ]);

    if (!CONFIG.SYSTEM.CLAN_TAG) {
      console.error("CONFIGURATION ERROR: Missing CLAN_TAG. Aborting Headhunter Scout.");
      return;
    }

    try {
      // L1 CACHE PURGE: Ensure a fresh start for this execution
      S.Network._clearCache();

      const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
      const cb = Date.now();

      // 2. RESOURCE HYDRATION (Baseline & Quota)
      const clanDetailResponse = S.Network.fetchRoyaleAPI([
        `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}?__cb=${cb}`,
      ]);

      let inGameRequirement = 0;
      let members: any[] = [];
      if (clanDetailResponse && clanDetailResponse[0]) {
        const clan = clanDetailResponse[0];
        inGameRequirement = clan.requiredTrophies || 0;
        members = clan.memberList || [];
      }

      const remainingQuota = S.Network.getRemainingQuota();
      if (remainingQuota < 300) {
        console.warn(`QUOTA ALERT: Insufficient API capacity (${remainingQuota}). Aborting.`);
        return;
      }
      const lowQuotaMode = remainingQuota < 1000;

      // 3. STATE HYDRATION
      const strategy = S.Scoring.calculateTrophyFloor(members, inGameRequirement);
      const blacklistResult = HeadhunterStore.updateAndGetBlacklist(sheet);
      const existing = HeadhunterStore.loadDatabase(sheet);

      // 4. STORAGE MAINTENANCE
      const beforePrune = existing.size;
      existing.forEach((_, tag) => {
        if (blacklistResult.ids.has(tag)) existing.delete(tag);
      });
      const prunedCount = beforePrune - existing.size;

      // REPORT [2-4]: STATE & METRICS
      S.Reporting.logReport(`[2-4] STATE: Local Registry & Metrics`, [
        `NETWORK: ${S.Network.getWorkerSummary()}`,
        `CLAN:    ${members.length} Members | Entry Req: ${inGameRequirement}`,
        `POOL:    ${existing.size} Active | ${blacklistResult.ids.size} Blacklisted | ${prunedCount} Pruned`,
        `QUOTA:   ${remainingQuota} Remaining`
      ]);

      // 5. MEMBERSHIP VALIDATION
      const evtSheet = safeSheet(CONFIG.SHEETS.EVT);
      const logDismissal = (tag: string, score: number) => {
        evtSheet.appendRow([tag, new Date(), score]);
      };

      let joinedCount = 0;
      const tagsToCheck = Array.from(existing.keys());
      if (tagsToCheck.length > 0) {
        const batchSize = 25;
        for (let i = 0; i < tagsToCheck.length; i += batchSize) {
          const chunk = tagsToCheck.slice(i, i + batchSize);
          const profiles = S.Network.fetchRoyaleAPI(
            chunk.map((t) => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`)
          );
          profiles.forEach((p: any) => {
            if (p?.clan?.tag) {
              const recruit = existing.get(p.tag);
              if (recruit) logDismissal(p.tag, recruit.rawScore);
              existing.delete(p.tag);
              joinedCount++;
            }
          });
          SpreadsheetApp.flush();
        }
      }

      // [UPDATE] We can add joinedCount to the previous report or next one. 
      // The user draft has it in 'METRICS: Recruitment Health'.

      // 7. Scanner: Launch
      const discoveryFloor = Math.min(9000, inGameRequirement || 5000); 
      
      const scanned = HeadhunterScanner.scanTournaments(
        discoveryFloor,
        existing, 
        blacklistResult.ids,
        lowQuotaMode
      );

      const shadowCount = scanned.filter(s => s.source === "SHADOW").length;
      let newArrivals = 0;
      let updatedExisting = 0;
      scanned.forEach((c) => {
        if (existing.has(c.tag)) {
          c.foundDate = existing.get(c.tag)!.foundDate;
          updatedExisting++;
        } else {
          newArrivals++;
        }
        existing.set(c.tag, c);
      });

      // 8. ANALYSIS & ARCHIVE [8/9]
      const lbSheet = ss.getSheetByName(CONFIG.SHEETS.ROSTER);
      const clanEliteData: Array<{ rawScore: number; perfScore: number }> = [];
      
      if (lbSheet && lbSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
        const ssId = ss.getId();
        const sheetName = lbSheet.getName();
        const L = CONFIG.SCHEMA.ROSTER;
        const startRow = CONFIG.LAYOUT.DATA_START_ROW;
        const lastRow = lbSheet.getLastRow();
        
        const perfCol = String.fromCharCode(65 + 1 + L.PERF_SCORE); 
        const trophiesCol = String.fromCharCode(65 + 1 + L.TROPHIES);
        const donCol = String.fromCharCode(65 + 1 + L.TOTAL_DON);
        const historyCol = String.fromCharCode(65 + 1 + L.HISTORY);
    
        const ranges = [
          `'${sheetName}'!${perfCol}${startRow}:${perfCol}${lastRow}`,
          `'${sheetName}'!${trophiesCol}${startRow}:${trophiesCol}${lastRow}`,
          `'${sheetName}'!${donCol}${startRow}:${donCol}${lastRow}`,
          `'${sheetName}'!${historyCol}${startRow}:${historyCol}${lastRow}`
        ];
        
        const response = S.Network.fetchRoyaleAPI(ranges);
        if (response) {
          const perfs = response[0]?.values || [];
          const trophies = response[1]?.values || [];
          const dons = response[2]?.values || [];
          const histories = response[3]?.values || [];
    
          const currentWk = S.Time.calculateWarWeekId(new Date());

          for (let i = 0; i < perfs.length; i++) {
            const perf = Number(perfs[i] ? perfs[i][0] : 0);
            if (perf >= 50) {
              const histStr = String(histories[i] ? histories[i][0] : "");
              const hasRecentWar = histStr.includes(currentWk);
              const estimatedWarWins = 500; 

              const raw = S.Scoring.calculateRecruitRawScore(
                Number(trophies[i] ? trophies[i][0] : 0),
                Number(dons[i] ? dons[i][0] : 0),
                estimatedWarWins, 
                hasRecentWar,
                CONFIG.HEADHUNTER.WEIGHTS
              );
              clanEliteData.push({ rawScore: raw, perfScore: perf });
            }
          }
        }
      }

      const finalBenchmark = S.Scoring.calculateHybridBenchmark(clanEliteData, blacklistResult.entries);
      const allCandidates = Array.from(existing.values()).sort((a, b) => b.rawScore - a.rawScore);
      const targetLimit = CONFIG.HEADHUNTER.TARGET;
      const finalPool = allCandidates.slice(0, targetLimit);
      const droppedPool = allCandidates.slice(targetLimit);

      if (droppedPool.length > 0) {
        droppedPool.forEach(p => logDismissal(p.tag, p.rawScore));
      }
    
      finalPool.forEach(p => (p.potentialScore = S.Scoring.calculatePotentialScore(p.rawScore, finalBenchmark)));

      S.View.backupSheet(ss, CONFIG.SHEETS.HH);
      
      S.Reporting.logReport(`[8/9] ANALYSIS: Performance & Archive`, [
        `DISCOVERY: ${scanned.length} Scanned | ${shadowCount} Shadow Yield`,
        `BACKUP:    'Headhunter' Archives Rotated`
      ]);

      // 9. RENDER: Visual Sync [9/9]
      const hygieneSummary = S.View.enforceGlobalTabHygiene(ss);
      HeadhunterView.render(safeSheet(CONFIG.SHEETS.HH), finalPool, strategy.floor);

      S.Reporting.logReport(`[9/9] RENDER: Visual Sync`, [
        `HYGIENE: ${hygieneSummary}`,
        `ATOMIC:  ${finalPool.length} Candidates Synchronized`
      ]);

      // [SUMMARY]
      S.Reporting.logReport(`[SUMMARY] OPERATION SUCCESSFUL`, [
        `STRATEGY: ${strategy.method}`,
        `CAPACITY: [${members.length}] -> [${finalPool.length}/${targetLimit}]`,
        `DELTA:    +${newArrivals} Added | -${joinedCount} Joined | ~${updatedExisting} Updated`
      ]);

    } catch (e: any) {
      console.error(`CRITICAL FAILURE: ${e.message}\n${e.stack}`);
    }

    SpreadsheetApp.flush();
  }
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Headhunter;
}

(function(scope: any) {
  Object.assign(scope, { Headhunter, VER_HEADHUNTER });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

/**
 * GLOBAL BRIDGE (Legacy Support)
 * Preserves compatibility with existing GAS Triggers.
 */
function scoutRecruits() {
  Headhunter.scout();
}

export default Headhunter;
