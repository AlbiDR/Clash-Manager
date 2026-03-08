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
      oldData.forEach((row: any) => {
        if (row.length > L.RAW_SCORE) {
          const rawTag = String(row[L.TAG]).trim();
          const score = row[L.RAW_SCORE];
          
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

      tagData.forEach((row: any, i: number) => {
        const tag = String(row[0]).trim();
        const histStr = histData[i][0];
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
    results.forEach(r => {
      if (r.daysTracked < CONFIG.SYSTEM.PROPHET_TENURE_THRESHOLD && cache.has(r.tag)) {
        finalExport[r.tag] = cache.get(r.tag);
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

      dbValues.forEach((row: any) => {
        const payload = {
          tag: String(row[S_DB.TAG]),
          name: String(row[S_DB.NAME]),
          role: String(row[S_DB.ROLE]),
          trophies: Number(row[S_DB.TROPHIES]),
          donations: Number(row[S_DB.DONATIONS]),
          donationsReceived: Number(row[S_DB.DONATIONS_RECEIVED]),
          lastSeen: String(row[S_DB.LAST_SEEN])
        };

        const result = v.safeParse(ClanMemberSnapshotSchema, payload);
        if (!result.success) return;

        const data = result.output;
        const date = Registry.Services.Time.parseFlexibleDate(data.lastSeen);
        const donGiven = data.donations;
        const rawWarFame = row[S_DB.WAR_FAME];
        const weekId = Registry.Services.Time.calculateWarWeekId(date);

        if (!intelligence.has(data.tag)) {
          intelligence.set(data.tag, {
            firstSeen: date,
            weeklyMax: new Map(),
            battleWeeks: new Set(),
            totalBattleCredits: 0,
            discoveredBattleDays: new Set(),
            dailyBattleCredits: new Map(),
            fameHistory: new Map()
          });
        }

        const h = intelligence.get(data.tag)!;
        if (date < h.firstSeen) h.firstSeen = date;
        const currentMax = h.weeklyMax.get(weekId) || 0;
        if (donGiven > currentMax) h.weeklyMax.set(weekId, donGiven);

        const fameVal = Number(rawWarFame);
        if (!isNaN(fameVal)) {
          h.battleWeeks.add(weekId);
          h.discoveredBattleDays.add(Registry.Services.Time.formatShortDate(date));
          
          const currentFameMax = h.fameHistory.get(weekId) || 0;
          if (fameVal > currentFameMax) h.fameHistory.set(weekId, fameVal);
        }

        const rawBattleCredits = row[S_DB.BATTLE_CREDITS];
        let creditVal = Number(rawBattleCredits);
        if (isNaN(creditVal) || rawBattleCredits === "") creditVal = (fameVal > 0) ? 1 : 0;

        if (creditVal > 0) {
          const dateKey = Registry.Services.Time.formatShortDate(date);
          const currentDayMax = h.dailyBattleCredits.get(dateKey) || 0;
          if (creditVal > currentDayMax) h.dailyBattleCredits.set(dateKey, creditVal);
        }
      });

      // Summation
      intelligence.forEach(h => {
        let sum = 0;
        h.dailyBattleCredits.forEach((val: number) => sum += val);
        h.totalBattleCredits = sum;
      });
    }
    return intelligence;
  }
};

export default RosterStore;
