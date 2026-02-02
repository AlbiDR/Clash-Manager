import { CONFIG } from './Configuration';
import Registry from './Registry';
import { PlayerResult, ClanMemberResult, IRoster } from './Roster_Types';
import RosterStore from './Roster_Store';
import RosterView from './Roster_View';

declare var SpreadsheetApp: any;
declare var Sheets: any;

/**
 * ============================================================================
 * MODULE: ROSTER (Leaderboard & Roster Management)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: The Commander of the Roster Pipeline. Orchestrates the
 * lifecycle of clan member data, from API ingestion and historical
 * rehydration to performance scoring and spreadsheet rendering.
 *
 * ARCHITECTURE:
 *    - Data Ingestion: Aggregates Member, Race, and Historical data.
 *    - Scoring Engine: Delegates mathematical heavy lifting to Scoring Kernel.
 *    - Persistence: Synchronizes results to Google Sheets and Prophet Cache.
 *
 * DICTIONARY:
 *    - Prophet Intel: Cached recruitment data (wins, activity) used to grant
 *      "Heritage" bonuses to new members before internal stats stabilize.
 *    - Momentum Deltas: The delta between current raw score and the
 *      last recorded score, indicating immediate activity trends.
 *    - Elite Avg: The performance score of the top-performing member,
 *      used as a benchmark for normalizing the clan's potential.
 *
 */
