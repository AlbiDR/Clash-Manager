// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { CONFIG } from './Configuration';
import Registry from './Registry';
import type { Recruit, BlacklistEntry, BlacklistResult } from './Headhunter_Types';
import * as v from 'valibot';
import { RecruitSchema, BlacklistEntrySchema } from './Validation';

/**
 * ============================================================================
 * [MODULE] HEADHUNTER STORE
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Persistence layer for Recruitment data.
 *    Handles Database I/O, Blacklist reconciliation, and Queue management.
 *
 * @remarks
 * ROLE: Layer 2 Shared Driver (@shared).
 * This module acts as the authoritative bridge between the internal Headhunter
 * logic and the Google Sheets "Dumb Store." It is responsible for translating
 * raw spreadsheet rows into validated recruitment objects and vice versa.
 *
 * @import_constraints
 * - CAN import from: CONFIG, Registry, Validation (Schemas), Headhunter_Types.
 * - FORBIDDEN: Direct calls to external APIs or UI components.
 * ============================================================================
 */

declare var Sheets: any;
declare var SpreadsheetApp: any;

export interface HeadhunterStoreContract {
  /**
   * Loads the current active recruits from the primary Headhunter sheet.
   *
   * @param headhunterSheet - The active Headhunter spreadsheet sheet instance.
   * @returns A Map of normalized player tags to validated Recruit objects.
   */
  loadDatabase(headhunterSheet: GoogleAppsScript.Spreadsheet.Sheet): Map<string, Recruit>;

  /**
   * Reconciles the Blacklist by synchronizing the Event Stream (EVT) and Manual Ticks (HH Sheet).
   * Persists results to the Blacklist (BL) sheet and cleans up the Headhunter sheet.
   *
   * @param headhunterSheet - The active Headhunter spreadsheet sheet instance.
   * @returns An object containing the set of blacklisted tags and their metadata.
   */
  updateAndGetBlacklist(headhunterSheet: GoogleAppsScript.Spreadsheet.Sheet): BlacklistResult;

  /**
   * Loads the recruitment queue reservoir from the internal technical sheet.
   * Filters out expired entries based on CONFIG.HEADHUNTER.QUEUE_EXPIRY_DAYS.
   *
   * @param activeSpreadsheet - The active Spreadsheet instance.
   * @returns A Map of normalized player tags to validated Recruit objects.
   */
  loadQueue(activeSpreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): Map<string, Recruit>;

  /**
   * Persists the recruitment queue reservoir to the internal technical sheet.
   * Implements freshness pruning and maximum size limits.
   *
   * @param activeSpreadsheet - The active Spreadsheet instance.
   * @param recruits - The array of Recruit objects to persist.
   * @returns Statistics on the number of saved and pruned recruits.
   */
  saveQueue(activeSpreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet, recruits: Recruit[]): { count: number; pruned: number };
}

