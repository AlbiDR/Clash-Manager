
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
  setStatusMessage(sheet: GoogleAppsScript.Spreadsheet.Sheet, message: string): void;
  getStandardVisualRequests(sheetId: number, contentRows: number, contentCols: number): any[];
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
    
    // 🧹 PRE-CLEANUP: Remove existing bandings locally to prevent conflicts
    // This is safe to do before the batch update
    try {
      sheet.getBandings().forEach((b: any) => b.remove());
    } catch (e) {
      console.warn(`View: Could not remove existing bandings: ${e}`);
    }

    const L = CONFIG.LAYOUT;
    const ssId = sheet.getParent().getId();
    const sheetId = sheet.getSheetId();

    // 🛡️ FETCH CURRENT STATE (Advanced API)
    const ssMeta = Sheets.Spreadsheets!.get(ssId, { ranges: [sheet.getName()], includeGridData: false });
    const sMeta = ssMeta.sheets[0];
    const currentRows = sMeta.properties.gridProperties.rowCount;
    const currentCols = sMeta.properties.gridProperties.columnCount;

    // 🛡️ DIMENSION CALCULATION (Status + Header + Data + Buffer)
    const STATUS_ROWS = 1;
    const HEADER_ROWS = L.DATA_START_ROW - 1; // Usually 1
    
    // Use current data row count if -1 passed
    if (contentRows === -1) {
        contentRows = Math.max(0, currentRows - (L.DATA_START_ROW - 1) - 1); // Subtract 1 for Buffer
    }

    const totalRows = L.DATA_START_ROW + contentRows + 1; // +1 for the Buffer row at the end
    const totalCols = contentCols + 2; // Buffer + Data + Buffer

    // 🛡️ ATOMIC LAYOUT ENGINE (Total Consolidation)
    const requests: any[] = [
      // 1. DIMENSION SYNC (Grid Size)
      {
        updateSheetProperties: {
          properties: {
            sheetId: sheetId,
            gridProperties: { rowCount: totalRows, columnCount: totalCols }
          },
          fields: 'gridProperties.rowCount,gridProperties.columnCount'
        }
      },
      // 2. BUFFER COLUMN WIDTHS (A and End)
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
          properties: { pixelSize: L.BUFFER_SIZE },
          fields: "pixelSize"
        }
      },
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: totalCols - 1, endIndex: totalCols },
          properties: { pixelSize: L.BUFFER_SIZE },
          fields: "pixelSize"
        }
      },
      // 3. BUFFER ROW HEIGHT (End)
      {
        updateDimensionProperties: {
          range: { sheetId, dimension: "ROWS", startIndex: totalRows - 1, endIndex: totalRows },
          properties: { pixelSize: L.BUFFER_SIZE },
          fields: "pixelSize"
        }
      },
      // 4. FULL CANVAS RESET (Borders, Background, Alignment)
      {
        updateBorders: {
          range: { sheetId, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: totalCols },
          top: { style: "NONE" }, bottom: { style: "NONE" }, left: { style: "NONE" }, right: { style: "NONE" },
          innerHorizontal: { style: "NONE" }, innerVertical: { style: "NONE" }
        }
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: totalCols },
          cell: { userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } },
          fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment)'
        }
      }
    ];

    if (contentCols > 0) {
      // 5. DATA COLUMN WIDTHS (Default 100)
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 1 + contentCols },
          properties: { pixelSize: 100 },
          fields: "pixelSize"
        }
      });
      
      // 5. DATA COLUMN WIDTHS (Default 100)
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 1 + contentCols },
          properties: { pixelSize: 100 },
          fields: "pixelSize"
        }
      });

      // 6. DATA ROW HEIGHTS (Default 25px for "Clean" look)
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: "ROWS", startIndex: L.DATA_START_ROW - 1, endIndex: totalRows - 1 },
          properties: { pixelSize: 25 },
          fields: "pixelSize"
        }
      });
      
      // 7. BUFFER PLACEHOLDERS (Column A and End Column) Delivery
      // Left Buffer (A2)
      requests.push({
        updateCells: {
          rows: [{
            values: [{
              userEnteredValue: { stringValue: "." },
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 1, blue: 1 },
                textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } },
                horizontalAlignment: "CENTER",
                verticalAlignment: "MIDDLE"
              }
            }]
          }],
          fields: 'userEnteredValue,userEnteredFormat(backgroundColor,textFormat.foregroundColor,horizontalAlignment,verticalAlignment)',
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 }
        }
      });

      // Right Buffer (Last Column, Row 2)
      requests.push({
        updateCells: {
          rows: [{
            values: [{
              userEnteredValue: { stringValue: "." },
              userEnteredFormat: {
                backgroundColor: { red: 1, green: 1, blue: 1 },
                textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } },
                horizontalAlignment: "CENTER",
                verticalAlignment: "MIDDLE"
              }
            }]
          }],
          fields: 'userEnteredValue,userEnteredFormat(backgroundColor,textFormat.foregroundColor,horizontalAlignment,verticalAlignment)',
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: totalCols - 1, endColumnIndex: totalCols }
        }
      });
    }

    // 🚀 EXECUTE ATOMIC TRANSACTION (No SpreadsheetApp triggers)
    Sheets.Spreadsheets!.batchUpdate({ requests }, ssId);

    // Minor non-structural tweaks (These rarely cause out of bounds)
    this.drawMobileCheckbox(sheet);
    sheet.setHiddenGridlines(true);
  },

  /**
   * 🏗️ ATOMIC VISUAL ENGINE (Request Generator)
   * Generates the visual standard for 100% atomic bundling.
   */
  getStandardVisualRequests: function (sheetId, contentRows, contentCols) {
    const L = CONFIG.LAYOUT;
    // Robust calculation: Data Start + Actual Data Rows + 1 Buffer Row
    // Robust calculation: Data Start + Actual Data Rows + 1 Buffer Row
    const totalRows = L.DATA_START_ROW + Math.max(0, contentRows); // contentRows includes the last data row. Buffer row added via gridProperties if needed, but here we define the visual range.
    // Actually, totalRows for visual requests (borders etc) usually extends to the end of the grid.
    // Let's rely on the passed contentRows to define the "Table" area.
    
    // Strict Grid Calculation
    // Header (DATA_START_ROW - 1) + Content (contentRows) + Buffer (1)
    const strictTotalRows = (L.DATA_START_ROW - 1) + contentRows + 1; 
    const totalCols = contentCols + 2;

    return [
        // 0. STRICT GRID RESIZE (Trim the sheet)
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheetId,
              gridProperties: { rowCount: strictTotalRows, columnCount: totalCols }
            },
            fields: 'gridProperties.rowCount,gridProperties.columnCount'
          }
        },
        // 0.5 DATA ROW HEIGHTS (Ensure 25px)
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "ROWS", startIndex: L.DATA_START_ROW - 1, endIndex: strictTotalRows - 1 },
            properties: { pixelSize: 25 },
            fields: "pixelSize"
          }
        },
        // 0.6 BUFFER ROW HEIGHT (Last Row 25px)
        {
            updateDimensionProperties: {
                range: { sheetId, dimension: "ROWS", startIndex: strictTotalRows - 1, endIndex: strictTotalRows },
                properties: { pixelSize: L.BUFFER_SIZE },
                fields: "pixelSize"
            }
        },
        // 0.7 BUFFER COLUMN WIDTHS
        {
            updateDimensionProperties: {
                range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
                properties: { pixelSize: L.BUFFER_SIZE },
                fields: "pixelSize"
            }
        },
        {
            updateDimensionProperties: {
                range: { sheetId, dimension: "COLUMNS", startIndex: totalCols - 1, endIndex: totalCols },
                properties: { pixelSize: L.BUFFER_SIZE },
                fields: "pixelSize"
            }
        },
        // 1. Header background (#f3f3f3)
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 1 + contentCols },
            cell: { userEnteredFormat: { backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 }, textFormat: { bold: true } } },
            fields: 'userEnteredFormat(backgroundColor,textFormat.bold)'
          }
        },
        // 2. Table Horizontal Alignment
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 1, endRowIndex: L.DATA_START_ROW - 1 + contentRows, startColumnIndex: 1, endColumnIndex: 1 + contentCols },
                cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
                fields: "userEnteredFormat.horizontalAlignment"
            }
        },
        // 3. Status Bar Styling (Row 1)
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 1 + contentCols },
            cell: { userEnteredFormat: { horizontalAlignment: "LEFT", textFormat: { bold: true, foregroundColor: { red: 0.53, green: 0.53, blue: 0.53 } } } },
            fields: "userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat"
          }
        },
        // 4. Borders
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: strictTotalRows - 1, startColumnIndex: 0, endColumnIndex: 1 }, right: { style: "SOLID", color: { red: 0, green: 0, blue: 0 } } } },
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: strictTotalRows - 1, startColumnIndex: totalCols - 1, endColumnIndex: totalCols }, left: { style: "SOLID", color: { red: 0, green: 0, blue: 0 } } } },
        { updateBorders: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: totalCols - 1 }, bottom: { style: "SOLID", color: { red: 0, green: 0, blue: 0 } } } },
        { updateBorders: { range: { sheetId, startRowIndex: strictTotalRows - 1, endRowIndex: strictTotalRows, startColumnIndex: 1, endColumnIndex: totalCols - 1 }, top: { style: "SOLID", color: { red: 0, green: 0, blue: 0 } } } },
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 1 + contentCols }, bottom: { style: "SOLID", color: { red: 0, green: 0, blue: 0 } } } },
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: L.DATA_START_ROW - 1 + contentRows, startColumnIndex: 1, endColumnIndex: 1 + contentCols }, innerHorizontal: { style: "SOLID", color: { red: 0.8, green: 0.8, blue: 0.8 } }, innerVertical: { style: "SOLID", color: { red: 0.8, green: 0.8, blue: 0.8 } } } },
        
        // 5. ALTERNATING ROW COLORS (Banding)
        {
          addBanding: {
            banding: {
              range: {
                sheetId: sheetId,
                startRowIndex: L.DATA_START_ROW - 1,
                endRowIndex: strictTotalRows - 1, // Exclude buffer row
                startColumnIndex: 1,
                endColumnIndex: 1 + contentCols
              },
              rowProperties: {
                firstBandColor: { red: 1, green: 1, blue: 1 }, // White
                secondBandColor: { red: 0.96, green: 0.96, blue: 0.96 } // Very Light Gray
              }
            }
          }
        },
        
        // 6. Auto-Size Dimensions (Columns Only - Rows are fixed 25px)
        { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 1 + contentCols } } },
        // 6. Buffer Columns A & End Color Match
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } } } },
            fields: "userEnteredFormat.textFormat.foregroundColor"
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: totalCols - 1, endColumnIndex: totalCols },
            cell: { userEnteredFormat: { textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } } } },
            fields: "userEnteredFormat.textFormat.foregroundColor"
          }
        }
    ];
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
    const lock = LockService.getDocumentLock();
    try {
      if (!lock!.tryLock(20000)) return; // Wait 20s for previous task to finish
      
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        lock!.releaseLock();
        return;
      }

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
    } finally {
      try { lock!.releaseLock(); } catch(e) {}
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
      Sheets.Spreadsheets!.batchUpdate({
        requests: [{
          createDeveloperMetadata: {
            developerMetadata: {
              location: { sheetId: sheetId },
              metadataKey: "cm_type",
              metadataValue: type,
              visibility: "DOCUMENT"
            }
          }
        }]
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
  },

  setStatusMessage: function (sheet, message) {
    if (!sheet) return;
    try {
      sheet.getRange("B1").setValue(message);
      // Ensure the theme is established (Left-aligned, Gray, Bold)
      const ssId = sheet.getParent().getId();
      const sheetId = sheet.getSheetId();
      Sheets.Spreadsheets!.batchUpdate({
        requests: [{
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 30 },
            cell: { userEnteredFormat: { horizontalAlignment: "LEFT", textFormat: { bold: true, foregroundColor: { red: 0.53, green: 0.53, blue: 0.53 } } } },
            fields: "userEnteredFormat.horizontalAlignment,userEnteredFormat.textFormat"
          }
        }]
      }, ssId);
    } catch (e) {
      console.warn(`Status Error: ${e}`);
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
