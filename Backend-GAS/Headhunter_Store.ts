
import { CONFIG } from './Configuration';
import Registry from './Registry';
import type { Recruit, BlacklistResult, BlacklistEntry } from './Headhunter_Types';

/**
 * ============================================================================
 * 💾 MODULE: HEADHUNTER STORE
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Persistence handling for the Headhunter system.
 *    Manages the Recruit Database and the Blacklist Event Stream.
 * ============================================================================
 */

export interface IHeadhunterStore {
  /**
   * Loads the current recruit pool from the Headhunter sheet.
   */
  loadDatabase(sheet: any): Map<string, Recruit>;

  /**
   * Reconciles the Blacklist by processing the Event Stream (EVT)
   * and Manual Ticks (HH Sheet). Persists changes and cleans up.
   */
  updateAndGetBlacklist(sheet: any): BlacklistResult;
}

const HeadhunterStore: IHeadhunterStore = {
  
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
        });
      }
    });
    return recruitMap;
  },

  updateAndGetBlacklist(sheet: any): BlacklistResult {
    if (!sheet) return { ids: new Set(), entries: [] };
    const ss = sheet.getParent();
    const HOT_COLOR = "#ff5722";
    
    // 🛡️ Ensure Technical Sheets exist with proper headers and styling
    const blSheet = ss.getSheetByName(CONFIG.SHEETS.BL) || ss.insertSheet(CONFIG.SHEETS.BL);
    if (blSheet.getLastRow() === 0) {
      blSheet.getRange(1, 1, 1, 3).setValues([["Tag", "Expiry", "Raw Score"]]);
      blSheet.setTabColor(HOT_COLOR);
    } else {
      blSheet.setTabColor(HOT_COLOR);
    }

    const evtSheet = ss.getSheetByName(CONFIG.SHEETS.EVT) || ss.insertSheet(CONFIG.SHEETS.EVT);
    if (evtSheet.getLastRow() === 0) {
      evtSheet.getRange(1, 1, 1, 2).setValues([["Tag", "Timestamp"]]);
      evtSheet.setTabColor(HOT_COLOR);
    } else {
      evtSheet.setTabColor(HOT_COLOR);
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
      // Wait, Recruiter.ts line 449: sheet.getRange(startRow, 2, numRows, H.RAW_SCORE + 1).getValues();
      // SCHEMA.HH.TAG is 0. So it gets columns B to ...
      
      const rawMain = sheet.getRange(startRow, 2, numRows, H.RAW_SCORE + 1).getValues();
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
      // 🛡️ Upgraded to support optional 3rd column: [Tag, Timestamp, Score]
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
      
      // 🛡️ FIX: Deduplicate read. Use the H.INVITED index within the already-loaded rawMain.
      const rawMain = sheet.getRange(startRow, 2, numRows, H.RAW_SCORE + 1).getValues();

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
      // Sort descending to maintain index integrity during deletion
      const sortedRows = [...new Set(rowsToDelete)].sort((a, b) => b - a);
      sortedRows.forEach((idx) => {
        try {
          sheet.deleteRow(idx);
        } catch (e) {
          console.warn(`⚠️ [STORE] Failed to delete row ${idx}: ${e}`);
        }
      });
      // @ts-ignore
      if (typeof SpreadsheetApp !== 'undefined') SpreadsheetApp.flush();
    }

    return {
      ids: new Set(validEntries.map((e) => e.t)),
      entries: validEntries.map((e) => ({ rawScore: e.s })),
    };
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
