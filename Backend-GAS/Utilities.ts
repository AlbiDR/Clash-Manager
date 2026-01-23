
/**
 * ============================================================================
 * 🛠️ MODULE: UTILITIES (TypeScript Edition)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Centralized helper library for the entire project.
 * ⚙️ CAPABILITIES:
 *    1. Smart API Engine: Caching, Deduplication, Key Rotation, Quota Safety.
 *    2. Date & WeekID Calculation (ISO-like Week Logic).
 *    3. Layout Engine (Standardized "Signature" look for all sheets).
 *    4. Data Parsing (War History String -> Map objects).
 *    5. Backup System (Rolling backups for sheet safety).
 *    6. Cache Engine: Handles 100KB+ payloads via chunking (Fixes GAS Limit).
 *    7. Safety Lock: Mutex locking to prevent Race Conditions.
 *    8. Properties Manager: Safe JSON handling for Script Properties.
 * 🏷️ VERSION: 11.0.0
 * ============================================================================
 */

import type { ScoringWeights } from "./SharedTypes";
import type { AppConfig } from "./Configuration";
import type { IStore } from "./Store";

// Global Version Constant
// @ts-ignore
const VER_UTILITIES = "11.0.0";

declare var SpreadsheetApp: any;
declare var LockService: any;
declare const Store: IStore;
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
    export type Banding = any;
  }
  export namespace Content {
    export type TextOutput = any;
  }
}

// Global CONFIG and other GAS services declaration
declare const CONFIG: AppConfig;


/**
 * 🛠️ UTILITIES INTERFACE
 */
export interface AppUtils {
  parseWarHistory(histStr: string | null | undefined): Map<string, number>;
  backupSheet(
    ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
    sheetName: string,
  ): void;
  enforceGlobalTabHygiene(ss?: GoogleAppsScript.Spreadsheet.Spreadsheet): void;
  drawMobileCheckbox(sheet: GoogleAppsScript.Spreadsheet.Sheet): void;
  refreshMobileControls(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void;
  applyStandardLayout(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    contentRows: number,
    contentCols: number,
    optHeaders?: string[] | null,
  ): void;
  resolveSchemaIndices(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    headerMap: Record<string, string>,
    headerRow?: number,
    startCol?: number,
  ): Record<string, number>;
  bootDynamicSchema(): void;
  /**
   * 🛡️ ROBUST PROPERTY RESOLVER
   */
  resolveProperty(obj: any, priorityKeys: string[], fallback?: any): any;
  resolveWarFame(p: any): number;

}

const Utils: AppUtils = {
  parseWarHistory: (histStr) => {
    if (!histStr || histStr === "-" || typeof histStr !== "string")
      return new Map<string, number>();
    const historyMap = new Map<string, number>();
    histStr.split(" | ").forEach((entry) => {
      const parts = entry.trim().split(" ");
      if (parts.length === 2) historyMap.set(parts[1], Number(parts[0]));
    });
    return historyMap;
  },

  /**
   * 🛡️ ROBUST BACKUP SYSTEM
   */
  backupSheet: function (ss, sheetName) {
    try {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return;

      const MAX_BACKUPS = 5;
      const backup1Name = `Backup 1 ${sheetName}`;
      const existingBackup1 = ss.getSheetByName(backup1Name);

      if (existingBackup1) {
        const currentLastRow = sheet.getLastRow();
        const currentLastCol = sheet.getLastColumn();

        if (
          currentLastRow === existingBackup1.getLastRow() &&
          currentLastCol === existingBackup1.getLastColumn()
        ) {
          const startRow = currentLastRow > 1 ? 2 : 1;
          const numRows =
            currentLastRow > 1 ? currentLastRow - startRow + 1 : 1;

          if (currentLastRow > 0) {
            const currentData = sheet
              .getRange(startRow, 1, numRows, currentLastCol)
              .getValues();
            const backupData = existingBackup1
              .getRange(startRow, 1, numRows, currentLastCol)
              .getValues();

            if (JSON.stringify(currentData) === JSON.stringify(backupData)) {
              console.log(`🛡️ Backup skipped for '${sheetName}'`);
              this.enforceGlobalTabHygiene(ss);
              return;
            }
          }
        }
      }

      console.log(`🛡️ Creating backup for '${sheetName}'...`);
      const oldestName = `Backup ${MAX_BACKUPS} ${sheetName}`;
      const oldest = ss.getSheetByName(oldestName);
      if (oldest) ss.deleteSheet(oldest);

      for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
        const currentName = `Backup ${i} ${sheetName}`;
        const nextName = `Backup ${i + 1} ${sheetName}`;
        const existing = ss.getSheetByName(currentName);
        if (existing) existing.setName(nextName);
      }

      const copy = sheet.copyTo(ss);
      copy.setName(backup1Name);
      copy.setTabColor("#cccccc");
      this.enforceGlobalTabHygiene(ss);
      sheet.activate();
    } catch (e: any) {
      console.warn(`⚠️ Backup Failed for '${sheetName}': ${e.message}`);
    }
  },

