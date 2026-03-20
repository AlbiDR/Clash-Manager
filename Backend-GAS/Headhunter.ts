import { CONFIG } from './Configuration';
import Registry from './Registry';
import HeadhunterStore from './Headhunter_Store';
import HeadhunterScanner from './Headhunter_Scanner';
import HeadhunterView from './Headhunter_View';
import BattleLog from './Battle_Log';
import type { Recruit } from './Headhunter_Types';

/**
 * ============================================================================
 * MODULE: HEADHUNTER (Recruitment Controller)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: High-level orchestration for the Recruitment scout.
 *    Coordinates discovery, validation, and visual rendering.
 * ============================================================================
 */

export const VER_HEADHUNTER = "14.3.5";

declare var SpreadsheetApp: any;

export interface HeadhunterContract {
  executeRecruitScout(options?: { lowQuotaMode?: boolean }): void;
}

const Headhunter: HeadhunterContract = {
  executeRecruitScout(options: { lowQuotaMode?: boolean } = {}): void {
    const S = Registry.Services;
    const lowQuotaMode = options.lowQuotaMode || false;
    
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.HH);
      if (!sheet) throw new Error(`CRITICAL: '${CONFIG.SHEETS.HH}' sheet not found.`);

      const safeSheet = (name: string) => ss.getSheetByName(name) || ss.insertSheet(name);

      // 1. INITIALIZATION & METRICS [1/8]
      const startTime = Date.now();
      const members: any[] = S.Network.fetchRoyaleAPI([`${CONFIG.SYSTEM.API_BASE}/clans/${encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG)}/members`])[0]?.items || [];
      const remainingQuota = 50 - members.length;

      // 2. STRATEGY ALIGNMENT
      // High-resolution scouting requires at least 5 open slots.
      // If the clan is near capacity, we switch to "Maintenance Mode".
      const isFull = members.length >= 48;
      const strategy = isFull
        ? { method: "MAINTENANCE", floor: 9000 }
        : { method: "DISCOVERY", floor: 0 };

      // 3. LOAD REGISTRY
      const mathConfig = {
         percentile: CONFIG.HEADHUNTER.BENCHMARK_PERCENTILE,
         decay: CONFIG.HEADHUNTER.BENCHMARK_DECAY,
         minPool: CONFIG.HEADHUNTER.BENCHMARK_MIN_POOL
      };

      const inGameRequirement = S.Scoring.calculateClanTrophyFloor(members, strategy.floor);
      const effectiveRequirement = S.Scoring.calculateEffectiveScoutFloor(inGameRequirement, mathConfig);
      const blacklistResult = HeadhunterStore.updateAndGetBlacklist(sheet);
      
      const existingPool = HeadhunterStore.loadDatabase(sheet);
      const queuePool = HeadhunterStore.loadQueue(ss);
      
      const combinedRegistry = new Map<string, Recruit>();
      existingPool.forEach(r => combinedRegistry.set(S.Core.normalizeTag(r.tag), r));
      queuePool.forEach(r => combinedRegistry.set(S.Core.normalizeTag(r.tag), r));

      // 4. STORAGE MAINTENANCE
      const beforePrune = combinedRegistry.size;
      combinedRegistry.forEach((_, tag) => {
        if (blacklistResult.ids.has(tag)) combinedRegistry.delete(tag);
      });
      const prunedCount = beforePrune - combinedRegistry.size;

      S.Reporting.logReport(`[2-4] STATE: Local Registry & Metrics`, [
        `NETWORK: ${S.Network.getWorkerSummary()}`,
        `CLAN:    ${members.length} Members | Entry Req: ${inGameRequirement} (Scouting Floor: ${effectiveRequirement})`,
        `POOL:    ${existingPool.size} Active | ${queuePool.size} Queued | ${prunedCount} Removed`,
        `QUOTA:   ${remainingQuota} Remaining`
      ]);

      // 5. MEMBERSHIP VALIDATION (Smart Lazy Loader)
      const evtSheet = safeSheet(CONFIG.SHEETS.EVT);
      const logDismissal = (tag: string, score: number) => {
        evtSheet.appendRow([tag, Date.now(), score]);
      };

      const sortedRegistry = Array.from(combinedRegistry.values()).sort((a, b) => b.rawScore - a.rawScore);
      const validationHead = sortedRegistry.slice(0, 100); 
      
      let joinedCount = 0;
      
      const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
      const candidatesToValidate = validationHead.filter(r => {
        const tag = S.Core.normalizeTag(r.tag);
        const isActiveRecruit = existingPool.has(tag);
        if (isActiveRecruit) return true;
        return !r.lastScan || r.lastScan < sixHoursAgo;
      });

      if (candidatesToValidate.length > 0) {
        const profiles = S.Network.fetchRoyaleAPI(
          candidatesToValidate.map((p) => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(p.tag)}`)
        );
        
        profiles.forEach((p: any) => {
          if (p?.clan?.tag) {
             const tag = S.Core.normalizeTag(p.tag);
             const recruit = combinedRegistry.get(tag);
             if (recruit) logDismissal(tag, recruit.rawScore);
             combinedRegistry.delete(tag);
             joinedCount++;
          } else if (p && p.tag) {
             const tag = S.Core.normalizeTag(p.tag);
             const recruit = combinedRegistry.get(tag);
             if (recruit) recruit.lastScan = Date.now();
          }
        });
        
        S.Reporting.logReport(`[5/8] VALIDATION: Live Membership Verification`, [
          `VERIFY: ${candidatesToValidate.length} candidates checked`,
          `EXEMPT: ${validationHead.length - candidatesToValidate.length} verified recently (skipped)`,
          `JOINED: ${joinedCount} candidates discovered in other clans and removed`
        ]);
      } else {
        S.Reporting.logReport(`[5/8] VALIDATION: Live Membership Verification`, [
          `STATUS: All candidates recently verified. Skipping remote check.`
        ]);
      }

      // 6. Scanner: Launch
      const scanned = HeadhunterScanner.scanTournaments(
        effectiveRequirement,
        combinedRegistry, 
        blacklistResult.ids,
        lowQuotaMode
      );

      let newArrivals = 0;
      let updatedExisting = 0;
      
      scanned.forEach((c) => {
        const tag = S.Core.normalizeTag(c.tag);
        if (combinedRegistry.has(tag)) {
          c.foundDate = combinedRegistry.get(tag)!.foundDate;
          updatedExisting++;
        } else {
          newArrivals++;
        }
        combinedRegistry.set(tag, c);
      });

      // 7. ANALYSIS & ARCHIVE [7/8]
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
        const tagCol = String.fromCharCode(65 + 1 + L.TAG);

        const ranges = [
          `'${sheetName}'!${perfCol}${startRow}:${perfCol}${lastRow}`,
          `'${sheetName}'!${ trophiesCol}${startRow}:${trophiesCol}${lastRow}`,
          `'${sheetName}'!${donCol}${startRow}:${donCol}${lastRow}`,
          `'${sheetName}'!${historyCol}${startRow}:${historyCol}${lastRow}`,
          `'${sheetName}'!${tagCol}${startRow}:${tagCol}${lastRow}`
        ];
        
        const response = S.Network.fetchRoyaleAPI(ranges);
        if (response) {
          const perfs = response[0]?.values || [];
          const trophies = response[1]?.values || [];
          const dons = response[2]?.values || [];
          const histories = response[3]?.values || [];
          const tags = response[4]?.values || [];

          const currentWk = S.Time.calculateWarWeekId(new Date());

          const liveMemberMap = new Map<string, any>();
          members.forEach((m: any) => liveMemberMap.set(S.Core.normalizeTag(m.tag), m));

          for (let i = 0; i < perfs.length; i++) {
            const perf = Number(perfs[i] ? perfs[i][0] : 0);
            if (perf >= CONFIG.HEADHUNTER.STRATEGY.PERFORMANCE_BENCHMARK_MIN) {
              const tag = S.Core.normalizeTag(String(tags[i] ? tags[i][0] : ""));
              const liveStats = liveMemberMap.get(tag);
              
              const histStr = String(histories[i] ? histories[i][0] : "");
              const hasRecentWar = histStr.includes(currentWk);
              
              const actualWarWins = liveStats ? (liveStats.warDayWins || 0) : 0;

              const raw = S.Scoring.calculateRecruitRawScore(
                Number(trophies[i] ? trophies[i][0] : 0),
                Number(dons[i] ? dons[i][0] : 0),
                actualWarWins, 
                hasRecentWar,
                CONFIG.HEADHUNTER.WEIGHTS
              );
              clanEliteData.push({ rawScore: raw, perfScore: perf });
            }
          }
        }
      }

      const finalBenchmark = S.Scoring.calculateHybridBenchmark(clanEliteData, blacklistResult.entries, mathConfig);
      const allSorted = Array.from(combinedRegistry.values()).sort((a, b) => b.rawScore - a.rawScore);
      
      const targetActive = CONFIG.HEADHUNTER.TARGET;
      const finalPool = allSorted.slice(0, targetActive);
      const queueList = allSorted.slice(targetActive);
    
      finalPool.forEach(p => (p.potentialScore = S.Scoring.calculatePotentialScore(p.rawScore, finalBenchmark)));
      queueList.forEach(p => (p.potentialScore = S.Scoring.calculatePotentialScore(p.rawScore, finalBenchmark)));

      const backupSummary = S.View.backupSheet(ss, CONFIG.SHEETS.HH);
      const queueRes = HeadhunterStore.saveQueue(ss, queueList);
      
      const scoutCount = scanned.filter(s => s.source === "TOURNAMENT").length;
      const shadowCount = scanned.filter(s => s.source === "SHADOW").length;

      S.Reporting.logReport(`[7/8] ANALYSIS: Performance & Reserve Management`, [
        `DISCOVERY: ${scoutCount} from tournaments | ${shadowCount} from shadows`,
        `RESERVE:   ${queueRes.count} benched | ${queueRes.pruned} overflowed`,
        `STORAGE:   '${CONFIG.SHEETS.HH}' sheet backed up`
      ]);

      const hygieneSummary = S.View.enforceGlobalTabHygiene(ss);
      HeadhunterView.render(safeSheet(CONFIG.SHEETS.HH), finalPool, strategy.floor);

      S.Reporting.logReport(`[8/8] RENDER: Visual Sync`, [
        `HYGIENE: ${hygieneSummary}`,
        `DISPLAY: ${finalPool.length} candidates updated in sheet`
      ], 150);

      S.Reporting.logReport(`[SUMMARY] OPERATION SUCCESSFUL`, [
        `STRATEGY: ${strategy.method}`,
        `CAPACITY: [${members.length}/50] clan capacity used`,
        `DELTA:    +${newArrivals} new | -${joinedCount} joined others | ~${updatedExisting} updated`
      ]);

    } catch (e: any) {
      console.error(`CRITICAL FAILURE: ${e.message}\n${e.stack}`);
    }

    SpreadsheetApp.flush();
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = Headhunter;
}

(function(scope: any) {
  Object.assign(scope, { Headhunter, VER_HEADHUNTER });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

/**
 * GLOBAL BRIDGE (Legacy Support)
 */
function scoutRecruits() {
  Headhunter.executeRecruitScout();
}

export default Headhunter;
