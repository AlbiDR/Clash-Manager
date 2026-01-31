import { CONFIG } from './Configuration';
import Registry from './Registry';
import { PlayerResult, ClanMemberResult, IRoster } from './Roster_Types';
import RosterStore from './Roster_Store';
import RosterView from './Roster_View';

declare var SpreadsheetApp: any;
declare var Sheets: any;

/**
 * 🏆 MODULE: ROSTER (Leaderboard & Roster Management)
 */
const Roster: IRoster = {
  /**
   * ⚡ MAIN ENTRY: Update Roster
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

export default Roster;