  /**
   * GLOBAL HYGIENE PROTOCOL
   */
  enforceGlobalTabHygiene: function (ss) {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    const VISIBLE_WHITELIST = [
      CONFIG.SHEETS.DB,
      CONFIG.SHEETS.LB,
      CONFIG.SHEETS.HH,
    ];
    const allSheets = ss.getSheets();

    allSheets.forEach((sheet: GoogleAppsScript.Spreadsheet.Sheet) => {
      const name = sheet.getName();
      if (VISIBLE_WHITELIST.includes(name)) {
        if (sheet.isSheetHidden()) sheet.showSheet();
      } else {
        if (!sheet.isSheetHidden()) sheet.hideSheet();
      }
    });

    const ALL_SORT_ORDER = [...VISIBLE_WHITELIST];
    VISIBLE_WHITELIST.forEach((baseName) => {
      for (let i = 1; i <= 5; i++)
        ALL_SORT_ORDER.push(`Backup ${i} ${baseName}`);
    });

    ALL_SORT_ORDER.forEach((name, index) => {
      const sheet = ss.getSheetByName(name);
      if (sheet) {
        const targetIndex = index + 1;
        if (sheet.getIndex() !== targetIndex) {
          try {
            ss.setActiveSheet(sheet);
            ss.moveActiveSheet(targetIndex);
          } catch (e) {}
        }
      }
    });
    SpreadsheetApp.flush();
  },