const Roster: IRoster = {
  /**
   * ROSTER UPDATE PIPELINE
   *
   * @remarks
   * Executes the full ETL (Extract, Transform, Load) cycle for the clan roster.
   * 1. Extracts: Live data from Royale API and historical data from Sheets/Store.
   * 2. Transforms: Calculates performance scores, momentum deltas, and trends.
   * 3. Loads: Updates the Leaderboard sheet and synchronizes the web payload.
   *
   * @warning Consumes UrlFetchApp, SpreadsheetApp, and CacheService quotas.
   */
  update(): void {
    console.info("🏆 Starting Roster/Leaderboard Generation Pipeline...");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(CONFIG.SHEETS.ROSTER);
    if (!sheet) sheet = ss.insertSheet(CONFIG.SHEETS.ROSTER);

    // 1. DYNAMIC SYNC
    Registry.Services.Reporting.logStep(1, 7, "Syncing Dynamic Schema indices...");
    Registry.Services.Schema.bootDynamicSchema();
    const L = CONFIG.SCHEMA.ROSTER;

    // 2. CONFIG CHECK
    if (!CONFIG.SYSTEM.CLAN_TAG) {
      console.error("❌ [CONFIG] CLAN_TAG is not configured. Aborting update.");
      sheet.getRange("B1").setValue("⚠️ Configuration Error: Missing CLAN_TAG");
      return;
    }

    // 3. DATA LOADING
    // Intent: Rehydrate historical context. "Momentum Deltas" are calculated
    // by comparing current scores against 'previousScores'.
    Registry.Services.Reporting.logStep(2, 7, "Loading momentum deltas & archives...");
    const previousScores = RosterStore.loadPreviousScores(sheet, L);
    const warHistoryMap = RosterStore.rehydrateWarHistory(sheet, L);
    const recruitCache = RosterStore.getProphetCache();
    const marketIntelligence = RosterStore.loadMarketIntelligence();

    // 4. API INGESTION
    Registry.Services.Reporting.logStep(3, 7, "Ingesting Live API data (Members & Race)...");
    const clanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
    const { members, race, history: remoteHistory, log: logData } = Registry.Services.Network.fetchClanDataSmart(clanTag);

    if (!members || !members.items) {
      console.error("❌ [CRITICAL] Failed to fetch clan members. Aborting.");
      return;
    }

    const now = new Date();
    const currentWeekId = Registry.Services.Time.calculateWarWeekId(now);
    
    // Add War Entries helper
    const addWarEntry = (tag: string, weekId: string, fame: number) => {
      if (!warHistoryMap.has(tag)) warHistoryMap.set(tag, new Map());
      const userMap = warHistoryMap.get(tag)!;
      userMap.set(weekId, Math.max(userMap.get(weekId) || 0, fame));
    };

    // Merge remote history
    // Logic: Historical data from the Remote Worker (if available) takes
    // precedence to ensure data continuity across script executions.
    if (remoteHistory) {
      Object.keys(remoteHistory).forEach(tag => {
        const h = (remoteHistory as any)[tag];
        Object.keys(h).forEach(weekId => addWarEntry(tag, weekId, h[weekId]));
      });
    }

    // Merge current race
    if (race && race.clan && race.clan.participants) {
      race.clan.participants.forEach((p: any) => {
        addWarEntry(p.tag, currentWeekId, Registry.Services.Scoring.resolveWarFame(p));
      });
    }

    // 5. PROPHET & SCORING
    // Intent: Process each member through the Scoring Kernel.
    // "Prophet Intel" is used here to ensure recruits who recently joined
    // are not penalized for having zero internal clan history.
    Registry.Services.Reporting.logStep(4, 7, "Computing performance scores...");
    const rawResults: PlayerResult[] = [];

    (members.items as ClanMemberResult[]).forEach(m => {
      const pWarHistory = warHistoryMap.get(m.tag) || new Map<string, number>();
      const currentFame = pWarHistory.get(currentWeekId) || 0;
      const lastSeen = Registry.Services.Time.parseRoyaleApiDate(m.lastSeen);
      const dbRecord = marketIntelligence.get(m.tag);

      let daysTracked = 0;
      let totalDonations = 0;

      if (dbRecord) {
        const diffTime = Math.abs(now.getTime() - dbRecord.firstSeen.getTime());
        daysTracked = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
        historyString: Array.from(pWarHistory.entries()).sort((a,b) => b[0].localeCompare(a[0])).map(([wk,f]) => `${f} ${wk}`).join(" | "),
        scores,
        cleanKey: m.tag.replace("#", "").trim().toLowerCase()
      });
    });

    // 6. FINALIZE AGGREGATION
    // Logic: We identify the 'Elite Avg' (max score) to normalize the
    // 'Potential' metric, ensuring the leaderboard remains relative
    // to the clan's current ceiling.
    let maxPerfScore = 0;
    rawResults.forEach(r => { if (r.scores.perf > maxPerfScore) maxPerfScore = r.scores.perf; });

    const finalRows = rawResults.map(r => {
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
    while (finalRows.length < 50) finalRows.push(new Array(Object.keys(CONFIG.SCHEMA.ROSTER_HEADERS).length).fill(""));

    // 7. RENDERING
    Registry.Services.Reporting.logStep(7, 7, "Applying visual layout & pushing to web...");
    const headersLen = Object.keys(CONFIG.SCHEMA.ROSTER_HEADERS).length;
    const HEADERS_ARRAY = new Array(headersLen).fill("");
    (Object.keys(CONFIG.SCHEMA.ROSTER_HEADERS) as any[]).forEach(k => HEADERS_ARRAY[L[k]] = CONFIG.SCHEMA.ROSTER_HEADERS[k]);

    Sheets.Spreadsheets.Values.update({ values: finalRows }, ss.getId(), `'${sheet.getName()}'!B${CONFIG.LAYOUT.DATA_START_ROW}`, { valueInputOption: "USER_ENTERED" });
    RosterView.restoreVisuals(sheet, finalRows.length, HEADERS_ARRAY);
    
    // Save Prophet Intel
    RosterStore.saveProphetCache(rawResults, recruitCache);

    SpreadsheetApp.flush();
    // @ts-ignore
    if (typeof refreshWebPayload === "function") refreshWebPayload();

    Registry.Services.Reporting.logReport(`🏆 ROSTER v1.0.0 REPORT`, [
      `SYNC STATUS:  SUCCESS`,
      `RANKED POOL:  ${rawResults.length} Combatants`,
      `ELITE AVG:    ${Math.round(maxPerfScore)} (Benchmark)`
    ]);
  }
};

/**
 * 🌍 GLOBAL BRIDGE (Legacy Support)
 */
function updateLeaderboard() {
  Roster.update();
}

const VER_ROSTER = "1.0.0";

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Roster;
}

(function(scope: any) {
  Object.assign(scope, { Roster, updateLeaderboard, VER_ROSTER });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Roster;
