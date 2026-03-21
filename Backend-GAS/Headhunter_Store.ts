import { CONFIG } from './Configuration';
import Registry from './Registry';
import type { Recruit } from './Headhunter_Types';
import * as v from 'valibot';
import { RecruitSchema } from './Validation';

/**
 * ============================================================================
 * MODULE: HEADHUNTER STORE
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Persistence layer for Recruitment data.
 *    Handles Database I/O, Blacklist reconciliation, and Queue management.
 * ============================================================================
 */

declare var Sheets: any;
declare var SpreadsheetApp: any;

export interface BlacklistEntry {
  t: string; // tag
  e: number; // expiry timestamp
  s: number; // score
}

export interface BlacklistResult {
  ids: Set<string>;
  entries: Array<{ rawScore: number }>;
}

export interface HeadhunterStoreContract {
  /**
   * Loads the current active recruits from the Headhunter sheet.
   */
  loadDatabase(sheet: any): Map<string, Recruit>;

  /**
   * Reconciles the Blacklist by processing the Event Stream (EVT)
   * and Manual Ticks (HH Sheet). Persists changes and cleans up.
   */
  updateAndGetBlacklist(sheet: any): BlacklistResult;

  /**
   * Loads the recruitment queue reservoir.
   */
  loadQueue(ss: any): Map<string, Recruit>;

  /**
   * Persists the recruitment queue reservoir with freshness pruning.
   */
  saveQueue(ss: any, recruits: Recruit[]): { count: number; pruned: number };
}