  drawMobileCheckbox: function (sheet) {
    if (!sheet) return;
    const mobileTrigger = sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL || "A1");
    if (
      mobileTrigger.getDataValidation() == null ||
      mobileTrigger.getDataValidation()!.getCriteriaType() !=
        SpreadsheetApp.DataValidationCriteria.CHECKBOX
    ) {
      mobileTrigger.insertCheckboxes();
    }
    mobileTrigger
      .setBackground(null)
      .setFontColor(null)
      .setHorizontalAlignment("center")
      .setVerticalAlignment("middle")
      .setNote("⚡ QUICK UPDATE:\n(Select to run)");
  },

  refreshMobileControls: function (ss) {
    const sheets = [CONFIG.SHEETS.DB, CONFIG.SHEETS.LB, CONFIG.SHEETS.HH];
    sheets.forEach((name) => {
      const sheet = ss.getSheetByName(name);
      if (sheet) {
        this.drawMobileCheckbox(sheet);
        sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL || "A1").setValue(false);
      }
    });
  },

  applyStandardLayout: function (
    sheet,
    contentRows,
    contentCols,
    optHeaders = null,
  ) {
    if (!sheet) return;
    const L = CONFIG.LAYOUT;
    if (Array.isArray(optHeaders) && optHeaders.length > 0)
      contentCols = optHeaders.length;

    const lastDataRow = L.DATA_START_ROW - 1 + Math.max(contentRows, 0);
    const totalRows = Math.max(lastDataRow + 1, L.DATA_START_ROW + 1);
    const totalCols = contentCols + 2;

    const currentRows = sheet.getMaxRows();
    const currentCols = sheet.getMaxColumns();

    if (currentRows < totalRows)
      sheet.insertRowsAfter(currentRows, totalRows - currentRows);
    if (currentCols < totalCols)
      sheet.insertColumnsAfter(currentCols, totalCols - currentCols);
    if (currentRows > totalRows)
      sheet.deleteRows(totalRows + 1, currentRows - totalRows);
    if (currentCols > totalCols)
      sheet.deleteColumns(totalCols + 1, currentCols - totalCols);

    sheet.setColumnWidth(1, L.BUFFER_SIZE);
    sheet.setColumnWidth(totalCols, L.BUFFER_SIZE);
    sheet.setRowHeight(totalRows, L.BUFFER_SIZE);

    this.drawMobileCheckbox(sheet);

    if (contentCols > 0) {
      sheet.setColumnWidths(2, contentCols, 100);
      sheet.getRange(1, 1, 1, totalCols).breakApart();
      sheet
        .getRange(1, 2, 1, contentCols)
        .merge()
        .setHorizontalAlignment("left")
        .setFontWeight("bold")
        .setFontColor("#888888");

      const tableRange = sheet.getRange(2, 2, 1 + contentRows, contentCols);
      tableRange
        .getBandings()
        .forEach((b: GoogleAppsScript.Spreadsheet.Banding) => b.remove());
      tableRange.applyRowBanding(
        SpreadsheetApp.BandingTheme.LIGHT_GREY,
        true,
        false,
      );
      tableRange.setBorder(true, true, true, true, null, null);

      const headerRange = sheet.getRange(2, 2, 1, contentCols);
      if (Array.isArray(optHeaders) && optHeaders.length > 0)
        headerRange.setValues([optHeaders]);
      headerRange
        .setBorder(true, true, true, true, true, true)
        .setFontWeight("bold")
        .setHorizontalAlignment("center")
        .setWrap(true);

      if (contentRows > 0) {
        sheet
          .getRange(L.DATA_START_ROW, 2, contentRows, contentCols)
          .setHorizontalAlignment("center")
          .setWrap(false);
      }
    }
    sheet.setHiddenGridlines(true);
  },

  resolveSchemaIndices: function (
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    headerMap: Record<string, string>,
    headerRow = 2,
    startCol = 1,
  ) {
    if (!sheet) return {};
    const sheetName = sheet.getName();
    const headers = sheet.getRange(headerRow, startCol, 1, 40).getValues()[0];
    const resolved: Record<string, number> = {};

    Object.keys(headerMap).forEach((key) => {
      const targetLabel = headerMap[key].toLowerCase().trim();
      const idx = headers.findIndex(
        (h: any) =>
          String(h || "")
            .toLowerCase()
            .trim() === targetLabel,
      );
      if (idx !== -1) {
        resolved[key] = idx;
      } else {
        console.warn(
          `Dynamic Schema: Could not find column '${headerMap[key]}' in ${sheetName}. Verify header exists in Row ${headerRow}.`,
        );
      }
    });
    return resolved;
  },

  bootDynamicSchema: function () {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) return;
    console.info("⚡ Booting Dynamic Schema Sync...");
    const lbSheet = ss.getSheetByName(CONFIG.SHEETS.LB);
    if (lbSheet)
      Object.assign(
        CONFIG.SCHEMA.LB,
        this.resolveSchemaIndices(lbSheet, CONFIG.SCHEMA.LB_HEADERS, CONFIG.LAYOUT.DATA_START_ROW),
      );
    const hhSheet = ss.getSheetByName(CONFIG.SHEETS.HH);
    if (hhSheet)
      Object.assign(
        CONFIG.SCHEMA.HH,
        this.resolveSchemaIndices(hhSheet, CONFIG.SCHEMA.HH_HEADERS, CONFIG.LAYOUT.DATA_START_ROW),
      );
    const dbSheet = ss.getSheetByName(CONFIG.SHEETS.DB);
    if (dbSheet)
      Object.assign(
        CONFIG.SCHEMA.DB,
        this.resolveSchemaIndices(dbSheet, CONFIG.SCHEMA.DB_HEADERS, CONFIG.LAYOUT.DATA_START_ROW, 2),
      );
  },
  /**
   * 🛡️ ROBUST PROPERTY RESOLVER
   * Ingests an object and returns the first matching value from a list of priority keys.
   */
  resolveProperty: function (obj, priorityKeys, fallback = 0) {
    if (!obj || typeof obj !== "object") return fallback;
    for (const key of priorityKeys) {
      if (obj[key] !== undefined && obj[key] !== null) return obj[key];
    }
    return fallback;
  },

  /**
   * ⚔️ UNIFIED WAR FAME RESOLVER
   * Standardized across Service, Logger, Leaderboard, and Recruiter.
   * Logic: Uses truthy check to skip 0/undefined/null and find the first active field.
   */
  resolveWarFame: function (p) {
    if (!p || typeof p !== "object") return 0;
    return (
      Number(
        p.fame || p.medals || p.periodPoints || p.repairPoints || 0
      )
    );
  },
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Utils;
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, { Utils, VER_UTILITIES });

export default Utils;
