
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
const VER_HEADHUNTER = "14.3.3";

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
      const mathConfig = {
        ELITE_THRESHOLD: CONFIG.SYSTEM.ELITE_MEMBERSHIP_THRESHOLD,
        REBUILD_MIN_PERCENTILE: CONFIG.HEADHUNTER.REBUILD_MIN_PERCENTILE,
        BENCHMARK_CLAN_WEIGHT: CONFIG.HEADHUNTER.BENCHMARK_CLAN_WEIGHT,
        BENCHMARK_MARKET_WEIGHT: CONFIG.HEADHUNTER.BENCHMARK_MARKET_WEIGHT
      };

      // OVERRIDE: Allow explicit decoupling of Gatekeeping (In-Game) vs Recruiting (Headhunter)
      const overrideFloor = CONFIG.HEADHUNTER.MIN_TROPHIES;
      const effectiveRequirement = (overrideFloor > 0) ? overrideFloor : inGameRequirement;

      const strategy = S.Scoring.calculateTrophyFloor(members, effectiveRequirement, mathConfig);
      const blacklistResult = HeadhunterStore.updateAndGetBlacklist(sheet);
      
      const existingPool = HeadhunterStore.loadDatabase(sheet);
      const queuePool = HeadhunterStore.loadQueue(ss);
      
      // Merge for unified processing
      const combinedRegistry = new Map<string, Recruit>();
      existingPool.forEach(r => combinedRegistry.set(r.tag, r));
      queuePool.forEach(r => combinedRegistry.set(r.tag, r));

      // 4. STORAGE MAINTENANCE
      const beforePrune = combinedRegistry.size;
      combinedRegistry.forEach((_, tag) => {
        if (blacklistResult.ids.has(tag)) combinedRegistry.delete(tag);
      });
      const prunedCount = beforePrune - combinedRegistry.size;

      // REPORT [2-4]: STATE & METRICS
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

      // OPTIMIZATION: Sort FIRST, then only validate the Top 100 Candidates.
      // This prevents wasting quota on the tail end of the queue (500+ items).
      const sortedRegistry = Array.from(combinedRegistry.values()).sort((a, b) => b.rawScore - a.rawScore);
      const validationHead = sortedRegistry.slice(0, 100); 
      
      let joinedCount = 0;
      
      // DELTA-VALIDATION: Filter out candidates scanned recently (< 6 hours)
      // Active recruits (existingPool) are ALWAYS validated to ensure the UI is 100% fresh.
      // The 6-hour threshold applies ONLY to the bench/queue reservoir.
      const sixHoursAgo = Date.now() - (6 * 60 * 60 * 1000);
      const candidatesToValidate = validationHead.filter(r => {
        const isActiveRecruit = existingPool.has(r.tag);
        if (isActiveRecruit) return true; // Force validation for people on the main sheet
        return !r.lastScan || r.lastScan < sixHoursAgo; // 6h Delta for queue/bench
      });

      if (candidatesToValidate.length > 0) {
        // Network Layer handles the batching (upto 100 is safe for one call)
        const profiles = S.Network.fetchRoyaleAPI(
          candidatesToValidate.map((p) => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(p.tag)}`)
        );
        
        profiles.forEach((p: any) => {
          if (p?.clan?.tag) {
             const recruit = combinedRegistry.get(p.tag);
             if (recruit) logDismissal(p.tag, recruit.rawScore);
             combinedRegistry.delete(p.tag);
             joinedCount++;
          } else if (p && p.tag) {
             // UPDATE FRESHNESS
             const recruit = combinedRegistry.get(p.tag);
             if (recruit) recruit.lastScan = Date.now();
          }
        });
        
        S.Reporting.logReport(`[5/9] VALIDATION: Live Membership Verification`, [
          `VERIFY: ${candidatesToValidate.length} candidates checked`,
          `EXEMPT: ${validationHead.length - candidatesToValidate.length} verified recently (skipped)`,
          `JOINED: ${joinedCount} candidates discovered in other clans and removed`
        ]);
      } else {
        S.Reporting.logReport(`[5/9] VALIDATION: Live Membership Verification`, [
          `STATUS: All candidates recently verified. Skipping remote check.`
        ]);
      }

      // [UPDATE] We can add joinedCount to the previous report or next one. 
      // The user draft has it in 'METRICS: Recruitment Health'.

      // 7. Scanner: Launch
      const H = CONFIG.HEADHUNTER.STRATEGY;
      
      const scanned = HeadhunterScanner.scanTournaments(
        effectiveRequirement,
        combinedRegistry, 
        blacklistResult.ids,
        lowQuotaMode
      );

      let newArrivals = 0;
      let updatedExisting = 0;
      
      scanned.forEach((c) => {
        if (combinedRegistry.has(c.tag)) {
          c.foundDate = combinedRegistry.get(c.tag)!.foundDate;
          updatedExisting++;
        } else {
          newArrivals++;
        }
        combinedRegistry.set(c.tag, c);
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

          // Build correlation map for API stats
          const liveMemberMap = new Map<string, any>();
          members.forEach((m: any) => liveMemberMap.set(m.tag, m));

          for (let i = 0; i < perfs.length; i++) {
            const perf = Number(perfs[i] ? perfs[i][0] : 0);
            if (perf >= H.PERFORMANCE_BENCHMARK_MIN) {
              const tag = String(tags[i] ? tags[i][0] : "");
              const liveStats = liveMemberMap.get(tag);
              
              const histStr = String(histories[i] ? histories[i][0] : "");
              const hasRecentWar = histStr.includes(currentWk);
              
              // DATA-DRIVEN REFINEMENT: Use actual API warWins if available, fallback to 0. 
              // Zero tolerance for hardcoded baselines.
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

      S.Reporting.logReport(`[8/9] ANALYSIS: Performance & Reserve Management`, [
        `DISCOVERY: ${scoutCount} from tournaments | ${shadowCount} from shadows`,
        `RESERVE:   ${queueRes.count} benched | ${queueRes.pruned} overflowed`,
        `STORAGE:   '${CONFIG.SHEETS.HH}' sheet backed up`
      ]);

      // 9. RENDER: Visual Sync [9/9]
      const hygieneSummary = S.View.enforceGlobalTabHygiene(ss);
      HeadhunterView.render(safeSheet(CONFIG.SHEETS.HH), finalPool, strategy.floor);

      S.Reporting.logReport(`[9/9] RENDER: Visual Sync`, [
        `HYGIENE: ${hygieneSummary}`,
        `DISPLAY: ${finalPool.length} candidates updated in sheet`
      ], 150);

      // [SUMMARY]
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
 * Preserves compatibility with existing GAS Triggers.
 */
function scoutRecruits() {
  Headhunter.scout();
}

export default Headhunter;