const HeadhunterStore: HeadhunterStoreContract = {
  
  /**
   * @remarks
   * IMPLEMENTATION: Database Loader.
   * Extracts raw data from the Headhunter sheet, normalizes tags, and enforces
   * schema validation via Valibot.
   *
   * // THREAT: Replacing 'any' with specific Google Apps Script types to eliminate pathogens.
   */
  loadDatabase(headhunterSheet: GoogleAppsScript.Spreadsheet.Sheet): Map<string, Recruit> {
    if (!headhunterSheet || headhunterSheet.getLastRow() < CONFIG.LAYOUT.DATA_START_ROW) return new Map();
    const headhunterSchema = CONFIG.SCHEMA.HH;
    const rows = headhunterSheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        2,
        headhunterSheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1),
        20,
      )
      .getValues();

    const parseNumeric = (cellValue: unknown): number => {
      if (cellValue === "" || cellValue === null || cellValue === undefined) return 0;
      const clean = String(cellValue).replace(/[^0-9.-]/g, "");
      const num = parseFloat(clean);
      return isNaN(num) ? 0 : num;
    };

    const parseDateMs = (cellValue: unknown): number => {
      if (!cellValue) return 0;
      const t = new Date(cellValue as string | number | Date).getTime();
      return isNaN(t) ? 0 : t;
    };

    const recruitMap = new Map<string, Recruit>();
    rows.forEach((rawRecruitRow: unknown[], rowIndex: number) => {
      const rawTag = String(rawRecruitRow[headhunterSchema.TAG] || "");
      const tag = Registry.Services.Core.normalizeTag(rawTag);
      if (tag) {
        const payload = {
          tag,
          invited: rawRecruitRow[headhunterSchema.INVITED] === true || String(rawRecruitRow[headhunterSchema.INVITED]).toUpperCase() === "TRUE",
          name: String(rawRecruitRow[headhunterSchema.NAME] || ""),
          trophies: parseNumeric(rawRecruitRow[headhunterSchema.TROPHIES]),
          donations: parseNumeric(rawRecruitRow[headhunterSchema.DONATIONS]),
          cards: parseNumeric(rawRecruitRow[headhunterSchema.CARDS]),
          war: parseNumeric(rawRecruitRow[headhunterSchema.WAR_WINS]),
          foundDate: Registry.Services.Time.parseFlexibleDate(rawRecruitRow[headhunterSchema.FOUND_DATE]),
          rawScore: parseNumeric(rawRecruitRow[headhunterSchema.RAW_SCORE]),
          potentialScore: parseNumeric(rawRecruitRow[headhunterSchema.POTENTIAL_SCORE]),
          lastScan: parseDateMs(rawRecruitRow[headhunterSchema.LAST_SCAN]),
        };

        const result = v.safeParse(RecruitSchema, payload);
        if (result.success) {
          recruitMap.set(tag, result.output as Recruit);
        } else {
          const errors = result.issues.map(issue => `${issue.path?.[0]?.key}: ${issue.message}`).join(", ");
          console.warn(`HeadhunterStore: Validation failed for row ${CONFIG.LAYOUT.DATA_START_ROW + rowIndex} (${tag}). Errors: ${errors}`);
        }
      }
    });

    if (recruitMap.size === 0 && rows.length > 0) {
      console.error(`CRITICAL: HeadhunterStore loaded 0 recruits from ${rows.length} rows. Possible schema or validation failure.`);
    }

    return recruitMap;
  },

  /**
   * @remarks
   * IMPLEMENTATION: Blacklist Reconciliation.
   * Orchestrates a multi-phase reconciliation process:
   * 1. Loads current blacklist from the BL sheet.
   * 2. Consumes 'Hot Dismissals' from the Event Stream (EVT).
   * 3. Audits 'Manual Ticks' (Invited column) on the primary HH sheet.
   * 4. Persists the consolidated results and triggers atomic row deletions.
   *
   * // THREAT: OCD Clean Stack: Replacing anemic variables with domain-descriptive names.
   */
  updateAndGetBlacklist(headhunterSheet: GoogleAppsScript.Spreadsheet.Sheet): BlacklistResult {
    if (!headhunterSheet) return { ids: new Set(), entries: [] };
    const activeSpreadsheet = headhunterSheet.getParent();
    // Ensure Technical Sheets exist with proper headers
    const blacklistSheet = activeSpreadsheet.getSheetByName(CONFIG.SHEETS.BL) || activeSpreadsheet.insertSheet(CONFIG.SHEETS.BL);
    if (blacklistSheet.getLastRow() === 0) {
      blacklistSheet.getRange(1, 1, 1, 3).setValues([["Tag", "Expiry", "Raw Score"]]);
    }
    // Robust header verification (Ensures headers persist even if cleared)
    if (blacklistSheet.getRange(1,1).getValue() !== "Tag") {
       blacklistSheet.getRange(1, 1, 1, 3).setValues([["Tag", "Expiry", "Raw Score"]]);
    }

    const eventSheet = activeSpreadsheet.getSheetByName(CONFIG.SHEETS.EVT) || activeSpreadsheet.insertSheet(CONFIG.SHEETS.EVT);
    if (eventSheet.getLastRow() === 0) {
      eventSheet.getRange(1, 1, 1, 3).setValues([["Tag", "Timestamp", CONFIG.SCHEMA.HH_HEADERS.RAW_SCORE]]);
    }
    if (eventSheet.getRange(1, 1).getValue() !== "Tag" || eventSheet.getLastColumn() < 3) {
       eventSheet.getRange(1, 1, 1, 3).setValues([["Tag", "Timestamp", CONFIG.SCHEMA.HH_HEADERS.RAW_SCORE]]);
    }

    const now = Date.now();
    const expiryDuration = (CONFIG.HEADHUNTER.BLACKLIST_DAYS || 30) * 86400000;
    const entryMap = new Map<string, BlacklistEntry>();

    // A. Load existing Blacklist (Skip Header row 1)
    if (blacklistSheet.getLastRow() > 1) {
      const rawBlacklistData = blacklistSheet.getRange(2, 1, blacklistSheet.getLastRow() - 1, 3).getValues();
      rawBlacklistData.forEach((rawBlacklistRow: unknown[]) => {
        const rawPayload = {
          tag: String(rawBlacklistRow[0] || ""),
          expiry: Number(rawBlacklistRow[1]) || 0,
          rawScore: Number(rawBlacklistRow[2]) || 0
        };

        const result = v.safeParse(BlacklistEntrySchema, rawPayload);
        if (!result.success) return;

        const { tag, expiry, rawScore } = result.output;

        if (expiry > now) {
          if (entryMap.has(tag)) {
            const existing = entryMap.get(tag)!;
            existing.expiry = Math.max(existing.expiry, expiry);
            existing.rawScore = Math.max(existing.rawScore, rawScore);
          } else {
            entryMap.set(tag, { tag: tag, expiry: expiry, rawScore: rawScore });
          }
        }
      });
    }

    // B. Pre-load Recruit Metadata from Main Sheet for matching
    const headhunterSchema = CONFIG.SCHEMA.HH;
    const mainDataMap = new Map<string, { row: number; score: number }>();
    if (headhunterSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
      const startRow = CONFIG.LAYOUT.DATA_START_ROW;
      const numRows = headhunterSheet.getLastRow() - startRow + 1;
      
      const rawHeadhunterData = headhunterSheet.getRange(startRow, 2, numRows, headhunterSchema.LAST_SCAN + 1).getValues();
      rawHeadhunterData.forEach((rawHeadhunterRow: unknown[], rowIndex: number) => {
        const tag = Registry.Services.Core.normalizeTag(String(rawHeadhunterRow[headhunterSchema.TAG] || ""));
        if (tag) {
          mainDataMap.set(tag, { 
            row: startRow + rowIndex,
            score: Number(rawHeadhunterRow[headhunterSchema.RAW_SCORE]) || 0
          });
        }
      });
    }

    // // DECISION LOG: Phase 1 - Event Stream Reconciliation (Hot Dismissals).
    // The Event Stream (EVT) acts as a low-latency buffer for dismissals triggered
    // by the PWA or Worker. This phase drains the EVT and marks recruits as invited.
    if (eventSheet.getLastRow() > 1) {
      const rawEventData = eventSheet.getDataRange().getValues() as unknown[][];
      for (let rowIndex = 1; rowIndex < rawEventData.length; rowIndex++) {
         const tag = Registry.Services.Core.normalizeTag(String(rawEventData[rowIndex][0] || ""));
         if (!tag) continue;

         const recruitMetadata = mainDataMap.get(tag);
         const eventScore = Number(rawEventData[rowIndex][2]) || 0;

         if (!entryMap.has(tag)) {
           entryMap.set(tag, { tag: tag, expiry: now + expiryDuration, rawScore: Math.max(eventScore, recruitMetadata ? recruitMetadata.score : 0) });
         } else {
           const existing = entryMap.get(tag)!;
           existing.rawScore = Math.max(existing.rawScore, eventScore, recruitMetadata ? recruitMetadata.score : 0);
         }

         if (recruitMetadata) {
           headhunterSheet.getRange(recruitMetadata.row, 2 + headhunterSchema.INVITED).setValue(true);
         }
      }
      const lastRow = eventSheet.getLastRow();
      if (lastRow > 1) {
        eventSheet.getRange(2, 1, lastRow - 1, eventSheet.getLastColumn()).clearContent();
      }
    }

    // // DECISION LOG: Phase 2 - Manual Tick Audit.
    // Detects recruits manually marked as 'Invited' in the spreadsheet UI.
    // These recruits are moved to the Blacklist and their rows are queued for deletion.
    const rowIndicesToDelete: number[] = [];
    if (headhunterSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
      const startRow = CONFIG.LAYOUT.DATA_START_ROW;
      const numRows = headhunterSheet.getLastRow() - startRow + 1;
      const rawHeadhunterData = headhunterSheet.getRange(startRow, 2, numRows, headhunterSchema.LAST_SCAN + 1).getValues();

      rawHeadhunterData.forEach((rawHeadhunterRow: unknown[], rowIndex: number) => {
        const tag = Registry.Services.Core.normalizeTag(String(rawHeadhunterRow[headhunterSchema.TAG] || ""));
        if (!tag) return;

        const isInvited = rawHeadhunterRow[headhunterSchema.INVITED] === true || String(rawHeadhunterRow[headhunterSchema.INVITED]).toUpperCase() === "TRUE";
        const score = Number(rawHeadhunterRow[headhunterSchema.RAW_SCORE]) || 0;
        const targetRowNumber = startRow + rowIndex;

        if (isInvited) {
          if (entryMap.has(tag)) {
            const existingEntry = entryMap.get(tag)!;
            existingEntry.expiry = now + expiryDuration;
            existingEntry.rawScore = Math.max(existingEntry.rawScore, score);
          } else {
            entryMap.set(tag, { tag: tag, expiry: now + expiryDuration, rawScore: score });
          }
          rowIndicesToDelete.push(targetRowNumber);
        }
      });
    }

    // --- 3. PERSIST BLACKLIST ---
    const consolidatedBlacklistEntries = Array.from(entryMap.values());
    consolidatedBlacklistEntries.sort((a, b) => b.rawScore - a.rawScore);

    if (blacklistSheet.getLastRow() > 1) {
      blacklistSheet.getRange(2, 1, blacklistSheet.getLastRow() - 1, 3).clearContent();
    }
    if (consolidatedBlacklistEntries.length > 0) {
      const blacklistOutputValues = consolidatedBlacklistEntries.map((blacklistEntry) => [blacklistEntry.tag, blacklistEntry.expiry, blacklistEntry.rawScore]);
      blacklistSheet.getRange(2, 1, blacklistOutputValues.length, 3).setValues(blacklistOutputValues);
    }

    if (rowIndicesToDelete.length > 0) {
      // // DECISION LOG: Atomic Batch Deletion Strategy.
      // To maintain UI responsiveness and prevent index shifting during deletion,
      // we sort indices in descending order and execute a single batchUpdate
      // via the Advanced Sheets Service.
      const sortedRowIndices = [...new Set(rowIndicesToDelete)].sort((a, b) => b - a);
      const sheetId = headhunterSheet.getSheetId();
      const activeSpreadsheetId = activeSpreadsheet.getId();

      const deleteRequests = sortedRowIndices.map(rowIdx => ({
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
          Sheets.Spreadsheets.batchUpdate({ requests: deleteRequests }, activeSpreadsheetId);
        }
        console.info(`Cleanup: Atomic deletion of ${deleteRequests.length} row(s) complete.`);
        // @ts-ignore
        if (typeof SpreadsheetApp !== 'undefined') SpreadsheetApp.flush();
      }
    }

    return {
      ids: new Set(consolidatedBlacklistEntries.map((blacklistEntry) => blacklistEntry.tag)),
      entries: consolidatedBlacklistEntries.map((blacklistEntry) => ({ rawScore: blacklistEntry.rawScore })),
    };
  },

  /**
   * @remarks
   * IMPLEMENTATION: Queue Loader.
   * Ingests the technical Queue sheet and filters for freshness. Entries older than
   * the configured expiry threshold are discarded at the point of ingestion.
   */
  loadQueue(activeSpreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): Map<string, Recruit> {
    const queueSheet = activeSpreadsheet.getSheetByName(CONFIG.SHEETS.QUEUE);
    if (!queueSheet || queueSheet.getLastRow() < 2) return new Map();

    const range = queueSheet.getRange(2, 1, queueSheet.getLastRow() - 1, queueSheet.getLastColumn());
    const rawQueueData = range.getValues();
    
    const map = new Map<string, Recruit>();
    const now = Date.now();
    const expiryMs = (CONFIG.HEADHUNTER.QUEUE_EXPIRY_DAYS || 7) * 86400000;
    
    const INDEX_TAG = 0;
    const INDEX_LAST_SCAN = 9;

    const parseDateMs = (cellValue: unknown): number => {
      if (!cellValue) return 0;
      const t = new Date(cellValue as string | number | Date).getTime();
      return isNaN(t) ? 0 : t;
    };

    rawQueueData.forEach((rawQueueRow: unknown[], rowIndex: number) => {
      const tag = Registry.Services.Core.normalizeTag(String(rawQueueRow[INDEX_TAG] || ""));
      const foundDate = Registry.Services.Time.parseFlexibleDate(rawQueueRow[7]);
      
      if (now - foundDate.getTime() > expiryMs) return;

      if (tag) {
        const payload = {
          tag,
          name: String(rawQueueRow[1]),
          trophies: Number(rawQueueRow[2]),
          donations: Number(rawQueueRow[3]),
          cards: Number(rawQueueRow[4]),
          war: Number(rawQueueRow[5]),
          rawScore: Number(rawQueueRow[6]),
          foundDate: foundDate,
          invited: false,
          source: rawQueueRow[8] || "TOURNAMENT",
          lastScan: parseDateMs(rawQueueRow[INDEX_LAST_SCAN])
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

  /**
   * @remarks
   * IMPLEMENTATION: Queue Persister.
   * Uses the Google Sheets Advanced Service (Spreadsheets.Values.update) for
   * high-performance batch writing when available.
   */
  saveQueue(activeSpreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet, recruits: Recruit[]): { count: number; pruned: number } {
    const sheetName = CONFIG.SHEETS.QUEUE;
    const queueSheet = activeSpreadsheet.getSheetByName(sheetName) || activeSpreadsheet.insertSheet(sheetName);
    const HOT_COLOR = "#795548";

    if (queueSheet.getLastRow() === 0) {
      queueSheet.getRange(1, 1, 1, 10).setValues([["Tag", "Name", "Trophies", "Donations", "Cards", "War", "Raw Score", "Found Date", "Source", "Last Scan"]]);
      queueSheet.setTabColor(HOT_COLOR);
      Registry.Services.View.tagSheet(queueSheet, "TECHNICAL");
      queueSheet.hideSheet();
    }

    const maxQueue = CONFIG.HEADHUNTER.MAX_QUEUE_SIZE || 500;
    const toSave = recruits.slice(0, maxQueue);
    const activeSpreadsheetId = activeSpreadsheet.getId();

    if (queueSheet.getMaxColumns() < 10) {
       queueSheet.insertColumnsAfter(queueSheet.getMaxColumns(), 10 - queueSheet.getMaxColumns());
    }
    queueSheet.getRange(1, 1, 1, 10).setValues([["Tag", "Name", "Trophies", "Donations", "Cards", "War", "Raw Score", "Found Date", "Source", "Last Scan"]]);

    const values = new Array(maxQueue).fill(0).map(() => new Array(10).fill(""));
    
    toSave.forEach((recruitObject, rowIndex) => {
      values[rowIndex] = [
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
      // // DECISION LOG: High-Performance Batch Write.
      // Bypasses the slow row-by-row SpreadsheetApp API in favor of the
      // REST-based Advanced Sheets Service for large queue updates.
      const range = `'${sheetName}'!A2:J${maxQueue + 1}`;
      Sheets.Spreadsheets.Values!.update(
        { values: values },
        activeSpreadsheetId,
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



(function(scope: any) {
  Object.assign(scope, { HeadhunterStore });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default HeadhunterStore;
