
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
import type { IRegistry } from "./Registry";

// Global Version Constant
// @ts-ignore
const VER_LEADERBOARD = "11.0.0";

declare var SpreadsheetApp: any;
declare var LockService: any;
declare var PropertiesService: any;
declare var UrlFetchApp: any;
declare var CacheService: any;
declare var ContentService: any;
declare function scoutRecruits(): void;
declare function refreshWebPayload(): void;
declare var Utilities: any;
declare var ScriptApp: any;
declare var Logger: any;
declare var Sheets: any;
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
declare const Registry: IRegistry;

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
  cleanKey: string;
}

export interface ClanMemberResult {
  tag: string;
  name: string;
  role: string;
  trophies: number;
  donations: number;
  lastSeen: string;
  warDayWins: number;
  donationsReceived: number;
}

export interface WarLogItem {
  createdDate: string;
  standings: Array<{
    clan: {
      tag: string;
      participants: Array<{ tag: string; fame: number }>;
    };
  }>;
}

export interface RaceParticipant {
  tag: string;
  fame: number;
  medals: number;
  repairPoints: number;
}

/**
 * ⚡ MAIN ENTRY: Update Leaderboard
 * Calculates scores, ranks players, and updates the sheet.
 */
function updateLeaderboard(dryRun: boolean = false): void {
  console.info("🏆 Starting Leaderboard Generation Pipeline...");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let lbSheet = ss.getSheetByName(CONFIG.SHEETS.LB);
  if (!lbSheet) lbSheet = ss.insertSheet(CONFIG.SHEETS.LB);

  // ⚡ DYNAMIC SYNC: Resolve column indices from current sheet headers first
  Registry.Services.Core.logStep(1, 7, "Syncing Dynamic Schema indices...");
  Registry.Services.Schema.bootDynamicSchema();
  const L = CONFIG.SCHEMA.LB;

  // 🛡️ CONFIGURATION CHECK
  if (!CONFIG.SYSTEM.CLAN_TAG) {
    console.error(
      "❌ [CONFIG] CLAN_TAG is not configured. Aborting Leaderboard Update.",
    );
    lbSheet.getRange("B1").setValue("⚠️ Configuration Error: Missing CLAN_TAG");
    return;
  }

  const previousScores = new Map<string, number>();
  const lastRow = lbSheet.getLastRow();
  const maxCols = lbSheet.getMaxColumns();
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;

  Registry.Services.Core.logStep(2, 7, "Loading momentum deltas (previous scores)...");
  if (lastRow >= startRow && maxCols > L.RAW_SCORE) {
      const oldData = lbSheet
        .getRange(startRow, 1, lastRow - startRow + 1, maxCols)
        .getValues();

      const tagIdx = L.TAG;
      const scoreIdx = L.RAW_SCORE;

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
      if (previousScores.size > 0) {
        console.info(`  └─ Momentum: Ingested ${previousScores.size} previous score${previousScores.size !== 1 ? 's' : ''} for trend analysis.`);
      }
    }

  const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);

  // 1. DATA INGESTION
  Registry.Services.Core.logStep(3, 7, "Ingesting Live API data (Members & Race)...");
  const {
    members: membersData,
    race: raceData,
    log: logData,
    history: remoteHistory,
  } = Registry.Services.Network.fetchClanDataSmart(cleanTag);

  if (!membersData || !membersData.items) {
    console.error("❌ [CRITICAL] Failed to fetch clan members from API. Aborting leaderboard update.");
    return;
  }
  console.info(`  └─ API: Located ${membersData.items.length} active clan member${membersData.items.length !== 1 ? 's' : ''}.`);

  const now = new Date();
  const currentWeekId = Registry.Services.Time.calculateWarWeekId(now);
  const currentDayIndex = Registry.Services.Time.getLogicalDay(now);

  // A. Build War History Map
  const warHistoryMap = new Map<string, Map<string, number>>();
  const addWarEntry = (tag: string, weekId: string, fame: number) => {
    if (!warHistoryMap.has(tag)) warHistoryMap.set(tag, new Map());
    const userMap = warHistoryMap.get(tag)!;
    userMap.set(weekId, Math.max(userMap.get(weekId) || 0, fame));
  };

  // 1. REHYDRATE FROM ARCHIVE
  Registry.Services.Core.logStep(4, 7, "Rehydrating War History from archives...");
  if (lbSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
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
          const archivedMap = Registry.Services.Core.parseWarHistory(histStr);
          if (archivedMap.size > 0) {
            if (!warHistoryMap.has(tag)) warHistoryMap.set(tag, new Map());
            const userMap = warHistoryMap.get(tag)!;
            archivedMap.forEach((fame, wk) => userMap.set(wk, fame));
          }
        }
      });
      if (warHistoryMap.size > 0) {
        console.info(`  └─ Archive: Reconstituted history for ${warHistoryMap.size} combatant${warHistoryMap.size !== 1 ? 's' : ''}.`);
      }
    }
  }

  // 1b. HEADHUNTER CACHE (Recruit Intelligence)
  // Fetch War Wins from the Headhunter sheet to give new recruits their specific "Potential" score,
  // bypassing the API limitation on the /members endpoint.
  const hhSheet = ss.getSheetByName(CONFIG.SHEETS.HH);
  const recruitCache = new Map<string, number>(); // Tag -> WarWins
  
  if (hhSheet && hhSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    const hhData = hhSheet.getRange(
      CONFIG.LAYOUT.DATA_START_ROW, 
      1, 
      hhSheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1), 
      10 // Read enough cols to get WAR_WINS
    ).getValues();
    const S_HH = CONFIG.SCHEMA.HH;
    
    hhData.forEach((row: any) => {
      const tag = String(row[S_HH.TAG]).trim();
      const wins = Number(row[S_HH.WAR_WINS]);
      if (tag && !isNaN(wins)) {
        recruitCache.set(tag, wins);
      }
    });
    if (recruitCache.size > 0) {
        console.info(`  └─ Headhunter: Cached war intelligence for ${recruitCache.size} scouted targets.`);
    }
  }

  // 1c. PROPHET FETCH (Blind Spot Recovery)
  // For members who joined without being scouted (Manual recruits), we fetch their
  // profile once to populate their 'Heritage' score.
  const unknownTags: string[] = [];
  membersData.items.forEach((m: any) => {
    const isNew = !warHistoryMap.has(m.tag);
    if (isNew && !recruitCache.has(m.tag)) {
        unknownTags.push(m.tag);
    }
  });

  if (unknownTags.length > 0) {
    const fetchBatch = unknownTags.slice(0, 20); // Safety limit
    console.info(`  └─ Prophet: Detecting ${unknownTags.length} new members in blind spot. Fetching stats for top ${fetchBatch.length}...`);
    
    const urls = fetchBatch.map(tag => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(tag)}`);
    try {
        const profiles = Registry.Services.Network.fetchRoyaleAPI(urls);
        profiles.forEach((p: any) => {
            if (p && p.tag) {
                const wins = Number(p.warDayWins || 0);
                recruitCache.set(p.tag, wins);
            }
        });
        if (profiles.length > 0) {
            console.info(`  └─ Prophet: Recovered war intelligence for ${profiles.length} unknown members.`);
        }
    } catch (e: any) {
        console.warn(`  ⚠️ Prophet: Background fetch failed: ${e.message}`);
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
    (logData.items as WarLogItem[]).forEach((log) => {
      const weekId = Registry.Services.Time.calculateWarWeekId(
        Registry.Services.Time.parseRoyaleApiDate(log.createdDate),
      );
      const myClan = log.standings.find(
        (s) => s.clan.tag === CONFIG.SYSTEM.CLAN_TAG,
      );
      if (myClan && myClan.clan.participants) {
        myClan.clan.participants.forEach((p) =>
          addWarEntry(p.tag, weekId, p.fame),
        );
      }
    });
  }

  if (raceData && raceData.clan && raceData.clan.participants) {
    (raceData.clan.participants as RaceParticipant[]).forEach((p) => {
      // 🛡️ UNIFIED FAME DETECTION (Synced with Service_WarIntelligence v12.4.0)
      addWarEntry(p.tag, currentWeekId, Registry.Services.ScoringSystem.resolveWarFame(p));
    });
  }

  // B. Load Historical Data (Tenure, Donations, and War Fame)
  Registry.Services.Core.logStep(5, 7, "Loading Tenure and Battle Credits from Database...");
  const dbSheet = ss.getSheetByName(CONFIG.SHEETS.DB);
  const memberDbData = new Map<
    string,
    { firstSeen: Date; weeklyMax: Map<string, number>; battleWeeks: Set<string>; totalBattleCredits: number; discoveredBattleDays: Set<string>; dailyBattleCredits: Map<string, number> }
  >();

  if (dbSheet && dbSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    const dbValues = dbSheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        2,
        dbSheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1),
        10, // Increased to 10 to read 'Battle Credits' column
      )
      .getValues();
    const S_DB = CONFIG.SCHEMA.DB;

    dbValues.forEach((row: any) => {
      const tag = String(row[S_DB.TAG]);
      const dateVal = row[S_DB.DATE];
      const date = Registry.Services.Time.parseFlexibleDate(dateVal);
      const donGiven = Number(row[S_DB.DON_GIVEN]) || 0;
      const rawWarFame = row[S_DB.WAR_FAME];
      const weekId = Registry.Services.Time.calculateWarWeekId(date);

      if (!memberDbData.has(tag)) {
        memberDbData.set(tag, { 
          firstSeen: date, 
          weeklyMax: new Map(), 
          battleWeeks: new Set(), 
          totalBattleCredits: 0,
          discoveredBattleDays: new Set(),
          dailyBattleCredits: new Map()
        });
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
          // 🛡️ DISCOVERY-BASED TRACKING: Add unique calendar-day string (dd/MM/yyyy)
          h.discoveredBattleDays.add(Registry.Services.Time.formatShortDate(date));
      }
      
      // ⚔️ BATTLE CREDITS AGGREGATION (Day-Aware)
      const dateKey = Registry.Services.Time.formatShortDate(date);
      const rawBattleCredits = row[S_DB.BATTLE_CREDITS];
      let creditVal = Number(rawBattleCredits);
      
      // 🛡️ HISTORICAL FALLBACK: If column is empty/NaN, count as 1 if Fame > 0
      if (isNaN(creditVal) || rawBattleCredits === "") {
          creditVal = (fameVal > 0) ? 1 : 0;
      }
      
      if (creditVal > 0) {
          // Update daily MAX credits to prevent inflation from multiple logs per day
          const currentDayMax = h.dailyBattleCredits.get(dateKey) || 0;
          if (creditVal > currentDayMax) {
              h.dailyBattleCredits.set(dateKey, creditVal);
          }
      }
    });

    // ⚔️ SUMMATION: Finalize total battle credits from daily maximums
    memberDbData.forEach(h => {
        let sum = 0;
        h.dailyBattleCredits.forEach(val => sum += val);
        h.totalBattleCredits = sum;
    });
  }

  // ----------------------------------------------------------------------------
  // 2. LOGIC DELEGATION
  // ----------------------------------------------------------------------------
  Registry.Services.Core.logStep(6, 7, "Computing final performance scores...");
  const rawMemberResults: PlayerResult[] = [];

  (membersData.items as ClanMemberResult[]).forEach((m) => {
    const trophies = m.trophies || 0;
    const weeklyDonations = m.donations || 0;
    const pWarHistory = warHistoryMap.get(m.tag) || new Map<string, number>();
    const currentFame = pWarHistory.get(currentWeekId) || 0;
    const lastSeen = Registry.Services.Time.parseRoyaleApiDate(m.lastSeen);

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

    // ⚔️ WAR RATE: Discovery-Based Model (Resilient to Pruning/Downtime)
    const totalBattleCredits = dbRecord?.totalBattleCredits ?? 0;
    const eligibleBattleDays = dbRecord?.discoveredBattleDays.size ?? 0;
    const warRateVal = Registry.Services.ScoringSystem.calculateWarRate(
      totalBattleCredits,
      eligibleBattleDays,
    );
    const scores = Registry.Services.ScoringSystem.computeScores(
      currentFame,
      avgWarFame,
      avgDailyDonations,
      trophies,
      warRateVal,
      lastSeen.getTime(),
      now.getTime(),
      recruitCache.get(m.tag) || 0, // 🛡️ RECRUIT INTEL: Use Cached Wins if available, else 0
      currentFame > 0
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

    const rowLen = Object.keys(CONFIG.SCHEMA.LB_HEADERS).length;
    const row = new Array(rowLen).fill("");
    row[L.TAG] = r.member.tag;
    row[L.NAME] = r.member.name; // Unified Rich-Text Anchor
    row[L.ROLE] = r.member.role;
    row[L.TROPHIES] = r.trophies;
    row[L.DAYS] = r.daysTracked;
    row[L.WEEKLY_REQ] = r.member.donationsReceived;
    row[L.AVG_DAY] = r.avgDailyDonations;
    row[L.TOTAL_DON] = r.totalDonations;
    row[L.LAST_SEEN] = Registry.Services.Time.formatDate(r.lastSeen);
    row[L.WAR_RATE] = r.warRateVal / 100;
    row[L.HISTORY] = r.historyString;
    row[L.RAW_SCORE] = r.scores.raw;
    row[L.PERF_SCORE] = normalizedPerf;
    row[L.TREND] = trend;
    row[L.AVG_WAR_FAME] = r.avgWarFame;

    finalRows.push(row);
  });

  finalRows.sort(Registry.Services.ScoringSystem.comparator);

  // 🛡️ PAD TO FIXED SIZE (50 Members + Buffer)
  // Ensures the leaderboard table maintains a consistent 50-row UI footprint.
  const actualCount = finalRows.length;
  const LB_LIMIT = 50;
  while (finalRows.length < LB_LIMIT) {
    const emptyRow = new Array(Object.keys(CONFIG.SCHEMA.LB_HEADERS).length).fill("");
    finalRows.push(emptyRow);
  }

  // ----------------------------------------------------------------------------
  // 4. SAFETY LOCK & WRITING
  // ----------------------------------------------------------------------------
  Registry.Services.View.backupSheet(ss, CONFIG.SHEETS.LB);

  const headersLen = Object.keys(CONFIG.SCHEMA.LB_HEADERS).length;
  const HEADERS_ARRAY = new Array(headersLen).fill("");
  (
    Object.keys(CONFIG.SCHEMA.LB_HEADERS) as Array<
      keyof typeof CONFIG.SCHEMA.LB_HEADERS
    >
  ).forEach((k) => {
    HEADERS_ARRAY[L[k]] = CONFIG.SCHEMA.LB_HEADERS[k];
  });

  const ssId = ss.getId();
  const sheetName = lbSheet.getName();

  // 🏗️ LAYOUT PREPARATION (Run FIRST to establish canvas)
  Registry.Services.View.applyStandardLayout(
    lbSheet,
    finalRows.length,
    HEADERS_ARRAY.length,
    HEADERS_ARRAY,
  );

  // No changes to preparation logic.
    if (finalRows.length > 0) {
      const sheetId = lbSheet.getSheetId();
      const startIdx = CONFIG.LAYOUT.DATA_START_ROW - 1;
      const contentRows = finalRows.length;
      const contentCols = HEADERS_ARRAY.length;

      // 1. DATA DELIVERY (Atomic Update) - USER_ENTERED
      Sheets.Spreadsheets!.Values!.update({
        values: finalRows
      }, ssId, `'${lbSheet.getName()}'!B${CONFIG.LAYOUT.DATA_START_ROW}`, {
        valueInputOption: "USER_ENTERED"
      });

      // 2. TOTAL ATOMIC VISUALS (Consolidated)
      const finalRequests: any[] = [
        // 2A. HEADERS DELIVERY (Row 2 Style & Value)
        {
          updateCells: {
            rows: [{
              values: HEADERS_ARRAY.map(h => ({
                userEnteredValue: { stringValue: h },
                userEnteredFormat: { textFormat: { bold: true }, wrapStrategy: "WRAP", horizontalAlignment: "CENTER", backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } }
              }))
            }],
            fields: 'userEnteredValue,userEnteredFormat(textFormat.bold,wrapStrategy,horizontalAlignment,backgroundColor)',
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 1 + contentCols }
          }
        },
        // 2B. PERFORMANCE GRADIENT
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: startIdx, endRowIndex: startIdx + contentRows, startColumnIndex: L.PERF_SCORE + 1, endColumnIndex: L.PERF_SCORE + 2 }],
              gradientRule: {
                minpoint: { color: { red: 1, green: 1, blue: 1 }, type: "NUMBER", value: "0" },
                midpoint: { color: { red: 1, green: 0.949, blue: 0.8 }, type: "NUMBER", value: "50" },
                maxpoint: { color: { red: 0.415, green: 0.658, blue: 0.309 }, type: "NUMBER", value: "100" }
              }
            },
            index: 0
          }
        },
        // 2C. TREND COLORS (Conditional)
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: startIdx, endRowIndex: startIdx + contentRows, startColumnIndex: L.TREND + 1, endColumnIndex: L.TREND + 2 }],
              booleanRule: {
                condition: { type: "NUMBER_GREATER", values: [{ userEnteredValue: "0" }] },
                format: { textFormat: { foregroundColor: { green: 0.4 } } }
              }
            },
            index: 0
          }
        },
        {
          addConditionalFormatRule: {
            rule: {
              ranges: [{ sheetId, startRowIndex: startIdx, endRowIndex: startIdx + contentRows, startColumnIndex: L.TREND + 1, endColumnIndex: L.TREND + 2 }],
              booleanRule: {
                condition: { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] },
                format: { textFormat: { foregroundColor: { red: 0.8 } } }
              }
            },
            index: 1
          }
        },
      // 2D. NUMBER FORMATS (Percentages & Dates)
        {
          repeatCell: {
            range: { sheetId, startRowIndex: startIdx, endRowIndex: startIdx + contentRows, startColumnIndex: L.WAR_RATE + 1, endColumnIndex: L.WAR_RATE + 2 },
            cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: '0%' } } },
            fields: "userEnteredFormat.numberFormat"
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: startIdx, endRowIndex: startIdx + contentRows, startColumnIndex: L.LAST_SEEN + 1, endColumnIndex: L.LAST_SEEN + 2 },
            cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: CONFIG.SYSTEM.DATE_FORMAT_DATETIME } } },
            fields: "userEnteredFormat.numberFormat"
          }
        }
      ];

      // 2E. INJECT ADDITIONAL VISUALS (Consolidated)
      // Note: Standard Layout (Borders, Status Bar, Banding) was already applied by applyStandardLayout above.

      // 3. FINAL VISUALS & ATOMIC SYNC
      Sheets.Spreadsheets!.batchUpdate({ requests: finalRequests }, ssId);
      
      SpreadsheetApp.flush();
      refreshWebPayload(); // ⚡ PUSH TO WEBAPP
    }

    Registry.Services.View.setStatusMessage(lbSheet, `LEADERBOARD • ${new Date().toLocaleString()}`);
    
    // Final Log
    const version = VER_LEADERBOARD;
    Registry.Services.Core.logReport(
      `🏆 LEADERBOARD v${version} REPORT`,
      [
        `SYNC STATUS:  SUCCESS`,
        `RANKED POOL:  ${actualCount} Active Players`,
        `ELITE AVG:    ${Math.round(maxPerfScore)} (Benchmark)`,
        `─`.repeat(63),
        `RECIPIENTS:   Webapp pushed, Sheet rendered.`
      ]
    );
    console.info(`✅ Leaderboard Cycle Finished: ${actualCount} members ranked.`);
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, { updateLeaderboard, VER_LEADERBOARD });