
/**
 * ============================================================================
 * 🎨 MODULE: VIEW (UI & Layout Engine)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Handles all Spreadsheet visualization, formatting, and
 *    interactive elements (checkboxes, banding, headers).
 * ⚙️ ROLE: Pure Presentation Layer. "How it looks".
 * 🏷️ VERSION: 1.0.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";

// Global Version Constant
// @ts-ignore
const VER_VIEW = "1.0.0";

declare var SpreadsheetApp: GoogleAppsScript.Spreadsheet.SpreadsheetApp;
declare var Sheets: any; // Advanced Sheets API
declare var module: any;
declare var Session: GoogleAppsScript.Base.Session;

declare const CONFIG: AppConfig;

export interface IView {
  applyStandardLayout(
    sheet: GoogleAppsScript.Spreadsheet.Sheet,
    contentRows: number,
    contentCols: number,
    optHeaders?: string[] | null,
  ): void;
  drawMobileCheckbox(sheet: GoogleAppsScript.Spreadsheet.Sheet): void;
  refreshMobileControls(ss: GoogleAppsScript.Spreadsheet.Spreadsheet): void;
  enforceGlobalTabHygiene(ss?: GoogleAppsScript.Spreadsheet.Spreadsheet): void;
  backupSheet(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, sheetName: string): void;
  setTabColor(sheet: GoogleAppsScript.Spreadsheet.Sheet, color: string | null): void;
  tagSheet(sheet: GoogleAppsScript.Spreadsheet.Sheet, type: string): void;
  findSheetByType(ss: GoogleAppsScript.Spreadsheet.Spreadsheet, type: string): GoogleAppsScript.Spreadsheet.Sheet | null;
  protectHeaders(sheet: GoogleAppsScript.Spreadsheet.Sheet): void;
}

var View: IView = {
  /**
   * 🖌️ STANDARD LAYOUT ENGINE
   * Applies the signature "Clean Technical" look to any sheet.
   */
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

    // 🛡️ CANVAS PREPARATION & ATOMIC LAYOUT ENGINE
    const ssId = sheet.getParent().getId();
    const sheetId = sheet.getSheetId();
    const requests: any[] = [
      {
        updateBorders: {
          range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: totalCols }
        }
      },
      {
        repeatCell: {
          range: { sheetId: sheetId, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: totalCols },
          cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } },
          fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment)'
        }
      }
    ];

    if (contentCols > 0) {
      // 🏗️ ATOMIC FORMATTING (Borders, Alignment, Merges)
      requests.push(
        // Left Edge (Right side of Column A, skipping Row 1 and Last Row)
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: totalRows - 1, startColumnIndex: 0, endColumnIndex: 1 }, right: { style: "SOLID", color: { red: 0, green: 0, blue: 0 } } } },
        // Right Edge (Left side of Last Column, skipping Row 1 and Last Row)
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: totalRows - 1, startColumnIndex: totalCols - 1, endColumnIndex: totalCols }, left: { style: "SOLID", color: { red: 0, green: 0, blue: 0 } } } },
        // Top Edge (Bottom side of Row 1, skipping Column A and Last Column)
        { updateBorders: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: totalCols - 1 }, bottom: { style: "SOLID", color: { red: 0, green: 0, blue: 0 } } } },
        // Bottom Edge (Top side of Last Row, skipping Column A and Last Column)
        { updateBorders: { range: { sheetId, startRowIndex: totalRows - 1, endRowIndex: totalRows, startColumnIndex: 1, endColumnIndex: totalCols - 1 }, top: { style: "SOLID", color: { red: 0, green: 0, blue: 0 } } } },
        // Header Bottom Line
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 1 + contentCols }, bottom: { style: "SOLID", color: { red: 0, green: 0, blue: 0 } } } },
        // Internal Gridlines (Thin/Gray)
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: 2 + contentRows, startColumnIndex: 1, endColumnIndex: 1 + contentCols }, innerHorizontal: { style: "SOLID", color: { red: 0.8, green: 0.8, blue: 0.8 } }, innerVertical: { style: "SOLID", color: { red: 0.8, green: 0.8, blue: 0.8 } } } },
        // Auto-Size Dimensions
        { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 1 + contentCols } } }
      );
    }

    Sheets.Spreadsheets!.batchUpdate({ requests }, ssId);
    
    // Legacy support for non-API compatible bits (Banding/Merge)
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
      tableRange.getBandings().forEach((b: GoogleAppsScript.Spreadsheet.Banding) => b.remove());
      tableRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);

      const headerRange = sheet.getRange(2, 2, 1, contentCols);
      if (Array.isArray(optHeaders) && optHeaders.length > 0) headerRange.setValues([optHeaders]);
      headerRange.setFontWeight("bold").setHorizontalAlignment("center").setWrap(true);

      if (contentRows > 0) {
        sheet.getRange(L.DATA_START_ROW, 2, contentRows, contentCols).setHorizontalAlignment("center").setWrap(false);
      }
    }
    sheet.setHiddenGridlines(true);
  },

  /**
   * 📱 MOBILE INTERFACE ELEMENTS
   */
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

  /**
   * 🧹 GLOBAL HYGIENE PROTOCOL
   */
  enforceGlobalTabHygiene: function (ss) {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    const VISIBLE_WHITELIST = [
      CONFIG.SHEETS.DB,
      CONFIG.SHEETS.LB,
      CONFIG.SHEETS.HH,
    ];
    
    const SYSTEM_OWNED = [...VISIBLE_WHITELIST];
    VISIBLE_WHITELIST.forEach((baseName) => {
      for (let i = 1; i <= 5; i++)
        SYSTEM_OWNED.push(`Backup ${i} ${baseName}`);
    });

    const allSheets = ss.getSheets();

    // 🚀 BATCH TAB HYGIENE ENGINE (Sheets API)
    const ssId = ss.getId();
    const sheets = ss.getSheets();
    const requests: any[] = [];

    // 1. Calculate Visibility and Index mapping
    sheets.forEach((sheet: GoogleAppsScript.Spreadsheet.Sheet) => {
      const name = sheet.getName();
      const sheetId = sheet.getSheetId();
      
      if (SYSTEM_OWNED.includes(name)) {
        const targetVisible = VISIBLE_WHITELIST.includes(name);
        const targetIndex = SYSTEM_OWNED.indexOf(name); // Desired position

        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: sheetId,
              hidden: !targetVisible,
              index: targetIndex
            },
            fields: 'hidden,index'
          }
        });
      }
    });

    if (requests.length > 0) {
      try {
        Sheets.Spreadsheets!.batchUpdate({ requests }, ssId);
      } catch (e) {
        console.warn(`⚠️ Batch Hygiene Warning: ${e}`);
        // Fallback or ignore for minor index conflicts
      }
    }

    SpreadsheetApp.flush();
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

      // 🛡️ HIGH-PERFORMANCE API CLONE
      const ssId = ss.getId();
      const sheetId = sheet.getSheetId();
      
      const copyResponse = Sheets.Spreadsheets!.Sheets!.copyTo({
        destinationSpreadsheetId: ssId
      }, ssId, sheetId);
      
      const copySheetId = copyResponse.sheetId;
      const copySheet = ss.getSheets().find((s: GoogleAppsScript.Spreadsheet.Sheet) => s.getSheetId() === copySheetId);
      
      if (copySheet) {
        copySheet.setName(backup1Name);
        copySheet.setTabColor("#cccccc");
        this.tagSheet(copySheet, "BACKUP");
        this.enforceGlobalTabHygiene(ss);
        sheet.activate();
      }
    } catch (e: any) {
      console.warn(`⚠️ Backup Failed for '${sheetName}': ${e.message}`);
    }
  },

  setTabColor: function (sheet, color) {
    if (!sheet) return;
    try {
      sheet.setTabColor(color);
    } catch (e) {
      console.warn(`Color Error: ${e}`);
    }
  },

  /**
   * 🏷️ DEVELOPER METADATA ENGINE
   * Tags sheets for resilient identification.
   */
  tagSheet: function (sheet, type) {
    if (!sheet) return;
    const ssId = sheet.getParent().getId();
    const sheetId = sheet.getSheetId();
    
    try {
      Sheets.Spreadsheets!.DeveloperMetadata!.create({
        location: { sheetId: sheetId },
        metadataKey: "cm_type",
        metadataValue: type,
        visibility: "DOCUMENT"
      }, ssId);
    } catch (e) {
      console.warn(`🏷️ Metadata Tagging failed for ${sheet.getName()}: ${e}`);
    }
  },

  findSheetByType: function (ss, type) {
    const ssId = ss.getId();
    try {
      const metadata = Sheets.Spreadsheets!.DeveloperMetadata!.search({
        dataFilters: [{ developerMetadataLookup: { metadataKey: "cm_type", metadataValue: type } }]
      }, ssId);

      if (metadata && metadata.matchedDeveloperMetadata && metadata.matchedDeveloperMetadata.length > 0) {
        const meta = metadata.matchedDeveloperMetadata[0].developerMetadata;
        const sheetId = meta.location.sheetId;
        return ss.getSheets().find(s => s.getSheetId() === sheetId) || null;
      }
    } catch (e) {
      console.warn(`🏷️ Metadata Lookup failed for type ${type}: ${e}`);
    }
    return null;
  },

  /**
   * 🔒 PROTECTED RANGE REGISTRY
   * Locks the header row and system columns.
   */
  protectHeaders: function (sheet) {
    if (!sheet) return;
    const ssId = sheet.getParent().getId();
    const sheetId = sheet.getSheetId();
    
    try {
      Sheets.Spreadsheets!.batchUpdate({
        requests: [
          {
            addProtectedRange: {
              protectedRange: {
                range: {
                  sheetId: sheetId,
                  startRowIndex: 0,
                  endRowIndex: CONFIG.LAYOUT.DATA_START_ROW - 1, // Header block
                  startColumnIndex: 0,
                  endColumnIndex: sheet.getMaxColumns()
                },
                description: "🛡️ SYSTEM HEADERS (Read Only)",
                warningOnly: false,
                editors: { domainUsersCanEdit: false, users: [Session.getEffectiveUser().getEmail()] }
              }
            }
          }
        ]
      }, ssId);
    } catch (e) {
      console.warn(`🔒 Range Protection failed for ${sheet.getName()}: ${e}`);
    }
  }
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = View;
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, { View, VER_VIEW });

export default View;
