
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
const VER_HEADHUNTER = "12.2.0";

export interface IHeadhunter {
  scout(): void;
}

const Headhunter: IHeadhunter = {
  scout(): void {
    const startTime = Date.now();
    console.info("HEADHUNTER: Starting Recruitment Pipeline");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const safeSheet = (name: string) => {
      let s = ss.getSheetByName(name);
      if (!s) {
         s = ss.insertSheet(name);
         Registry.Services.View.enforceGlobalTabHygiene();
      }
      return s;
    };

    let sheet = safeSheet(CONFIG.SHEETS.HH);
    Registry.Services.Schema.bootDynamicSchema();

    // 1. RUNTIME CONTEXT
    Registry.Services.Reporting.logReport("HEADHUNTER RUNTIME CONTEXT", [
      `VERSION:    ${VER_HEADHUNTER}`,
      `CLAN TAG:   ${CONFIG.SYSTEM.CLAN_TAG || "NOT_CONFIGURED"}`,
      `TARGET:     ${CONFIG.HEADHUNTER.TARGET} Recruits`,
      `BLACKLIST:  ${CONFIG.HEADHUNTER.BLACKLIST_DAYS} Days`,
      `MODE:        RAPID_GLOBAL_SCOUT`
    ]);

    if (!CONFIG.SYSTEM.CLAN_TAG) {
      console.error("CONFIGURATION ERROR: Missing CLAN_TAG. Aborting Headhunter Scout.");
      return;
    }

    try {
      // L1 CACHE PURGE: Ensure a fresh start for this execution
      Registry.Services.Network._clearCache();

      const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);

      // 2. RESOURCE HYDRATION (Baseline & Quota)
      Registry.Services.Reporting.logStep(1, 9, "Fetching clan baseline and quota...");
      const clanDetailResponse = Registry.Services.Network.fetchRoyaleAPI([
        `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}`,
      ]);

      let inGameRequirement = 0;
      let members: any[] = [];
      if (clanDetailResponse && clanDetailResponse[0]) {
        const clan = clanDetailResponse[0];
        inGameRequirement = clan.requiredTrophies || 0;
        members = clan.memberList || [];
      }

      const remaining = Registry.Services.Network.getRemainingQuota();
      if (remaining < 300) {
        console.warn(`QUOTA ALERT: Insufficient API capacity (${remaining}). Aborting.`);
        return;
      }
      const lowQuotaMode = remaining < 1000;

      // 3. STATE HYDRATION
      Registry.Services.Reporting.logStep(2, 9, "Loading local recruit state...");
      const strategy = Registry.Services.Scoring.calculateTrophyFloor(members, inGameRequirement);
      const blacklistResult = HeadhunterStore.updateAndGetBlacklist(sheet);
      const existing = HeadhunterStore.loadDatabase(sheet);

      // 4. STORAGE MAINTENANCE
      Registry.Services.Reporting.logStep(3, 9, "Executing Blacklist pruning...");
      const beforePrune = existing.size;
      existing.forEach((_, tag) => {
        if (blacklistResult.ids.has(tag)) existing.delete(tag);
      });
      const prunedCount = beforePrune - existing.size;

      // 5. MEMBERSHIP VALIDATION
      Registry.Services.Reporting.logStep(4, 9, "Validating current recruitment status...");
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
          const profiles = Registry.Services.Network.fetchRoyaleAPI(
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

      // REPORT: INGESTION METRICS
      Registry.Services.Reporting.logReport("PIPELINE HEALTH METRICS", [
        `CLAN MEMBERS:  ${members.length}`,
        `TROPHY FLOOR:  ${strategy.floor}`,
        `BLACKBOX SIZE: ${blacklistResult.ids.size}`,
        `PRUNED ENTRIES: ${prunedCount}`,
        `JOINED CLAN:    ${joinedCount}`,
        `ACTIVE POOL:   ${existing.size}`,
        `QUOTA REMAINING: ${remaining}`
      ]);

    // 7. Scanner: Launch
    const discoveryFloor = Math.min(9000, inGameRequirement || 5000); 
    Registry.Services.Reporting.logStep(7, 9, `Launching tournament scan (Floor: ${discoveryFloor})...`);
    
    // Safety check for empty scan when requirement is set too high
    if (discoveryFloor > 9000) {
      console.warn("Discovery Floor capped at 9,000 to match game limits.");
    }
    
    const scanned = HeadhunterScanner.scanTournaments(
      discoveryFloor,
      existing, // Used for War Score fallback
      blacklistResult.ids,
      lowQuotaMode
    );

    const shadowCount = scanned.filter(s => s.source === "SHADOW").length;
    
    // BLOCK LOG: Resource Metrics
    Registry.Services.Reporting.logReport("Discovery Phase", [
      `TARGET FLOOR: ${discoveryFloor}`,
      `SCANNED TOTAL: ${scanned.length}`,
      `SHADOW YIELD:  ${shadowCount}`,
      `PIPELINE:      ${lowQuotaMode ? 'QUOTA_GUARD' : 'UNRESTRICTED'}`
    ]);
    // 8. Merge
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

    // 9. Benchmarking (Hybrid)
    // ... (unchanged benchmarking logic) ...
    Registry.Services.Reporting.logStep(8, 9, "Calculating performance benchmarks...");
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
      
      const response = Sheets.Spreadsheets!.Values!.batchGet(ssId, { ranges });
      if (response.valueRanges) {
        const perfs = response.valueRanges[0].values || [];
        const trophies = response.valueRanges[1].values || [];
        const dons = response.valueRanges[2].values || [];
        const histories = response.valueRanges[3].values || [];
  
        const currentWk = Registry.Services.Time.calculateWarWeekId(new Date());

        for (let i = 0; i < perfs.length; i++) {
          const perf = Number(perfs[i] ? perfs[i][0] : 0);
          if (perf >= 50) {
            const histStr = String(histories[i] ? histories[i][0] : "");
            const hasRecentWar = histStr.includes(currentWk);
            const estimatedWarWins = 500; 

            const raw = Registry.Services.Scoring.calculateRecruitRawScore(
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

    // Benchmark Calculation
    const finalBenchmark = Registry.Services.Scoring.calculateHybridBenchmark(
        clanEliteData,
        blacklistResult.entries,
    );

    // 10. Filter & Score
    const allCandidates = Array.from(existing.values())
      .sort((a, b) => b.rawScore - a.rawScore);

    const targetLimit = CONFIG.HEADHUNTER.TARGET;
    const finalPool = allCandidates.slice(0, targetLimit);
    const droppedPool = allCandidates.slice(targetLimit);

    // SCORE PRESERVATION: Record scores for recruits dropped due to pool size
    if (droppedPool.length > 0) {
      console.info(`  Cleanup: Recording scores for ${droppedPool.length} overflow recruits for blacklisting.`);
      droppedPool.forEach(p => logDismissal(p.tag, p.rawScore));
    }
  
    if (finalPool.length === 0 && existing.size > 0) {
      console.warn("All recruits filtered by score or pool constraints.");
    }
  
    finalPool.forEach(
      (p) =>
        (p.potentialScore = Registry.Services.Scoring.calculatePotentialScore(
          p.rawScore,
          finalBenchmark,
        )),
    );

    // 11. Backup
    Registry.Services.View.backupSheet(ss, CONFIG.SHEETS.HH);

    // 12. View Render
    Registry.Services.Reporting.logStep(9, 9, "Applying visual render and cache synchronization...");
    HeadhunterView.render(safeSheet(CONFIG.SHEETS.HH), finalPool, strategy.floor);

    // 13. Report
    Registry.Services.Reporting.logReport(
      `HEADHUNTER v${VER_HEADHUNTER} REPORT`,
      [
        `OPERATION COMPLETE`,
        `TARGET QUOTA: ${CONFIG.HEADHUNTER.TARGET} Recruits`,
        `CURRENT POOL: ${finalPool.length} Qualified Members`,
        `TROPHY FLOOR: ${strategy.floor}`,
        `STRATEGY:     ${strategy.method}`,
        `─`,
        `SCAN ACQUISITIONS: ${scanned.length} Found`,
        `PIPELINE FLOW:    +${newArrivals} New, Updated: ${updatedExisting}`
      ]
    );
    console.info(`Headhunter Scout cycle finished successfully. Pool: ${finalPool.length}/${CONFIG.HEADHUNTER.TARGET}`);

    } catch (e: any) {
      console.warn(`Failed to refresh web payload: ${e.message}`);
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
