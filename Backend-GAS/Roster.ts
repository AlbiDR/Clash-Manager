import { CONFIG } from './Configuration';
import Registry from './Registry';
import { PlayerResult, ClanMemberResult, RosterContract } from './Roster_Types';
import RosterStore from './Roster_Store';
import RosterView from './Roster_View';

declare var SpreadsheetApp: any;
declare var Sheets: any;

/**
 * ============================================================================
 * MODULE: ROSTER (Leaderboard & Roster Management)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: The "Commander" of the Leaderboard refresh pipeline.
 * Orchestrates the full ETL lifecycle for member data, from live API
 * ingestion to historical scoring and visual rendering.
 *
 * ARCHITECTURE:
 *    - Resource Hydration: Re-syncs previous momentum and war history.
 *    - API Intelligence: Ingests live clan data via the Network service.
 *    - Scoring & Normalization: Executes the scoring kernel and scales results.
 *    - Visual Rendering: Direct manipulation of Google Sheets for the UI.
 *
 * ROLE: The Commander (Orchestrator).
 * VERSION: 13.1.0
 * ============================================================================
 */
const Roster: RosterContract = {
  /**
   * MAIN ENTRY: Update Roster
   *
   * @remarks
   * Executes the full Leaderboard synchronization pipeline:
   * 1. Hydrate: Loads previous state and historical context.
   * 2. Ingest: Fetches live data from Royale API.
   * 3. Score: Calculates multi-dimensional performance metrics.
   * 4. Normalize: Scales scores against the current elite average.
   * 5. Render: Updates the Google Sheet with pixel-perfect visuals.
   *
   * @warning
   * Consumes significant UrlFetchApp and CacheService quotas during API ingestion
   * and state persistence.
   */
  synchronizeLeaderboard(): void {
    const startTime = Date.now();
    console.info("ROSTER: Starting Leaderboard Refresh Pipeline");

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEETS.ROSTER);
    if (!sheet) {
      sheet = ss.insertSheet(CONFIG.SHEETS.ROSTER);
      Registry.Services.View.enforceGlobalTabHygiene();
    }

    // 1. RUNTIME CONTEXT
    Registry.Services.Schema.bootDynamicSchema();
    const L = CONFIG.SCHEMA.ROSTER;

    Registry.Services.Reporting.logReport("ROSTER RUNTIME CONTEXT", [
      `VERSION:    ${VER_ROSTER}`,
      `CLAN TAG:   ${CONFIG.SYSTEM.CLAN_TAG || "NOT_CONFIGURED"}`,
      `DATA START: Row ${CONFIG.LAYOUT.DATA_START_ROW}`,
      `MODE:        FULL_RECALCULATION`
    ]);

    if (!CONFIG.SYSTEM.CLAN_TAG) {
      console.error("CONFIGURATION ERROR: Missing CLAN_TAG. Aborting Roster Update.");
      return;
    }

    try {
      // 2. RESOURCE HYDRATION
      Registry.Services.Reporting.logStep(1, 6, "Hydrating Momentum & Heritage Data...");
      const previousScores = RosterStore.loadPreviousScores(sheet, L);
      const warHistoryMap = RosterStore.rehydrateWarHistory(sheet, L);
      const recruitCache = RosterStore.getProphetCache();
      const marketIntelligence = RosterStore.loadMarketIntelligence();

      // 3. API DATA ACQUISITION
      Registry.Services.Reporting.logStep(2, 6, "Ingesting Live API Intelligence...");
      const apiStart = Date.now();
      const clanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
      const { members, race, history: remoteHistory } = Registry.Services.Network.fetchClanDataSmart(clanTag);
      const apiDuration = Date.now() - apiStart;

      if (!members || !members.items) {
          console.error("CIRCUIT BREAKER: API returned invalid data. Terminating Pipeline.");
          return;
      }

      const now = new Date();
      const currentWeekId = Registry.Services.Time.calculateWarWeekId(now);
      
      // War History Reconciliation
      // Intent: Blending ephemeral API history with local persistent maps.
      // We use Math.max to ensure that if the same week is reported by both
      // the remote history and the live participants list, we retain the
      // most complete fame value (preventing data loss from API lag).
      const addWarEntry = (tag: string, weekId: string, fame: number) => {
        const cleanTag = (tag.startsWith("#") ? tag : "#" + tag).trim().toUpperCase();

        // --- TENURE CONSTRAINT ---
        // Reject any API or Database history prior to the player's First Seen date in the DB.
        const dbRecord = marketIntelligence.get(cleanTag);
        const cutoffWeekId = dbRecord?.firstSeen 
          ? Registry.Services.Time.calculateWarWeekId(dbRecord.firstSeen) 
          : currentWeekId;
          
        if (weekId < cutoffWeekId) return;

        if (!warHistoryMap.has(cleanTag)) warHistoryMap.set(cleanTag, new Map());
        const userMap = warHistoryMap.get(cleanTag)!;
        userMap.set(weekId, Math.max(userMap.get(weekId) || 0, fame));
      };

      if (remoteHistory) {
        Object.keys(remoteHistory).forEach(tag => {
          const h = (remoteHistory as any)[tag];
          Object.keys(h).forEach(weekId => addWarEntry(tag, weekId, h[weekId]));
        });
      }

      if (race?.clan?.participants) {
        race.clan.participants.forEach((p: any) => {
          addWarEntry(p.tag, currentWeekId, Registry.Services.Scoring.resolveWarFame(p));
        });
      }

      // 3B. DATABASE HISTORY RECONCILIATION
      // Intent: Fetching long-term memory for players that exceeds the 52-week API window.
      marketIntelligence.forEach((intel, tag) => {
        if (intel.fameHistory) {
          intel.fameHistory.forEach((fame: number, weekId: string) => {
            // Rationale: Database is used as the ultimate archive.
            // addWarEntry uses Math.max to ensure we keep the highest reported fame
            // for a given week, even if it comes from an old DB snapshot.
            addWarEntry(tag, weekId, fame);
          });
        }
      });

      // 4. PERFORMANCE SCORING KERNEL
      Registry.Services.Reporting.logStep(3, 6, "Executing Cumulative Scoring Engine...");
      const rawResults: PlayerResult[] = [];
      const activeMembers = members.items as ClanMemberResult[];

      activeMembers.forEach(m => {
        const cleanMemberTag = (m.tag.startsWith("#") ? m.tag : "#" + m.tag).trim().toUpperCase();
        const pWarHistory = warHistoryMap.get(cleanMemberTag) || new Map<string, number>();
        const lastSeen = Registry.Services.Time.parseRoyaleApiDate(m.lastSeen);
        const dbRecord = marketIntelligence.get(cleanMemberTag);

        // --- TENURE CONSTRAINT ---
        // Prune any legacy history that might have existed in the Leaderboard sheet
        // but predates the active DB tenure.
        const cutoffWeekId = dbRecord?.firstSeen 
            ? Registry.Services.Time.calculateWarWeekId(dbRecord.firstSeen) 
            : currentWeekId;
            
        for (const week of Array.from(pWarHistory.keys())) {
            if (week < cutoffWeekId) {
                pWarHistory.delete(week);
            }
        }

        const currentFame = pWarHistory.get(currentWeekId) || 0;

        let daysTracked = 0;
        let totalDonations = 0;

        if (dbRecord) {
          const diffTime = Math.abs(now.getTime() - dbRecord.firstSeen.getTime());
          daysTracked = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
          const liveMax = Math.max(dbRecord.weeklyMax.get(currentWeekId) || 0, m.donations || 0);
          dbRecord.weeklyMax.set(currentWeekId, liveMax);
          dbRecord.weeklyMax.forEach((val: number) => totalDonations += val);
        } else {
          totalDonations = m.donations || 0;
        }

        const avgDailyDonations = daysTracked > 0 ? Math.round(totalDonations / daysTracked) : (m.donations || 0);
        let totalHistoryFame = 0;
        pWarHistory.forEach(val => totalHistoryFame += Number(val) || 0);
        
        const eligibleWeeks = dbRecord?.battleWeeks?.size || 0;
        // WEEKS IN CLAN (Normalization Baseline)
        // Rationale: Blending multiple time-based signals to create a fair
        // denominator for historical averaging. This prevents "averaging amnesia"
        // for long-term members whose early history might have been pruned
        // from the live Royale API war log.
        const weeksInClan = Math.max(1, Math.ceil(daysTracked / 7), pWarHistory.size, eligibleWeeks);
        const avgWarFame = Math.round(totalHistoryFame / weeksInClan);

        const warRateVal = Registry.Services.Scoring.calculateWarRate(
          dbRecord?.totalBattleCredits ?? 0,
          dbRecord?.discoveredBattleDays?.size ?? 0
        );

        const cachedIntel = recruitCache.get(m.tag);
        const scores = Registry.Services.Scoring.computeScores(
          currentFame, avgWarFame, avgDailyDonations, m.trophies || 0,
          warRateVal, lastSeen.getTime(), now.getTime(),
          cachedIntel ? cachedIntel.wins : 0,
          currentFame > 0 || (cachedIntel ? cachedIntel.active : false),
          daysTracked
        );

        rawResults.push({
          member: m,
          tag: m.tag,
          name: m.name,
          role: m.role,
          trophies: m.trophies || 0,
          daysTracked,
          avgDailyDonations,
          totalDonations,
          lastSeen,
          warRateVal,
          avgWarFame,
          historyString: Array.from(pWarHistory.entries())
            .sort((a,b) => b[0].localeCompare(a[0]))
            .map(([wk,f]) => `${f} ${wk}`)
            .join(" | "),
          scores,
          cleanKey: m.tag.replace("#", "").trim().toLowerCase()
        });
      });

      // 5. NORMALIZATION & RANKING
      Registry.Services.Reporting.logStep(4, 6, "Normalizing Elite Benchmarks...");

      // ELITE AVERAGE CALCULATION (PeS Normalization)
      // Intent: We identify the top-performing member's RPeS to act as the
      // 100% benchmark for PeS normalization. This ensures the leaderboard remains a "relative curve"
      // based on current clan performance rather than a static goalpost.
      let maxPerfScore = 0;
      rawResults.forEach(r => { if (r.scores.perf > maxPerfScore) maxPerfScore = r.scores.perf; });

      const finalRows = rawResults.map(r => {
        // SCALING: Convert RPeS into a relative PeS (0-100%).
        const normPerf = Registry.Services.Scoring.calculatePotentialScore(r.scores.perf, maxPerfScore);
        const trend = previousScores.has(r.cleanKey) ? r.scores.raw - previousScores.get(r.cleanKey)! : 0;
        
        const row = new Array(Object.keys(CONFIG.SCHEMA.ROSTER_HEADERS).length).fill("");
        row[L.TAG] = r.tag;
        row[L.NAME] = r.name;
        row[L.ROLE] = r.role;
        row[L.TROPHIES] = r.trophies;
        row[L.DAYS] = r.daysTracked;
        row[L.WEEKLY_REQ] = r.member.donationsReceived;
        row[L.AVG_DAY] = r.avgDailyDonations;
        row[L.TOTAL_DON] = r.totalDonations;
        row[L.LAST_SEEN] = Registry.Services.Time.formatDate(r.lastSeen);
        row[L.WAR_RATE] = r.warRateVal / 100;
        row[L.HISTORY] = r.historyString;
        row[L.RAW_SCORE] = r.scores.raw;
        row[L.PERF_SCORE] = normPerf;
        row[L.TREND] = trend;
        row[L.AVG_WAR_FAME] = r.avgWarFame;
        return row;
      });

      finalRows.sort(Registry.Services.Scoring.comparator);

      // VISUAL HYGIENE (Padding)
      // Intent: Enforcing a consistent 50-row pool for visual stability.
      // Prevents the Google Sheet's UI (conditional formatting, borders)
      // from collapsing if the clan is under-populated.
      while (finalRows.length < 50) finalRows.push(new Array(Object.keys(CONFIG.SCHEMA.ROSTER_HEADERS).length).fill(""));

      // 6. VISUAL RENDERING
      Registry.Services.Reporting.logStep(5, 6, "Applying Visual Architecture...");
      const headersLen = Object.keys(CONFIG.SCHEMA.ROSTER_HEADERS).length;
      const HEADERS_ARRAY = new Array(headersLen).fill("");
      (Object.keys(CONFIG.SCHEMA.ROSTER_HEADERS) as any[]).forEach(k => HEADERS_ARRAY[L[k]] = CONFIG.SCHEMA.ROSTER_HEADERS[k]);

      Sheets.Spreadsheets.Values.update(
        { values: finalRows }, 
        ss.getId(), 
        `'${sheet.getName()}'!B${CONFIG.LAYOUT.DATA_START_ROW}`, 
        { valueInputOption: "USER_ENTERED" }
      );
      RosterView.restoreVisuals(sheet, finalRows.length, HEADERS_ARRAY);
      
      // ROTATE BACKUPS
      Registry.Services.View.backupSheet(ss, CONFIG.SHEETS.ROSTER);

      // PERSISTENCE
      Registry.Services.Reporting.logStep(6, 6, "Synchronizing Prophet & Web Payloads...");
      RosterStore.saveProphetCache(rawResults, recruitCache);
      SpreadsheetApp.flush();
      
      // @ts-ignore
      if (typeof refreshWebPayload === "function") refreshWebPayload();

      // FINAL REPORT
      const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
      Registry.Services.Reporting.logReport("ROSTER UPDATE COMPLETE", [
        `STATUS:      SUCCESS`,
        `RANKED POOL: ${rawResults.length} Members`,
        `ELITE AVG:   ${Math.round(maxPerfScore)} (RPeS Benchmark)`,
        `API LATENCY: ${apiDuration}ms`,
        `RUNTIME:     ${totalDuration}s`
      ]);

    } catch (e: any) {
        console.error(`ROSTER PIPELINE FAILURE: ${e.message} \n${e.stack}`);
        Registry.Services.Reporting.logReport("ROSTER CRITICAL FAILURE", [
            `ERROR: ${e.message}`,
            `STATE: UNSTABLE`,
            `ACTION: CHECK LOGS`
        ]);
    }
  },

  /**
   * EXPOSURE: Returns the current Prophet Intel cache.
   */
  getProphetCache(): Map<string, any> {
    return RosterStore.getProphetCache();
  },

  /**
   * EXPOSURE: Returns the top performing tags from the Leaderboard.
   */
  getTopPerformers(count: number = 3): string[] {
    return RosterStore.loadTopPerformers(count);
  }
};

/**
 * GLOBAL BRIDGE (Legacy Support)
 */
function updateLeaderboard() {
  Roster.synchronizeLeaderboard();
}

// HARDEN: Unified versioning prevents false-negative health check failures.
const VER_ROSTER = "13.1.0";



(function(scope: any) {
  Object.assign(scope, { Roster, updateLeaderboard, VER_ROSTER });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Roster;
