
import { CONFIG } from './Configuration';
import Registry from './Registry';
import HeadhunterStrategy from './Headhunter_Strategy';
import HeadhunterStore from './Headhunter_Store';
import HeadhunterScanner from './Headhunter_Scanner';
import HeadhunterView from './Headhunter_View';
import type { Recruit } from './Headhunter_Types';

declare var SpreadsheetApp: any;
declare var Sheets: any;
declare function refreshWebPayload(): void;

/**
 * ============================================================================
 * 🔭 MODULE: HEADHUNTER (Core Orchestrator)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: The Director of the Recruitment Pipeline.
 *    Orchestrates: Strategy -> Store -> Scanner -> View.
 * 🏷️ VERSION: 12.0.0 (Atomic Refactor)
 * ============================================================================
 */

export interface IHeadhunter {
  scout(): void;
}

const Headhunter: IHeadhunter = {
  scout(): void {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const safeSheet = (name: string) => {
      let s = ss.getSheetByName(name);
      if (!s) {
         console.info(`[1/9] Sheet '${name}' not found. Creating new sheet...`);
         SpreadsheetApp.flush();
         s = ss.getSheetByName(name) || ss.insertSheet(name);
      }
      return s;
    };

    console.info(`🚀 Starting Headhunter Scout Pipeline (v12.0.0)...`);
    let sheet = safeSheet(CONFIG.SHEETS.HH);
    Registry.Services.View.setStatusMessage(sheet, "⏳ Initializing...");

    // ⚡ DYNAMIC SYNC
    Registry.Services.Core.logStep(2, 9, "Syncing Dynamic Schema indices...");
    Registry.Services.Schema.bootDynamicSchema();

    // 🛡️ CONFIGURATION CHECK
    if (!CONFIG.SYSTEM.CLAN_TAG) {
      console.error("❌ [CONFIG] CLAN_TAG is not configured. Aborting Headhunter Scout.");
      sheet.getRange("B1").setValue("⚠️ Configuration Error: Missing CLAN_TAG");
      return;
    }

    const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);

    // 1. Establish Baseline via Clan Detail
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

    // 2. Strategy Calculation
    const strategy = HeadhunterStrategy.calculateTrophyFloor(members, inGameRequirement);
    console.info(`  └─ Strategy Active: ${strategy.method} -> Floor: ${strategy.floor}`);

    // 3. Quota Check
    const remaining = Registry.Services.Network.getRemainingQuota();
    if (remaining < 300) {
      console.warn(`⚠️ [QUOTA] Insufficient API quota (${remaining} remaining). Aborting scout.`);
      sheet.getRange("B1").setValue(`⚠️ Scouting Paused (Quota Low: ${remaining})`);
      return;
    }
    const lowQuotaMode = remaining < 1000;
    if (lowQuotaMode) {
      console.info(`⚡ [QUOTA] Low quota mode activated (${remaining} remaining). Scan will be throttled.`);
    }

    // 4. Store: Blacklist & Load
    Registry.Services.Core.logStep(3, 9, "Processing Headhunter Blacklist...");
    const blacklistResult = HeadhunterStore.updateAndGetBlacklist(safeSheet(CONFIG.SHEETS.HH));

    Registry.Services.Core.logStep(4, 9, "Loading existing recruit database...");
    const existing = HeadhunterStore.loadDatabase(safeSheet(CONFIG.SHEETS.HH));

    // 5. Store: Prune Blacklisted
    const beforePrune = existing.size;
    existing.forEach((_, tag) => {
      if (blacklistResult.ids.has(tag)) existing.delete(tag);
    });
    const prunedCount = beforePrune - existing.size;
    Registry.Services.Core.logStep(5, 9, `Database filtered: ${existing.size} survivors (${prunedCount} blacklisted removed).`);

    // 6. Network: Prune Joined (Clanless Check)
    let joinedCount = 0;
    const tagsToCheck = Array.from(existing.keys());
    if (tagsToCheck.length > 0) {
      Registry.Services.Core.logStep(6, 9, `Verifying clan status for ${tagsToCheck.length} survivors...`);
      const profiles = Registry.Services.Network.fetchRoyaleAPI(
        tagsToCheck.map((t) => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`)
      );
      profiles.forEach((p: any) => {
        if (p && p.clan && p.clan.tag) {
          existing.delete(p.tag);
          joinedCount++;
        }
      });
      if (joinedCount > 0) {
        console.info(`  └─ Cleanup: Removed ${joinedCount} recruit${joinedCount > 1 ? 's' : ''} who joined a clan.`);
      }
    }

    // 7. Scanner: Launch
    const minTrophies = strategy.floor;
    Registry.Services.Core.logStep(7, 9, `Launching Tournament Scan (MinTrophies: ${minTrophies})...`);
    
    // Pass strategy-derived minTrophies to scanner
    const scanned = HeadhunterScanner.scanTournaments(
      minTrophies,
      existing, // Used for War Score fallback
      blacklistResult.ids,
      lowQuotaMode
    );
    console.info(`  └─ Scan Result: Located ${scanned.length} potential candidate${scanned.length !== 1 ? 's' : ''}.`);

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
    Registry.Services.Core.logStep(8, 9, "Calculating Performance Benchmarks...");
    const lbSheet = ss.getSheetByName(CONFIG.SHEETS.LB);
    const clanEliteData: Array<{ rawScore: number; perfScore: number }> = [];
    
    if (lbSheet && lbSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
      const ssId = ss.getId();
      const sheetName = lbSheet.getName();
      const L = CONFIG.SCHEMA.LB;
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
  
        for (let i = 0; i < perfs.length; i++) {
          const perf = Number(perfs[i] ? perfs[i][0] : 0);
          if (perf >= 50) {
            const histStr = String(histories[i] ? histories[i][0] : "");
            const currentWk = Registry.Services.Time.calculateWarWeekId(new Date());
            const hasRecentWar = histStr.includes(currentWk);
  
            const raw = Registry.Services.ScoringSystem.calculateRecruitRawScore(
              Number(trophies[i] ? trophies[i][0] : 0),
              Number(dons[i] ? dons[i][0] : 0),
              0, 
              hasRecentWar,
              CONFIG.HEADHUNTER.WEIGHTS
            );
            clanEliteData.push({ rawScore: raw, perfScore: perf });
          }
        }
        if (clanEliteData.length > 0) {
          console.info(`  └─ Benchmarking: Ingested ${clanEliteData.length} elite clan performance sample${clanEliteData.length !== 1 ? 's' : ''}.`);
        }
      }
    }

    // Benchmark Calculation
    const finalBenchmark = Registry.Services.ScoringSystem.calculateHybridBenchmark(
        clanEliteData,
        blacklistResult.entries,
    );

    // 10. Filter & Score
    const rawPool = Array.from(existing.values())
      .filter(p => p.trophies >= minTrophies)
      .sort((a, b) => b.rawScore - a.rawScore);
  
    const target = CONFIG.HEADHUNTER.TARGET;
    const finalPool = rawPool.slice(0, target);
  
    if (finalPool.length === 0 && rawPool.length === 0 && existing.size > 0) {
      console.warn("⚠️ [FILTER] All recruits filtered by Trophy Floor.");
    }
  
    finalPool.forEach(
      (p) =>
        (p.potentialScore = Registry.Services.ScoringSystem.calculatePotentialScore(
          p.rawScore,
          finalBenchmark,
        )),
    );

    // 11. Backup
    Registry.Services.View.backupSheet(ss, CONFIG.SHEETS.HH);

    // 12. View Render
    Registry.Services.Core.logStep(9, 9, "Preparing final render and cache updates...");
    HeadhunterView.render(safeSheet(CONFIG.SHEETS.HH), finalPool, strategy.floor);

    // 13. Report
    Registry.Services.Core.logReport(
      `🔭 HEADHUNTER v12.0.0 REPORT`,
      [
        `OPERATION COMPLETE`,
        `TARGET QUOTA: ${target} Recruits`,
        `CURRENT POOL: ${finalPool.length} Qualified Members`,
        `TROPHY FLOOR: ${minTrophies}`,
        `STRATEGY:     ${strategy.method}`,
        `─`.repeat(63),
        `SCAN ACQUISITIONS: ${scanned.length} Found`,
        `PIPELINE FLOW:    +${newArrivals} New | ↻${updatedExisting} Updated`
      ]
    );
    console.info(`✅ Headhunter Scout cycle finished successfully. Pool: ${finalPool.length}/${target}`);

    try {
      if (typeof refreshWebPayload === "function") refreshWebPayload();
    } catch (e: any) {
      console.warn(`⚠️ [SYNC] Failed to refresh web payload: ${e.message}`);
    }

    SpreadsheetApp.flush();
  }
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Headhunter;
}

/**
 * 🌍 GLOBAL BRIDGE (Legacy Support)
 * Preserves compatibility with existing GAS Triggers.
 */
function scoutRecruits() {
  Headhunter.scout();
}

export default Headhunter;
