
/**
 * ============================================================================
 * 🏆 MODULE: LEADERBOARD - TypeScript Edition
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: The core ranking engine for the Clan.
 * ⚙️ ALGORITHM OVERVIEW:
 *    1. Hybrid Data Fetch: Combines Live API (Current stats) + DB (Tenure).
 *    2. War History: Merges 'currentriverrace' + 'riverracelog' for full context.
 *    3. ScoringSystem: Delegates logic to 'ScoringSystem.ts'.
 *    4. TREND ENGINE: Compares new scores vs old scores to show momentum.
 * 🏷️ VERSION: 11.0.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { AppUtils } from "./Utilities";
import type { IScoringSystem } from "./ScoringSystem";

// Global Version Constant
// @ts-ignore
const VER_LEADERBOARD = "11.0.0";

declare var SpreadsheetApp: any;
declare var LockService: any;
declare var PropertiesService: any;
declare var UrlFetchApp: any;
declare var CacheService: any;
declare var ContentService: any;
declare var Utilities: any;
declare var ScriptApp: any;
declare var Logger: any;
declare var module: any;

declare namespace GoogleAppsScript {
  export namespace Events {
    export type DoGet = any;
    export type DoPost = any;
    export type AppsScriptEvent = any;
    export type SheetsOnEdit = any;
  }
  export namespace Spreadsheet {
    export type Sheet = any;
    export type Spreadsheet = any;
    export type Range = any;
  }
  export namespace Content {
    export type TextOutput = any;
  }
}

// Global Declarations for GAS Environment
declare const CONFIG: AppConfig;
declare const Utils: AppUtils;
declare const ScoringSystem: IScoringSystem;

/**
 * 🏆 LEADERBOARD INTERFACES
 */
export interface PlayerResult {
  member: any;
  trophies: number;
  daysTracked: number;
  avgDailyDonations: number;
  totalDonations: number;
  lastSeen: Date;
  warRateVal: number;
  avgWarFame: number;
  historyString: string;
  scores: { raw: number; perf: number };
  warDayWins: number;
  cleanKey: string;
}

/**
 * ⚡ MAIN ENTRY: Update Leaderboard
 * Calculates player rankings and momentum.
 */
