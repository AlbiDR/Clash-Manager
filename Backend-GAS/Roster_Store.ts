import { CONFIG } from './Configuration';
import Registry from './Registry';
import { ClanMemberResult, WarLogItem, RaceParticipant, PlayerResult } from './Roster_Types';
import * as v from 'valibot';
import { ClanMemberSnapshotSchema } from './Validation';

declare var SpreadsheetApp: any;

const RosterStore = {
  /**
   * MOMENTUM: Loads previous scores for trend analysis.
   */
  loadPreviousScores(sheet: any, L: any): Map<string, number> {
    const scores = new Map<string, number>();
    const lastRow = sheet.getLastRow();
    const maxCols = sheet.getMaxColumns();
    const startRow = CONFIG.LAYOUT.DATA_START_ROW;

    if (lastRow >= startRow && maxCols > L.RAW_SCORE) {
      const oldData = sheet.getRange(startRow, 1, lastRow - startRow + 1, maxCols).getValues();
      oldData.forEach((scoreDataRow: any) => {
        if (scoreDataRow.length > L.RAW_SCORE) {
          const rawTag = String(scoreDataRow[L.TAG]).trim();
          const score = scoreDataRow[L.RAW_SCORE];
          
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
   */
  rehydrateWarHistory(sheet: any, L: any): Map<string, Map<string, number>> {
    const historyMap = new Map<string, Map<string, number>>();
    const lastRow = sheet.getLastRow();
    const startRow = CONFIG.LAYOUT.DATA_START_ROW;

    if (lastRow >= startRow && sheet.getMaxColumns() > L.HISTORY) {
      const tagData = sheet.getRange(startRow, 1 + L.TAG, lastRow - startRow + 1, 1).getValues();
      const histData = sheet.getRange(startRow, 1 + L.HISTORY, lastRow - startRow + 1, 1).getValues();

      tagData.forEach((tagRow: any, tagIndex: number) => {
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
  getProphetCache(): Map<string, { wins: number; active: boolean; lastFetch: number }> {
    const CACHE_KEY = "PROPHET_CACHE_V1";
    const cache = new Map<string, { wins: number; active: boolean; lastFetch: number }>();
    const raw = Registry.Services.Store.props.getChunked<Record<string, any>>(CACHE_KEY, {});
    
    Object.keys(raw).forEach(tag => {
      cache.set(tag, {
        wins: raw[tag].wins || 0,
        active: raw[tag].active !== undefined ? raw[tag].active : true,
        lastFetch: raw[tag].lastFetch || 0
      });
    });
    return cache;
  },

  saveProphetCache(results: PlayerResult[], cache: Map<string, any>): void {
    const CACHE_KEY = "PROPHET_CACHE_V1";
    const finalExport: any = {};
    results.forEach(playerResult => {
      if (playerResult.daysTracked < CONFIG.SYSTEM.PROPHET_TENURE_THRESHOLD && cache.has(playerResult.tag)) {
        finalExport[playerResult.tag] = cache.get(playerResult.tag);
      }
    });
    Registry.Services.Store.props.setChunked(CACHE_KEY, finalExport);
  },

  /**
   * RECOVERY: Loads Tenure and Battle Credits from database.
   */
  loadMarketIntelligence(): Map<string, any> {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const dbSheet = ss.getSheetByName(CONFIG.SHEETS.DB);
    const intelligence = new Map<string, any>();

    if (dbSheet && dbSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
      const dbValues = dbSheet.getRange(
        CONFIG.LAYOUT.DATA_START_ROW, 2,
        dbSheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1), 10
      ).getValues();
      const S_DB = CONFIG.SCHEMA.DB;

      dbValues.forEach((dbSnapshotRow: any) => {
        const payload = {
          tag: String(dbSnapshotRow[S_DB.TAG]),
          name: String(dbSnapshotRow[S_DB.NAME]),
          role: String(dbSnapshotRow[S_DB.ROLE]),
          trophies: Number(dbSnapshotRow[S_DB.TROPHIES]),
          donations: Number(dbSnapshotRow[S_DB.DON_GIVEN]),
          donationsReceived: Number(dbSnapshotRow[S_DB.DON_REC]),
          lastSeen: String(dbSnapshotRow[S_DB.LAST_SEEN])
        };

        // Normalize Tag for consistent lookup
        const normalizedTag = payload.tag.trim().toUpperCase();
        payload.tag = normalizedTag;

        const result = v.safeParse(ClanMemberSnapshotSchema, payload);
        if (!result.success) return;

        const data = result.output;
        const date = Registry.Services.Time.parseFlexibleDate(data.lastSeen);
        const donGiven = data.donations;
        const rawWarFame = dbSnapshotRow[S_DB.WAR_FAME];
        const weekId = Registry.Services.Time.calculateWarWeekId(date);

        const snapshotDate = Registry.Services.Time.parseFlexibleDate(dbSnapshotRow[S_DB.DATE]);
        // DERIVATION: The earliest signal for a player is the MIN of their Last Seen (game activity) 
        // and the Snapshot Date (system recording).
        const rowEarliest = (date && date.getTime() > 0 && date < snapshotDate) ? date : snapshotDate;

        if (!intelligence.has(data.tag)) {
          intelligence.set(data.tag, {
            firstSeen: rowEarliest,
            weeklyMax: new Map(),
            battleWeeks: new Set(),
            totalBattleCredits: 0,
            discoveredBattleDays: new Set(),
            dailyBattleCredits: new Map(),
            fameHistory: new Map()
          });
        }

        const memberHistory = intelligence.get(data.tag)!;
        if (rowEarliest && rowEarliest.getTime() > 0 && rowEarliest < memberHistory.firstSeen) {
          memberHistory.firstSeen = rowEarliest;
        }
        const currentMax = memberHistory.weeklyMax.get(weekId) || 0;
        if (donGiven > currentMax) memberHistory.weeklyMax.set(weekId, donGiven);

        const fameVal = Number(rawWarFame);
        if (!isNaN(fameVal)) {
          memberHistory.battleWeeks.add(weekId);
          memberHistory.discoveredBattleDays.add(Registry.Services.Time.formatShortDate(date));
          
          const currentFameMax = memberHistory.fameHistory.get(weekId) || 0;
          if (fameVal > currentFameMax) memberHistory.fameHistory.set(weekId, fameVal);
        }

        const rawBattleCredits = dbSnapshotRow[S_DB.BATTLE_CREDITS];
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
        memberHistory.dailyBattleCredits.forEach((dailyCreditValue: number) => sum += dailyCreditValue);
        memberHistory.totalBattleCredits = sum;
      });
    }
    return intelligence;
  }
};

export default RosterStore;
