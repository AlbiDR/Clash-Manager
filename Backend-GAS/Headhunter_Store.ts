
import { CONFIG } from './Configuration';
import Registry from './Registry';
import type { Recruit, BlacklistResult, BlacklistEntry } from './Headhunter_Types';

/**
 * ============================================================================
 * MODULE: HEADHUNTER STORE
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Persistence handling for the Headhunter system.
 *    Manages the Recruit Database and the Blacklist Event Stream.
 * ============================================================================
 */

export interface HeadhunterStoreContract {
  /**
   * Loads the current recruit pool from the Headhunter sheet.
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

    const recruitMap = new Map<string, Recruit>();
    rows.forEach((r: any) => {
      const tag = String(r[H.TAG]);
      if (tag) {
        recruitMap.set(tag, {
          tag,
          invited: false,
          name: String(r[H.NAME]),
          trophies: Number(r[H.TROPHIES]),
          donations: Number(r[H.DONATIONS]),
          cards: Number(r[H.CARDS]),
          war: Number(r[H.WAR_WINS]),
          foundDate: Registry.Services.Time.parseFlexibleDate(r[H.FOUND_DATE]),
          rawScore: Number(r[H.RAW_SCORE]),
          potentialScore: Number(r[H.POTENTIAL_SCORE]),
          lastScan: r[H.LAST_SCAN] ? new Date(r[H.LAST_SCAN]).getTime() : 0,
        });
      }
    });
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
      rawData.forEach((row: any) => {
        const tag = String(row[0]).trim().toUpperCase();
        if (!tag) return;
        const expiry = Number(row[1]) || 0;
        const score = Number(row[2]) || 0;

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
      // Get TAG (Column B is index 1, but SCHEMA.HH.TAG is 0 relative to start?)
      // BATCH LOAD SURVIVAL: Map tags to recruits
      // SCHEMA.HH.TAG is 0. So it gets columns B to ...
      
      const rawMain = sheet.getRange(startRow, 2, numRows, H.LAST_SCAN + 1).getValues();
      rawMain.forEach((r: any, i: number) => {
        const tag = String(r[H.TAG]).trim().toUpperCase();
        if (tag) {
          mainDataMap.set(tag, { 
            row: startRow + i, 
            score: Number(r[H.RAW_SCORE]) || 0 
          });
        }
      });
    }

    // --- 1. RECONCILE EVENT STREAM (Hot Dismissals) ---
    if (evtSheet.getLastRow() > 1) {
      // Upgraded to support optional 3rd column: [Tag, Timestamp, Score]
      const rawEvt = evtSheet.getDataRange().getValues();
      for (let i = 1; i < rawEvt.length; i++) {
         const tag = String(rawEvt[i][0]).toUpperCase().trim();
         if (!tag) continue;

         const meta = mainDataMap.get(tag);
         const evtScore = Number(rawEvt[i][2]) || 0; // Optional 3rd column

         // A. Add to Blacklist memory with Score preservation (EVT vs Main vs Existing)
         if (!entryMap.has(tag)) {
           entryMap.set(tag, { t: tag, e: now + expiryDuration, s: Math.max(evtScore, meta ? meta.score : 0) });
         } else {
           const existing = entryMap.get(tag)!;
           existing.s = Math.max(existing.s, evtScore, meta ? meta.score : 0);
         }

         // B. Tick main sheet visually
         if (meta) {
           sheet.getRange(meta.row, 2 + H.INVITED).setValue(true);
         }
      }
      // C. Clear the log (Reconciliation Complete)
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
      
      // FIX: Deduplicate read. Use the H.INVITED index within the already-loaded rawMain.
      const rawMain = sheet.getRange(startRow, 2, numRows, H.LAST_SCAN + 1).getValues();

      rawMain.forEach((r: any, i: number) => {
        const tag = String(r[H.TAG]).trim().toUpperCase();
        if (!tag) return;

        const isInvited = r[H.INVITED] === true || String(r[H.INVITED]).toUpperCase() === "TRUE";
        const score = Number(r[H.RAW_SCORE]) || 0;
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
      const output = validEntries.map((e) => [e.t, e.e, e.s]);
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
      ids: new Set(validEntries.map((e) => e.t)),
      entries: validEntries.map((e) => ({ rawScore: e.s })),
    };
  },

  loadQueue(ss: any): Map<string, Recruit> {
    const queueSheet = ss.getSheetByName(CONFIG.SHEETS.QUEUE);
    if (!queueSheet || queueSheet.getLastRow() < 2) return new Map();

    // SAFETY CHECK: Use getDataRange to avoid "Range coordinates are invalid" on legacy 9-col sheets
    const range = queueSheet.getRange(2, 1, queueSheet.getLastRow() - 1, queueSheet.getLastColumn());
    const data = range.getValues();
    
    const map = new Map<string, Recruit>();
    const now = Date.now();
    const expiryMs = (CONFIG.HEADHUNTER.QUEUE_EXPIRY_DAYS || 7) * 86400000;
    
    // Index mapping based on current width
    const INDEX_TAG = 0;
    const INDEX_LAST_SCAN = 9; // Expected index for Column J

    data.forEach((r: any) => {
      const tag = String(r[INDEX_TAG]).trim().toUpperCase();
      // Safety: Check if row has enough columns, else undefined
      const foundDate = Registry.Services.Time.parseFlexibleDate(r[7]);
      
      // Expiry check
      if (now - foundDate.getTime() > expiryMs) return;

      if (tag) {
        map.set(tag, {
          tag,
          name: String(r[1]),
          trophies: Number(r[2]),
          donations: Number(r[3]),
          cards: Number(r[4]),
          war: Number(r[5]),
          rawScore: Number(r[6]),
          foundDate: foundDate,
          invited: false,
          source: r[8] || "TOURNAMENT",
          // Safety: Access index only if it exists in this row
          lastScan: (r.length > INDEX_LAST_SCAN && r[INDEX_LAST_SCAN]) ? new Date(r[INDEX_LAST_SCAN]).getTime() : 0 
        });
      }
    });

    return map;
  },

  saveQueue(ss: any, recruits: Recruit[]): { count: number; pruned: number } {
    const sheetName = CONFIG.SHEETS.QUEUE;
    const queueSheet = ss.getSheetByName(sheetName) || ss.insertSheet(sheetName);
    const HOT_COLOR = "#795548"; // Brownish color for the Queue (Bench)

    if (queueSheet.getLastRow() === 0) {
      queueSheet.getRange(1, 1, 1, 10).setValues([["Tag", "Name", "Trophies", "Donations", "Cards", "War", "Raw Score", "Found Date", "Source", "Last Scan"]]);
      queueSheet.setTabColor(HOT_COLOR);
      Registry.Services.View.tagSheet(queueSheet, "TECHNICAL");
      queueSheet.hideSheet();
    }

    const maxQueue = CONFIG.HEADHUNTER.MAX_QUEUE_SIZE || 500;
    const toSave = recruits.slice(0, maxQueue);
    const ssId = ss.getId();

    // SAFETY: Ensure sheet has at least 10 columns (A-J) for the new schema
    // The previous version (v12.1.16) only used 9 columns (A-I).
    if (queueSheet.getMaxColumns() < 10) {
       queueSheet.insertColumnsAfter(queueSheet.getMaxColumns(), 10 - queueSheet.getMaxColumns());
    }
    // ALWAYS enforce headers to ensure Schema Sync
    queueSheet.getRange(1, 1, 1, 10).setValues([["Tag", "Name", "Trophies", "Donations", "Cards", "War", "Raw Score", "Found Date", "Source", "Last Scan"]]);

    // Prepare the 2D array for the entire queue range (2 to maxQueue + 1)
    // This allows us to overwrite old data and set new data in ONE ATOMIC CALL.
    const values = new Array(maxQueue).fill(0).map(() => new Array(10).fill(""));
    
    toSave.forEach((r, i) => {
      values[i] = [
        r.tag,
        r.name,
        r.trophies,
        r.donations,
        r.cards,
        r.war,
        r.rawScore,
        Registry.Services.Time.formatDate(r.foundDate),
        r.source || "TOURNAMENT",
        r.lastScan ? Registry.Services.Time.formatDatetime(new Date(r.lastScan)) : ""
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
      // Fallback for non-Advanced API environments (though unlikely in production)
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
