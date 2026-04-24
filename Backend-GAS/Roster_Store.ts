import { CONFIG } from './Configuration';
import Registry from './Registry';
import { ClanMemberResult, WarLogItem, RaceParticipant, PlayerResult, ProphetIntel, MarketIntelligence } from './Roster_Types';
import * as v from 'valibot';
import { ClanMemberSnapshotSchema, MarketIntelligenceSchema, ProphetIntelSchema } from './Validation';

declare var SpreadsheetApp: any;

/**
 * ============================================================================
 * MODULE: ROSTER_STORE
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Data persistence and retrieval layer for Roster management.
 * ROLE: Layer 2 Shared Driver (@drivers).
 * ============================================================================
 */

const RosterStore = {
  /**
   * MOMENTUM: Loads previous scores for trend analysis.
   *
   * @param sheet - The Leaderboard sheet instance.
   * @param rosterSchema - The schema configuration for the Roster sheet.
   */
  loadPreviousScores(sheet: GoogleAppsScript.Spreadsheet.Sheet, rosterSchema: Record<string, number>): Map<string, number> {
    const scores = new Map<string, number>();
    const lastRow = sheet.getLastRow();
    const maxCols = sheet.getMaxColumns();
    const startRow = CONFIG.LAYOUT.DATA_START_ROW;

    // THREAT: Unvalidated spreadsheet ingestion leading to incorrect trend analysis.
    // Target B [1]: Validating the scoreDataRow ensures only sanitized data enters the trend map.
    if (lastRow >= startRow && maxCols > rosterSchema.RAW_SCORE) {
      const oldData = sheet.getRange(startRow, 1, lastRow - startRow + 1, maxCols).getValues();
      oldData.forEach((previousScoreRow: unknown[]) => {
        if (previousScoreRow.length > rosterSchema.RAW_SCORE) {
          const rawTag = String(previousScoreRow[rosterSchema.TAG]).trim();
          const score = previousScoreRow[rosterSchema.RAW_SCORE];
          
          if (rawTag) {
            const cleanKey = rawTag.replace("#", "").trim().toLowerCase();
            const scoreVal = Number(score);
            if (!isNaN(scoreVal)) scores.set(cleanKey, scoreVal);
          }
        }
      });
    }
    return scores;
  },

  /**
   * REHYDRATION: Reconstitutes War History from LB sheet archives.
   *
   * @param sheet - The Leaderboard sheet instance.
   * @param rosterSchema - The schema configuration for the Roster sheet.
   */
  rehydrateWarHistory(sheet: GoogleAppsScript.Spreadsheet.Sheet, rosterSchema: Record<string, number>): Map<string, Map<string, number>> {
    const historyMap = new Map<string, Map<string, number>>();
    const lastRow = sheet.getLastRow();
    const startRow = CONFIG.LAYOUT.DATA_START_ROW;

    if (lastRow >= startRow && sheet.getMaxColumns() > rosterSchema.HISTORY) {
      const tagData = sheet.getRange(startRow, 1 + rosterSchema.TAG, lastRow - startRow + 1, 1).getValues();
      const histData = sheet.getRange(startRow, 1 + rosterSchema.HISTORY, lastRow - startRow + 1, 1).getValues();

      tagData.forEach((tagRow: unknown[], tagIndex: number) => {
        // THREAT: Anemic variable 'tagRow' renamed to domain-descriptive name.
        const tag = String(tagRow[0]).trim();
        const histStr = histData[tagIndex][0];
        if (tag && typeof histStr === "string" && histStr.length > 0) {
            const cleanKey = (tag.startsWith("#") ? tag : "#" + tag).trim().toUpperCase();
            const archivedMap = Registry.Services.Core.parseWarHistory(histStr);
            if (archivedMap.size > 0) historyMap.set(cleanKey, archivedMap);
          }
      });
    }
    return historyMap;
  },

  /**
   * PROPHET CACHE: Loads/Saves recruit intelligence.
   */
  getProphetCache(): Map<string, ProphetIntel> {
    const CACHE_KEY = "PROPHET_CACHE_V1";
    const cache = new Map<string, ProphetIntel>();
    const raw = Registry.Services.Store.props.getChunked<Record<string, unknown>>(CACHE_KEY, {});
    
    Object.keys(raw).forEach(tag => {
      // THREAT: Corrupted Prophet Cache data bypassing heritage lookups.
      // Target B [1]: Valibot validation ensures every cache entry conforms to the contract.
      const result = v.safeParse(ProphetIntelSchema, raw[tag]);
      if (result.success) {
        cache.set(tag, result.output);
      }
    });
    return cache;
  },

  saveProphetCache(results: PlayerResult[], cache: Map<string, ProphetIntel>): void {
    const CACHE_KEY = "PROPHET_CACHE_V1";
    const finalExport: Record<string, ProphetIntel> = {};
    results.forEach(playerResult => {
      if (playerResult.daysTracked < CONFIG.SYSTEM.PROPHET_TENURE_THRESHOLD && cache.has(playerResult.tag)) {
        const intel = cache.get(playerResult.tag);
        if (intel) finalExport[playerResult.tag] = intel;
      }
    });
    Registry.Services.Store.props.setChunked(CACHE_KEY, finalExport);
  },

  /**
   * RECOVERY: Loads Tenure and Battle Credits from database.
   */
  loadMarketIntelligence(): Map<string, MarketIntelligence> {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const databaseSheet = activeSpreadsheet.getSheetByName(CONFIG.SHEETS.DB);
    const intelligence = new Map<string, MarketIntelligence>();

    if (databaseSheet && databaseSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
      const databaseValues = databaseSheet.getRange(
        CONFIG.LAYOUT.DATA_START_ROW, 2,
        databaseSheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1), 12
      ).getValues();
      const databaseSchema = CONFIG.SCHEMA.DB;

      databaseValues.forEach((databaseSnapshotRow: unknown[]) => {
        // THREAT: Anemic variables ('S_DB', 'dbSnapshotRow') replaced with descriptive names.
        const rawPayload = {
          tag: String(databaseSnapshotRow[databaseSchema.TAG]),
          name: String(databaseSnapshotRow[databaseSchema.NAME]),
          role: String(databaseSnapshotRow[databaseSchema.ROLE]),
          trophies: Number(databaseSnapshotRow[databaseSchema.TROPHIES]),
          donations: Number(databaseSnapshotRow[databaseSchema.DON_GIVEN]),
          donationsReceived: Number(databaseSnapshotRow[databaseSchema.DON_REC]),
          lastSeen: String(databaseSnapshotRow[databaseSchema.LAST_SEEN]),
          // Extra fields for Intelligence
          date: String(databaseSnapshotRow[databaseSchema.DATE]),
          warFame: databaseSnapshotRow[databaseSchema.WAR_FAME],
          battleCredits: databaseSnapshotRow[databaseSchema.BATTLE_CREDITS]
        };

        // [GUARD] VALIDATION BOUNDARY: Target B [1]
        // Rationale: Strict validation of database rows ensures calculations for
        // Tenure and Battle Credits are based on valid, sanitized metrics.
        const result = v.safeParse(ClanMemberSnapshotSchema, rawPayload);
        if (!result.success) {
          console.warn("[RosterStore] DB Row Validation Failed:", result.issues);
          return;
        }

        const data = result.output;
        const date = Registry.Services.Time.parseFlexibleDate(data.lastSeen);
        const donationsGiven = data.donations;
        const rawWarFame = data.warFame;
        const weekId = Registry.Services.Time.calculateWarWeekId(date);

        const snapshotDate = Registry.Services.Time.parseFlexibleDate(data.date || "");
        // DERIVATION: Tenure is strictly limited to the first system recording in the Database.
        // We no longer factor in 'Last Seen' (game activity) as this artificially inflates
        // tenure for players who were inactive for long periods before joining the clan.
        const rowEarliest = snapshotDate;

        if (!intelligence.has(data.tag)) {
          const newIntel: MarketIntelligence = {
            firstSeen: rowEarliest,
            weeklyMax: new Map(),
            battleWeeks: new Set(),
            totalBattleCredits: 0,
            discoveredBattleDays: new Set(),
            dailyBattleCredits: new Map(),
            fameHistory: new Map()
          };
          intelligence.set(data.tag, newIntel);
        }

        const memberHistory = intelligence.get(data.tag)!;
        if (rowEarliest && rowEarliest.getTime() > 0 && rowEarliest < memberHistory.firstSeen) {
          memberHistory.firstSeen = rowEarliest;
        }
        const currentMax = memberHistory.weeklyMax.get(weekId) || 0;
        if (donationsGiven > currentMax) memberHistory.weeklyMax.set(weekId, donationsGiven);

        const fameVal = Number(rawWarFame);
        if (!isNaN(fameVal)) {
          memberHistory.battleWeeks.add(weekId);
          memberHistory.discoveredBattleDays.add(Registry.Services.Time.formatShortDate(date));
          
          const currentFameMax = memberHistory.fameHistory.get(weekId) || 0;
          if (fameVal > currentFameMax) memberHistory.fameHistory.set(weekId, fameVal);
        }

        const rawBattleCredits = data.battleCredits;
        let creditVal = Number(rawBattleCredits);
        if (isNaN(creditVal) || rawBattleCredits === "") creditVal = (fameVal > 0) ? 1 : 0;

        if (creditVal > 0) {
          const dateKey = Registry.Services.Time.formatShortDate(date);
          const currentDayMax = memberHistory.dailyBattleCredits.get(dateKey) || 0;
          if (creditVal > currentDayMax) memberHistory.dailyBattleCredits.set(dateKey, creditVal);
        }
      });

      // Summation
      intelligence.forEach(memberHistory => {
        let sum = 0;
        memberHistory.dailyBattleCredits.forEach((dailyCreditValue: number) => { sum += dailyCreditValue; });
        memberHistory.totalBattleCredits = sum;

        // THREAT: Internal state corruption from unvalidated MarketIntelligence objects.
        // Target B [1]: Validate the final aggregated object before returning.
        const validation = v.safeParse(MarketIntelligenceSchema, memberHistory);
        if (!validation.success) {
          console.error(`[RosterStore] Market Intelligence corrupted for member.`, validation.issues);
        }
      });
    }
    return intelligence;
  },

  /**
   * PERFORMANCE: Loads the top N tags from the Leaderboard sheet.
   * Assumes the sheet is already sorted by the Roster service.
   *
   * @param count - Number of top performers to retrieve.
   */
  loadTopPerformers(count: number = 3): string[] {
    const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    const rosterSheet = activeSpreadsheet.getSheetByName(CONFIG.SHEETS.ROSTER);
    const startRow = CONFIG.LAYOUT.DATA_START_ROW;
    const rosterSchema = CONFIG.SCHEMA.ROSTER;
    
    // THREAT: Anemic variables ('ss', 'sheet', 'L') replaced with descriptive names.
    if (!rosterSheet || rosterSheet.getLastRow() < startRow) return [];
    
    // Column B is the start of the data range. rosterSchema.TAG (0) is Column B.
    // getRange(row, column, numRows, numColumns)
    const lastRow = rosterSheet.getLastRow();
    const actualCount = Math.min(count, lastRow - startRow + 1);
    if (actualCount <= 0) return [];

    const rows = rosterSheet.getRange(startRow, 2, actualCount, 1).getValues();
    return rows
      .map((topPerformerRow: unknown[]) => String(topPerformerRow[0]).trim())
      .filter((tag: string) => tag && tag !== "" && tag.startsWith("#"));
  }
};

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { RosterStore });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default RosterStore;