function updateLeaderboard(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let lbSheet = ss.getSheetByName(CONFIG.SHEETS.LB);
  if (!lbSheet) lbSheet = ss.insertSheet(CONFIG.SHEETS.LB);

  // ⚡ DYNAMIC SYNC: Resolve column indices from current sheet headers first
  Utils.bootDynamicSchema();
  const L = CONFIG.SCHEMA.LB;

  // 🛡️ CONFIGURATION CHECK
  if (!CONFIG.SYSTEM.CLAN_TAG) {
    console.error(
      "❌ CRITICAL: 'ClanTag' is not set. Aborting Leaderboard Update.",
    );
    lbSheet.getRange("B1").setValue("⚠️ Error: Missing ClanTag");
    return;
  }

  // 🛡️ SAFETY & HISTORY SNAPSHOT
  const previousScores = new Map<string, number>();
  try {
    const lastRow = lbSheet.getLastRow();
    const maxCols = lbSheet.getMaxColumns();
    const startRow = CONFIG.LAYOUT.DATA_START_ROW;

    if (lastRow >= startRow && maxCols >= L.TAG) {
      const oldData = lbSheet
        .getRange(startRow, 1, lastRow - startRow + 1, maxCols)
        .getValues();

      const tagIdx = L.TAG; // Corrected: Mapping is already 0-indexed offset
      const scoreIdx = L.RAW_SCORE; // Corrected: Mapping is already 0-indexed offset

      oldData.forEach((row: any) => {
        if (row.length > scoreIdx) {
          const rawTag = String(row[tagIdx]);
          const score = row[scoreIdx];

          if (rawTag && rawTag.startsWith("#")) {
            const cleanKey = rawTag.replace("#", "").trim().toLowerCase();
            const scoreVal = Number(score);
            if (!isNaN(scoreVal)) {
              previousScores.set(cleanKey, scoreVal);
            }
          }
        }
      });
    }
  } catch (e: any) {
    console.warn("⚠️ Snapshot Warning: " + e.message);
  }

  const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);

  // 1. DATA INGESTION
  const {
    members: membersData,
    race: raceData,
    log: logData,
    history: remoteHistory,
  } = Utils.fetchClanDataSmart(cleanTag);

  if (!membersData || !membersData.items) {
    console.error("Leaderboard: Failed to fetch members.");
    return;
  }

  const now = new Date();
  const currentWeekId = Utils.calculateWarWeekId(now);
  const currentDayIndex = Utils.getLogicalDay(now);

  // A. Build War History Map
  const warHistoryMap = new Map<string, Map<string, number>>();
  const addWarEntry = (tag: string, weekId: string, fame: number) => {
    if (!warHistoryMap.has(tag)) warHistoryMap.set(tag, new Map());
    const userMap = warHistoryMap.get(tag)!;
    userMap.set(weekId, Math.max(userMap.get(weekId) || 0, fame));
  };

  // 1. REHYDRATE FROM ARCHIVE
  if (lbSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    try {
      const histColIndex = 1 + CONFIG.SCHEMA.LB.HISTORY; // 1-based col
      const tagColIndex = 1 + CONFIG.SCHEMA.LB.TAG; // 1-based col
      const numRows = lbSheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1);

      if (lbSheet.getMaxColumns() >= histColIndex) {
        const tagData = lbSheet
          .getRange(CONFIG.LAYOUT.DATA_START_ROW, tagColIndex, numRows, 1)
          .getValues();
        const histData = lbSheet
          .getRange(CONFIG.LAYOUT.DATA_START_ROW, histColIndex, numRows, 1)
          .getValues();

        tagData.forEach((row: any, i: number) => {
          const tag = String(row[0]);
          const histStr = histData[i][0];
          if (tag && typeof histStr === "string" && histStr.length > 0) {
            const archivedMap = Utils.parseWarHistory(histStr);
            if (archivedMap.size > 0) {
              if (!warHistoryMap.has(tag)) warHistoryMap.set(tag, new Map());
              const userMap = warHistoryMap.get(tag)!;
              archivedMap.forEach((fame, wk) => userMap.set(wk, fame));
            }
          }
        });
      }
    } catch (e: any) {
      console.warn("Leaderboard: Failed to rehydrate history", e);
    }
  }

  // 2. MERGE FRESH API DATA
  if (remoteHistory) {
    Object.keys(remoteHistory).forEach((tag) => {
      const playerHist = (remoteHistory as any)[tag];
      Object.keys(playerHist).forEach((weekId) => {
        addWarEntry(tag, weekId, playerHist[weekId]);
      });
    });
  } else if (logData && logData.items) {
    logData.items.forEach((log: any) => {
      const weekId = Utils.calculateWarWeekId(
        Utils.parseRoyaleApiDate(log.createdDate),
      );
      const myClan = log.standings.find(
        (s: any) => s.clan.tag === CONFIG.SYSTEM.CLAN_TAG,
      );
      if (myClan && myClan.clan.participants) {
        myClan.clan.participants.forEach((p: any) =>
          addWarEntry(p.tag, weekId, p.fame),
        );
      }
    });
  }

  if (raceData && raceData.clan && raceData.clan.participants) {
    raceData.clan.participants.forEach((p: any) => {
      // 🛡️ UNIFIED FAME DETECTION (Synced with Service_WarIntelligence v12.4.0)
      addWarEntry(p.tag, currentWeekId, Utils.resolveWarFame(p));
    });
  }

  // B. Load Historical Data (Tenure, Donations, and War Fame)
  const dbSheet = ss.getSheetByName(CONFIG.SHEETS.DB);
  const memberDbData = new Map<
    string,
    { firstSeen: Date; weeklyMax: Map<string, number>; battleWeeks: Set<string> }
  >();

  if (dbSheet && dbSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    const dbValues = dbSheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        2,
        dbSheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1),
        9, // Increased to 9 to read 'War Fame' column
      )
      .getValues();
    const S_DB = CONFIG.SCHEMA.DB;

    dbValues.forEach((row: any) => {
      const tag = String(row[S_DB.TAG]);
      const dateVal = row[S_DB.DATE];
      const date = dateVal ? new Date(dateVal) : new Date();
      const donGiven = Number(row[S_DB.DON_GIVEN]) || 0;
      const rawWarFame = row[S_DB.WAR_FAME];
      const weekId = Utils.calculateWarWeekId(date);

      if (!memberDbData.has(tag)) {
        memberDbData.set(tag, { firstSeen: date, weeklyMax: new Map(), battleWeeks: new Set() });
      }

      const h = memberDbData.get(tag)!;
      if (date < h.firstSeen) h.firstSeen = date;

      const currentMax = h.weeklyMax.get(weekId) || 0;
      if (donGiven > currentMax) h.weeklyMax.set(weekId, donGiven);

      // ⚔️ ROBUST HISTORY POPULATION: If it's a number, it's a battle day record
      const fameVal = Number(rawWarFame);
      if (!isNaN(fameVal)) {
          addWarEntry(tag, weekId, fameVal);
          h.battleWeeks.add(weekId); // Mark this week as seen during a battle phase
      }
    });
  }

  // ----------------------------------------------------------------------------
  // 2. LOGIC DELEGATION
  // ----------------------------------------------------------------------------
  const rawMemberResults: PlayerResult[] = [];

  membersData.items.forEach((m: any) => {
    const trophies = m.trophies || 0;
    const weeklyDonations = m.donations || 0;
    const pWarHistory = warHistoryMap.get(m.tag) || new Map<string, number>();
    const currentFame = pWarHistory.get(currentWeekId) || 0;
    const lastSeen = Utils.parseRoyaleApiDate(m.lastSeen);

    const dbRecord = memberDbData.get(m.tag);
    let daysTracked = 0;
    let totalDonations = 0;

    if (dbRecord) {
      const diffTime = Math.abs(now.getTime() - dbRecord.firstSeen.getTime());
      daysTracked = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const liveMax = Math.max(
        dbRecord.weeklyMax.get(currentWeekId) || 0,
        weeklyDonations,
      );
      dbRecord.weeklyMax.set(currentWeekId, liveMax);
      dbRecord.weeklyMax.forEach((val) => (totalDonations += val));
    } else {
      totalDonations = weeklyDonations;
      daysTracked = 0;
    }

    const avgDailyDonations =
      daysTracked > 0
        ? Math.round(totalDonations / daysTracked)
        : weeklyDonations;

    let totalHistoryFame = 0;
    pWarHistory.forEach((val) => {
      const num = Number(val);
      if (!isNaN(num)) totalHistoryFame += num;
    });
    
    // ⚔️ SMART AVERAGING: Use DB 'battleWeeks' to determine eligible weeks for averaging
    const eligibleWeeks = dbRecord?.battleWeeks?.size || 0;
    const weeksInClan = Math.min(
      52,
      Math.max(1, Math.ceil(daysTracked / 7), pWarHistory.size, eligibleWeeks),
    );
    const avgWarFame = Math.round(totalHistoryFame / weeksInClan);

    const warRateVal = ScoringSystem.calculateWarRate(
      pWarHistory,
      daysTracked,
      currentWeekId,
      currentDayIndex,
    );
    const scores = ScoringSystem.computeScores(
      currentFame,
      avgWarFame,
      avgDailyDonations,
      trophies,
      warRateVal,
      lastSeen.getTime(),
      now.getTime(),
    );

    const historyString = Array.from(pWarHistory.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([wk, f]) => `${f} ${wk}`)
      .join(" | ");

    rawMemberResults.push({
      member: m,
      trophies,
      daysTracked,
      avgDailyDonations,
      totalDonations,
      lastSeen,
      warRateVal,
      avgWarFame,
      historyString,
      scores,
      warDayWins: m.warDayWins || 0,
      cleanKey: m.tag.replace("#", "").trim().toLowerCase(),
    });
  });

  let maxPerfScore = 0;
  rawMemberResults.forEach((r) => {
    if (r.scores.perf > maxPerfScore) maxPerfScore = r.scores.perf;
  });

  // ----------------------------------------------------------------------------
  // 3. FINALIZE & CALCULATE TREND
  // ----------------------------------------------------------------------------
  const finalRows: any[][] = [];
  rawMemberResults.forEach((r) => {
    const normalizedPerf =
      maxPerfScore > 0
        ? Math.min(100, Math.round((r.scores.perf / maxPerfScore) * 100))
        : 0;

    let trend = 0;
    if (previousScores.has(r.cleanKey)) {
      trend = r.scores.raw - (previousScores.get(r.cleanKey) || 0);
    }

    const row = new Array(17).fill("");
    row[L.TAG] = r.member.tag;
    row[L.NAME] =
      `=HYPERLINK("${CONFIG.SYSTEM.WEB_APP_URL}?mode=leaderboard&pin=${r.member.tag.replace("#", "")}", "${r.member.name}")`;
    row[L.ROLE] = r.member.role;
    row[L.TROPHIES] = r.trophies;
    row[L.DAYS] = r.daysTracked;
    row[L.WEEKLY_REQ] = r.member.donationsReceived;
    row[L.AVG_DAY] = r.avgDailyDonations;
    row[L.TOTAL_DON] = r.totalDonations;
    row[L.LAST_SEEN] = timeAgo(r.lastSeen);
    row[L.WAR_RATE] = `${r.warRateVal}%`;
    row[L.HISTORY] = r.historyString;
    row[L.RAW_SCORE] = r.scores.raw;
    row[L.PERF_SCORE] = normalizedPerf;
    row[L.TREND] = trend;
    row[L.AVG_WAR_FAME] = r.avgWarFame;
    row[L.WAR_DAY_WINS] = r.warDayWins;

    finalRows.push(row);
  });

  finalRows.sort(ScoringSystem.comparator);

  // ----------------------------------------------------------------------------
  // 4. SAFETY LOCK & WRITING
  // ----------------------------------------------------------------------------
  Utils.backupSheet(ss, CONFIG.SHEETS.LB);

  const HEADERS_ARRAY = new Array(17).fill("");
  (
    Object.keys(CONFIG.SCHEMA.LB_HEADERS) as Array<
      keyof typeof CONFIG.SCHEMA.LB_HEADERS
    >
  ).forEach((k) => {
    HEADERS_ARRAY[L[k]] = CONFIG.SCHEMA.LB_HEADERS[k];
  });

  lbSheet.clear();
  lbSheet
    .getRange(2, 1, 1, HEADERS_ARRAY.length)
    .setValues([HEADERS_ARRAY])
    .setFontWeight("bold");

  if (finalRows.length > 0) {
    lbSheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        1,
        finalRows.length,
        HEADERS_ARRAY.length,
      )
      .setValues(finalRows);

    const scoreColIndex = 1 + L.PERF_SCORE;
    lbSheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        scoreColIndex,
        finalRows.length,
        1,
      )
      .setFontWeight("bold")
      .setNumberFormat('0"%"');

    const rule = SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpointWithValue(
        "#ffffff",
        SpreadsheetApp.InterpolationType.NUMBER,
        "0",
      )
      .setGradientMaxpointWithValue(
        "#6aa84f",
        SpreadsheetApp.InterpolationType.NUMBER,
        "100",
      )
      .setRanges([
        lbSheet.getRange(
          CONFIG.LAYOUT.DATA_START_ROW,
          scoreColIndex,
          finalRows.length,
          1,
        ),
      ])
      .build();

    const trendColIndex = 1 + L.TREND;
    const trendRange = lbSheet.getRange(
      CONFIG.LAYOUT.DATA_START_ROW,
      trendColIndex,
      finalRows.length,
      1,
    );

    const trendPos = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0)
      .setFontColor("#2e7d32")
      .setBold(true)
      .setRanges([trendRange])
      .build();
    const trendNeg = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(0)
      .setFontColor("#c62828")
      .setBold(true)
      .setRanges([trendRange])
      .build();
    const trendNeu = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberEqualTo(0)
      .setFontColor("#cccccc")
      .setRanges([trendRange])
      .build();

    lbSheet.setConditionalFormatRules([rule, trendPos, trendNeg, trendNeu]);
  }

  lbSheet
    .getRange("B1")
    .setValue(`LEADERBOARD • ${new Date().toLocaleString()}`);
  ss.toast("Success: Leaderboard updated.", "Leaderboard Updated");

  Utils.applyStandardLayout(
    lbSheet,
    finalRows.length,
    HEADERS_ARRAY.length - 1,
    HEADERS_ARRAY.slice(1),
  );
}

function timeAgo(date: Date | null): string {
  if (!date) return "-";
  const units = [
    { s: 31536000, t: "y" },
    { s: 2592000, t: "mo" },
    { s: 86400, t: "d" },
    { s: 3600, t: "h" },
    { s: 60, t: "m" },
  ];
  const sec = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  const match = units.find((u) => sec >= u.s);
  return match ? `${Math.floor(sec / match.s)}${match.t} ago` : "Just now";
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, { updateLeaderboard, timeAgo, VER_LEADERBOARD });