const HeadhunterStore: HeadhunterStoreContract = {
  
  loadDatabase(sheet: any): Map<string, Recruit> {
    if (!sheet || sheet.getLastRow() < CONFIG.LAYOUT.DATA_START_ROW) return new Map();
    const H = CONFIG.SCHEMA.HH;
    const rows = sheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        2,
        sheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1),
        20,
      )
      .getValues();

    const parseNumeric = (val: any): number => {
      if (val === "" || val === null || val === undefined) return 0;
      const clean = String(val).replace(/[^0-9.-]/g, "");
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : num;
    };

    const parseDateMs = (val: any): number => {
      if (!val) return 0;
      const t = new Date(val).getTime();
      return isNaN(t) ? 0 : t;
    };

    const recruitMap = new Map<string, Recruit>();
    rows.forEach((recruitRow: any, i: number) => {
      const rawTag = String(recruitRow[H.TAG]);
      const tag = Registry.Services.Core.normalizeTag(rawTag);
      if (tag) {
        const payload = {
          tag,
          invited: recruitRow[H.INVITED] === true || String(recruitRow[H.INVITED]).toUpperCase() === "TRUE",
          name: String(recruitRow[H.NAME]),
          trophies: parseNumeric(recruitRow[H.TROPHIES]),
          donations: parseNumeric(recruitRow[H.DONATIONS]),
          cards: parseNumeric(recruitRow[H.CARDS]),
          war: parseNumeric(recruitRow[H.WAR_WINS]),
          foundDate: Registry.Services.Time.parseFlexibleDate(recruitRow[H.FOUND_DATE]),
          rawScore: parseNumeric(recruitRow[H.RAW_SCORE]),
          potentialScore: parseNumeric(recruitRow[H.POTENTIAL_SCORE]),
          lastScan: parseDateMs(recruitRow[H.LAST_SCAN]),
        };

        const result = v.safeParse(RecruitSchema, payload);
        if (result.success) {
          recruitMap.set(tag, result.output as Recruit);
        } else {
          const errors = result.issues.map(iss => `${iss.path?.[0]?.key}: ${iss.message}`).join(", ");
          console.warn(`HeadhunterStore: Validation failed for row ${CONFIG.LAYOUT.DATA_START_ROW + i} (${tag}). Errors: ${errors}`);
        }
      }
    });

    if (recruitMap.size === 0 && rows.length > 0) {
      console.error(`CRITICAL: HeadhunterStore loaded 0 recruits from ${rows.length} rows. Possible schema or validation failure.`);
    }

    return recruitMap;
  },

  updateAndGetBlacklist(sheet: any): BlacklistResult {
    if (!sheet) return { ids: new Set(), entries: [] };
    const ss = sheet.getParent();
    // Ensure Technical Sheets exist with proper headers
    const blSheet = ss.getSheetByName(CONFIG.SHEETS.BL) || ss.insertSheet(CONFIG.SHEETS.BL);
    if (blSheet.getLastRow() === 0) {
      blSheet.getRange(1, 1, 1, 3).setValues([["Tag", "Expiry", "Raw Score"]]);
    }
    // Robust header verification (Ensures headers persist even if cleared)
    if (blSheet.getRange(1,1).getValue() !== "Tag") {
       blSheet.getRange(1, 1, 1, 3).setValues([["Tag", "Expiry", "Raw Score"]]);
    }

    const evtSheet = ss.getSheetByName(CONFIG.SHEETS.EVT) || ss.insertSheet(CONFIG.SHEETS.EVT);
    if (evtSheet.getLastRow() === 0) {
      evtSheet.getRange(1, 1, 1, 3).setValues([["Tag", "Timestamp", CONFIG.SCHEMA.HH_HEADERS.RAW_SCORE]]);
    }
    if (evtSheet.getRange(1, 1).getValue() !== "Tag" || evtSheet.getLastColumn() < 3) {
       evtSheet.getRange(1, 1, 1, 3).setValues([["Tag", "Timestamp", CONFIG.SCHEMA.HH_HEADERS.RAW_SCORE]]);
    }

    const now = Date.now();
    const expiryDuration = (CONFIG.HEADHUNTER.BLACKLIST_DAYS || 30) * 86400000;
    const entryMap = new Map<string, BlacklistEntry>();

    // A. Load existing Blacklist (Skip Header row 1)
    if (blSheet.getLastRow() > 1) {
      const rawData = blSheet.getRange(2, 1, blSheet.getLastRow() - 1, 3).getValues();
      rawData.forEach((blacklistRow: any) => {
        const tag = Registry.Services.Core.normalizeTag(blacklistRow[0]);
        if (!tag) return;
        const expiry = Number(blacklistRow[1]) || 0;
        const score = Number(blacklistRow[2]) || 0;

        if (expiry > now) {
          if (entryMap.has(tag)) {
            const existing = entryMap.get(tag)!;
            existing.e = Math.max(existing.e, expiry);
            existing.s = Math.max(existing.s, score);
          } else {
            entryMap.set(tag, { t: tag, e: expiry, s: score });
          }
        }
      });
    }

    // B. Pre-load Recruit Metadata from Main Sheet for matching
    const H = CONFIG.SCHEMA.HH;
    const mainDataMap = new Map<string, { row: number; score: number }>();
    if (sheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
      const startRow = CONFIG.LAYOUT.DATA_START_ROW;
      const numRows = sheet.getLastRow() - startRow + 1;
      
      const rawMain = sheet.getRange(startRow, 2, numRows, H.LAST_SCAN + 1).getValues();
      rawMain.forEach((mainSheetRow: any, i: number) => {
        const tag = Registry.Services.Core.normalizeTag(mainSheetRow[H.TAG]);
        if (tag) {
          mainDataMap.set(tag, { 
            row: startRow + i, 
            score: Number(mainSheetRow[H.RAW_SCORE]) || 0 
          });
        }
      });
    }

    // --- 1. RECONCILE EVENT STREAM (Hot Dismissals) ---
    if (evtSheet.getLastRow() > 1) {
      const rawEvt = evtSheet.getDataRange().getValues();
      for (let i = 1; i < rawEvt.length; i++) {
         const tag = Registry.Services.Core.normalizeTag(rawEvt[i][0]);
         if (!tag) continue;

         const meta = mainDataMap.get(tag);
         const evtScore = Number(rawEvt[i][2]) || 0;

         if (!entryMap.has(tag)) {
           entryMap.set(tag, { t: tag, e: now + expiryDuration, s: Math.max(evtScore, meta ? meta.score : 0) });
         } else {
           const existing = entryMap.get(tag)!;
           existing.s = Math.max(existing.s, evtScore, meta ? meta.score : 0);
         }

         if (meta) {
           sheet.getRange(meta.row, 2 + H.INVITED).setValue(true);
         }
      }
      const lastRow = evtSheet.getLastRow();
      if (lastRow > 1) {
        evtSheet.getRange(2, 1, lastRow - 1, evtSheet.getLastColumn()).clearContent();
      }
    }

    // --- 2. AUDIT MANUAL TICKS (Standard Cleanup) ---
    const rowsToDelete: number[] = [];
    if (sheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
      const startRow = CONFIG.LAYOUT.DATA_START_ROW;
      const numRows = sheet.getLastRow() - startRow + 1;
      const rawMain = sheet.getRange(startRow, 2, numRows, H.LAST_SCAN + 1).getValues();

      rawMain.forEach((mainSheetRow: any, i: number) => {
        const tag = Registry.Services.Core.normalizeTag(mainSheetRow[H.TAG]);
        if (!tag) return;

        const isInvited = mainSheetRow[H.INVITED] === true || String(mainSheetRow[H.INVITED]).toUpperCase() === "TRUE";
        const score = Number(mainSheetRow[H.RAW_SCORE]) || 0;
        const rowNum = startRow + i;

        if (isInvited) {
          if (entryMap.has(tag)) {
            const existingEntry = entryMap.get(tag)!;
            existingEntry.e = now + expiryDuration;
            existingEntry.s = Math.max(existingEntry.s, score);
          } else {
            entryMap.set(tag, { t: tag, e: now + expiryDuration, s: score });
          }
          rowsToDelete.push(rowNum);
        }
      });
    }

    // --- 3. PERSIST BLACKLIST ---
    const validEntries = Array.from(entryMap.values());
    validEntries.sort((a, b) => b.s - a.s);

    if (blSheet.getLastRow() > 1) {
      blSheet.getRange(2, 1, blSheet.getLastRow() - 1, 3).clearContent();
    }
    if (validEntries.length > 0) {
      const output = validEntries.map((blacklistEntry) => [blacklistEntry.t, blacklistEntry.e, blacklistEntry.s]);
      blSheet.getRange(2, 1, output.length, 3).setValues(output);
    }

    if (rowsToDelete.length > 0) {
      const sortedRows = [...new Set(rowsToDelete)].sort((a, b) => b - a);
      const sheetId = sheet.getSheetId();
      const ssId = ss.getId();

      const deleteRequests = sortedRows.map(rowIdx => ({
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: "ROWS",
            startIndex: rowIdx - 1,
            endIndex: rowIdx
          }
        }
      }));

      if (deleteRequests.length > 0) {
        // @ts-ignore
        if (typeof Sheets !== 'undefined' && Sheets.Spreadsheets) {
          Sheets.Spreadsheets.batchUpdate({ requests: deleteRequests }, ssId);
        }
        console.info(`Cleanup: Atomic deletion of ${deleteRequests.length} row(s) complete.`);
        // @ts-ignore
        if (typeof SpreadsheetApp !== 'undefined') SpreadsheetApp.flush();
      }
    }

    return {
      ids: new Set(validEntries.map((blacklistEntry) => blacklistEntry.t)),
      entries: validEntries.map((blacklistEntry) => ({ rawScore: blacklistEntry.s })),
    };
  },

  loadQueue(ss: any): Map<string, Recruit> {
    const queueSheet = ss.getSheetByName(CONFIG.SHEETS.QUEUE);
    if (!queueSheet || queueSheet.getLastRow() < 2) return new Map();

    const range = queueSheet.getRange(2, 1, queueSheet.getLastRow() - 1, queueSheet.getLastColumn());
    const data = range.getValues();
    
    const map = new Map<string, Recruit>();
    const now = Date.now();
    const expiryMs = (CONFIG.HEADHUNTER.QUEUE_EXPIRY_DAYS || 7) * 86400000;
    
    const INDEX_TAG = 0;
    const INDEX_LAST_SCAN = 9;

    const parseDateMs = (val: any): number => {
      if (!val) return 0;
      const t = new Date(val).getTime();
      return isNaN(t) ? 0 : t;
    };

    data.forEach((queueRow: any, i: number) => {
      const tag = Registry.Services.Core.normalizeTag(queueRow[INDEX_TAG]);
      const foundDate = Registry.Services.Time.parseFlexibleDate(queueRow[7]);
      
      if (now - foundDate.getTime() > expiryMs) return;

      if (tag) {
        const payload = {
          tag,
          name: String(queueRow[1]),
          trophies: Number(queueRow[2]),
          donations: Number(queueRow[3]),
          cards: Number(queueRow[4]),
          war: Number(queueRow[5]),
          rawScore: Number(queueRow[6]),
          foundDate: foundDate,
          invited: false,
          source: queueRow[8] || "TOURNAMENT",
          lastScan: parseDateMs(queueRow[INDEX_LAST_SCAN]) 
        };

        const result = v.safeParse(RecruitSchema, payload);
        if (result.success) {
          map.set(tag, result.output as Recruit);
        } else {
          console.warn(`HeadhunterStore: Queue validation failed for tag ${tag}. Errors:`, result.issues.map(iss => `${iss.path?.[0]?.key}: ${iss.message}`).join(", "));
        }
      }
    });

    return map;
  },

  saveQueue(ss: any, recruits: Recruit[]): { count: number; pruned: number } {
    const sheetName = CONFIG.SHEETS.QUEUE;
    const queueSheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    const HOT_COLOR = "#795548";

    if (queueSheet.getLastRow() === 0) {
      queueSheet.getRange(1, 1, 1, 10).setValues([["Tag", "Name", "Trophies", "Donations", "Cards", "War", "Raw Score", "Found Date", "Source", "Last Scan"]]);
      queueSheet.setTabColor(HOT_COLOR);
      Registry.Services.View.tagSheet(queueSheet, "TECHNICAL");
      queueSheet.hideSheet();
    }

    const maxQueue = CONFIG.HEADHUNTER.MAX_QUEUE_SIZE || 500;
    const toSave = recruits.slice(0, maxQueue);
    const ssId = ss.getId();

    if (queueSheet.getMaxColumns() < 10) {
       queueSheet.insertColumnsAfter(queueSheet.getMaxColumns(), 10 - queueSheet.getMaxColumns());
    }
    queueSheet.getRange(1, 1, 1, 10).setValues([["Tag", "Name", "Trophies", "Donations", "Cards", "War", "Raw Score", "Found Date", "Source", "Last Scan"]]);

    const values = new Array(maxQueue).fill(0).map(() => new Array(10).fill(""));
    
    toSave.forEach((recruitObject, i) => {
      values[i] = [
        Registry.Services.Core.normalizeTag(recruitObject.tag),
        recruitObject.name,
        recruitObject.trophies,
        recruitObject.donations,
        recruitObject.cards,
        recruitObject.war,
        recruitObject.rawScore,
        Registry.Services.Time.formatDate(recruitObject.foundDate),
        recruitObject.source || "TOURNAMENT",
        recruitObject.lastScan ? Registry.Services.Time.formatDatetime(new Date(recruitObject.lastScan)) : ""
      ];
    });

    if (typeof Sheets !== 'undefined' && Sheets.Spreadsheets) {
      const range = `'${sheetName}'!A2:J${maxQueue + 1}`;
      Sheets.Spreadsheets.Values!.update(
        { values: values },
        ssId,
        range,
        { valueInputOption: "USER_ENTERED" }
      );
    } else {
      if (queueSheet.getLastRow() > 1) {
        queueSheet.getRange(2, 1, queueSheet.getLastRow() - 1, 10).clearContent();
      }
      if (toSave.length > 0) {
        queueSheet.getRange(2, 1, toSave.length, 10).setValues(values.slice(0, toSave.length));
      }
    }

    return { count: toSave.length, pruned: Math.max(0, recruits.length - maxQueue) };
  }
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = HeadhunterStore;
}

(function(scope: any) {
  Object.assign(scope, { HeadhunterStore });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default HeadhunterStore;
