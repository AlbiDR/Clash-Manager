
/**
 * ============================================================================
 * 🎨 MODULE: VIEW (UI & Layout Engine)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Handles all Spreadsheet visualization, formatting, and
 *    interactive elements (checkboxes, banding, headers).
 * ⚙️ ROLE: Pure Presentation Layer. "How it looks".
 * 🏷️ VERSION: 1.0.1
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";

// Global Version Constant
// @ts-ignore
const VER_VIEW = "1.0.1";

declare var SpreadsheetApp: any;
declare var Sheets: any; // Advanced Sheets API
declare var module: any;
declare var Session: any;
declare var LockService: any;

declare const CONFIG: AppConfig;

export interface IView {
  applyStandardLayout(
    sheet: any,
    contentRows: number,
    contentCols: number,
    optHeaders?: string[] | null,
  ): void;
  drawMobileCheckbox(sheet: any): void;
  refreshMobileControls(ss: any): void;
  enforceGlobalTabHygiene(ss?: any): void;
  backupSheet(ss: any, sheetName: string): void;
  setTabColor(sheet: any, color: string | null): void;
  tagSheet(sheet: any, type: string): void;
  findSheetByType(ss: any, type: string): any | null;
  protectHeaders(sheet: any): void;
  setStatusMessage(sheet: any, message: string): void;
  getStandardVisualRequests(sheetId: number, contentRows: number, contentCols: number): any[];
  hexToRgbColor(hex: string): { red: number; green: number; blue: number };
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
    
    // 🧹 PRE-CLEANUP: Remove existing bandings
    try {
      sheet.getBandings().forEach((b: any) => b.remove());
    } catch (e: any) {
      console.warn(`View: Could not remove existing bandings: ${e}`);
    }

    const ssId = sheet.getParent().getId();
    const sheetId = sheet.getSheetId();

    // 🛡️ ATOMIC LAYOUT ENGINE
    const requests = this.getStandardVisualRequests(sheetId, contentRows, contentCols);
    
    // 🚀 EXECUTE ATOMIC TRANSACTION
    Sheets.Spreadsheets!.batchUpdate({ requests }, ssId);

    // Minor non-structural tweaks
    this.drawMobileCheckbox(sheet);
    sheet.setHiddenGridlines(true);
  },

  /**
   * 🏗️ ATOMIC VISUAL ENGINE (Request Generator)
   * Generates the visual standard for 100% atomic bundling.
   */
  getStandardVisualRequests: function (sheetId, contentRows, contentCols) {
    const L = CONFIG.LAYOUT;
    const T = CONFIG.THEME;
    
    // Dimensions
    const totalRows = (L.DATA_START_ROW - 1) + (contentRows === -1 ? 100 : contentRows) + 1; 
    const totalCols = contentCols + 2;

    const bgRgb = this.hexToRgbColor(T.TABLE.ROW_ALT_BG);
    const headerRgb = this.hexToRgbColor(T.TABLE.HEADER_BG);
    const statusBgRgb = this.hexToRgbColor(T.STATUS_BAR.BG);
    const statusFgRgb = this.hexToRgbColor(T.STATUS_BAR.FG);
    const borderDarkRgb = this.hexToRgbColor(T.TABLE.BORDER_DARK);
    const borderLightRgb = this.hexToRgbColor(T.TABLE.BORDER_LIGHT);

    return [
        // 0. RESET & OVERWRITE (Essential for idempotency)
        { 
          updateBorders: { 
            range: { sheetId, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: totalCols },
            top: { style: "NONE" }, bottom: { style: "NONE" }, left: { style: "NONE" }, right: { style: "NONE" },
            innerHorizontal: { style: "NONE" }, innerVertical: { style: "NONE" }
          }
        },
        // 0.1 REMOVE BANDING (Sheets API requires explicit removal or specific ID, but easier via Grid Reset)
        // Note: Apps Script flush handles this via getBandings().forEach(remove) in applyStandardLayout

        // 0.2 GRID RESIZE
        {
          updateSheetProperties: {
            properties: {
              sheetId: sheetId,
              gridProperties: { rowCount: totalRows, columnCount: totalCols }
            },
            fields: 'gridProperties.rowCount,gridProperties.columnCount'
          }
        },
        // 0.5 DATA ROW HEIGHTS (25px)
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "ROWS", startIndex: 0, endIndex: 1 }, // Row 1 (Status)
            properties: { pixelSize: 25 },
            fields: "pixelSize"
          }
        },
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "ROWS", startIndex: L.DATA_START_ROW - 1, endIndex: totalRows - 1 }, // Row 3+ (Data)
            properties: { pixelSize: 25 },
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
        // 1. Header background
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 1 + contentCols },
            cell: { userEnteredFormat: { backgroundColor: headerRgb, textFormat: { bold: true } } },
            fields: 'userEnteredFormat(backgroundColor,textFormat.bold)'
          }
        },
        // 2. Table Alignment
        {
            repeatCell: {
                range: { sheetId, startRowIndex: 1, endRowIndex: totalRows - 1, startColumnIndex: 1, endColumnIndex: 1 + contentCols },
                cell: { userEnteredFormat: { horizontalAlignment: "CENTER", verticalAlignment: "MIDDLE" } },
                fields: "userEnteredFormat(horizontalAlignment,verticalAlignment)"
            }
        },
        // 3. Status Bar Styling (Row 1)
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: totalCols },
            cell: { 
              userEnteredFormat: { 
                backgroundColor: statusBgRgb,
                horizontalAlignment: "LEFT", 
                verticalAlignment: "MIDDLE",
                wrapStrategy: "WRAP",
                textFormat: { bold: true, foregroundColor: statusFgRgb } 
              } 
            },
            fields: "userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)"
          }
        },
        // 3.5 Merge Status Bar (Center content)
        {
          mergeCells: {
            range: {
              sheetId: sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
              startColumnIndex: 1,
              endColumnIndex: totalCols - 1
            },
            mergeType: "MERGE_ALL"
          }
        },
        // 4. Borders
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: totalRows - 1, startColumnIndex: 0, endColumnIndex: 1 }, right: { style: "SOLID", color: borderDarkRgb } } },
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: totalRows - 1, startColumnIndex: totalCols - 1, endColumnIndex: totalCols }, left: { style: "SOLID", color: borderDarkRgb } } },
        { updateBorders: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: totalCols }, bottom: { style: "SOLID", color: borderDarkRgb } } },
        { updateBorders: { range: { sheetId, startRowIndex: totalRows - 1, endRowIndex: totalRows, startColumnIndex: 1, endColumnIndex: totalCols - 1 }, top: { style: "SOLID", color: borderDarkRgb } } },
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 1 + contentCols }, bottom: { style: "SOLID", color: borderDarkRgb } } },
        { updateBorders: { range: { sheetId, startRowIndex: L.DATA_START_ROW - 1, endRowIndex: totalRows - 1, startColumnIndex: 1, endColumnIndex: 1 + contentCols }, innerHorizontal: { style: "SOLID", color: borderLightRgb }, innerVertical: { style: "SOLID", color: borderLightRgb } } },
        
        // 5. Banding (Add with Safety: This assumes Apps Script cleared it via flush/remove before)
        {
          addBanding: {
            bandedRange: {
              range: {
                sheetId: sheetId,
                startRowIndex: L.DATA_START_ROW - 1,
                endRowIndex: totalRows - 1,
                startColumnIndex: 1,
                endColumnIndex: 1 + contentCols
              },
              rowProperties: {
                firstBandColor: { red: 1, green: 1, blue: 1 },
                secondBandColor: bgRgb
              }
            }
          }
        },
        // 6. Fixed widths
        {
          updateDimensionProperties: {
            range: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: 1 + contentCols },
            properties: { pixelSize: 100 },
            fields: "pixelSize"
          }
        },
        // 7. Invisible Buffer dots
        {
          updateCells: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: 1 },
            rows: [{ values: [{ userEnteredValue: { stringValue: "." }, userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } } } }] }],
            fields: "userEnteredValue,userEnteredFormat(backgroundColor,textFormat.foregroundColor)"
          }
        },
        {
          updateCells: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: totalCols - 1, endColumnIndex: totalCols },
            rows: [{ values: [{ userEnteredValue: { stringValue: "." }, userEnteredFormat: { backgroundColor: { red: 1, green: 1, blue: 1 }, textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } } } }] }],
            fields: "userEnteredValue,userEnteredFormat(backgroundColor,textFormat.foregroundColor)"
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
    
    // 🎨 Theme Palette
    const P = CONFIG.THEME.PALETTE;

    // 🏗️ Define Roles and Ordering
    const WORKSPACE = [
      { name: CONFIG.SHEETS.DB, color: P.WORKSPACE.DB },
      { name: CONFIG.SHEETS.LB, color: P.WORKSPACE.LB },
      { name: CONFIG.SHEETS.HH, color: P.WORKSPACE.HH }
    ];

    const TECHNICAL = [
      { name: CONFIG.SHEETS.BL, color: P.TECHNICAL },
      { name: CONFIG.SHEETS.EVT, color: P.TECHNICAL }
    ];

    // 🛡️ Registration Engine
    const REGISTER: Array<{ name: string; color: string; visible: boolean }> = [];
    
    // 1. Primary Visible Workspace
    WORKSPACE.forEach(item => REGISTER.push({ ...item, visible: true }));
    
    // 2. Technical Secondary Sheets (Hidden)
    TECHNICAL.forEach(item => REGISTER.push({ ...item, visible: false }));
    
    // 3. Backup Rotation & Legacy (Hidden)
    WORKSPACE.forEach(base => {
      // Standard Rotations
      for (let i = 1; i <= 5; i++) {
        REGISTER.push({ name: `Backup ${i} ${base.name}`, color: P.BACKUP, visible: false });
      }
      // Legacy Manual Backups
      REGISTER.push({ name: `Backup LEGACY ${base.name}`, color: P.BACKUP, visible: false });
    });

    // 🚀 BATCH EXECUTION (Sheets API)
    const ssId = ss.getId();
    const sheets = ss.getSheets();
    const requests: any[] = [];
    const nameMap = new Map(REGISTER.map((item, idx) => [item.name, { ...item, index: idx }]));

    sheets.forEach((sheet: any) => {
      const name = sheet.getName();
      const sheetId = sheet.getSheetId();
      const meta = nameMap.get(name);
      
      if (meta) {
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: sheetId,
              hidden: !meta.visible,
              index: meta.index,
              tabColor: this.hexToRgbColor(meta.color)
            },
            fields: 'hidden,index,tabColor'
          }
        });
      } else {
        // 🛡️ UNKNOWN SHEET: Hide and move to a safe high index to prevent overflow
        requests.push({
          updateSheetProperties: {
            properties: {
              sheetId: sheetId,
              hidden: true,
              index: 999 
            },
            fields: 'hidden,index'
          }
        });
      }
    });

    if (requests.length > 0) {
      try {
        Sheets.Spreadsheets!.batchUpdate({ requests }, ssId);
      } catch (e: any) {
        console.warn(`🧹 Tab Hygiene Batch Fail: ${e.message}`);
      }
    }
  },

  /**
   * 🎨 Helper: Convert Hex to Sheets API Color object
   */
  hexToRgbColor: function(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { red: r, green: g, blue: b };
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
      const copySheet = ss.getSheets().find((s: any) => s.getSheetId() === copySheetId);
      
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
      try { lock!.releaseLock(); } catch(e: any) {}
    }
  },

  setTabColor: function (sheet, color) {
    if (!sheet) return;
    try {
      sheet.setTabColor(color);
    } catch (e: any) {
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
    } catch (e: any) {
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
        return ss.getSheets().find((s: any) => s.getSheetId() === sheetId) || null;
      }
    } catch (e: any) {
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
    } catch (e: any) {
      console.warn(`🔒 Range Protection failed for ${sheet.getName()}: ${e}`);
    }
  },

  setStatusMessage: function (sheet, message) {
    if (!sheet) return;
    try {
      const ssId = sheet.getParent().getId();
      const sheetId = sheet.getSheetId();
      // ⚡ DYNAMIC WIDTH: Fetch actual width to avoid "Invalid Range" errors on resized sheets
      const maxCols = sheet.getMaxColumns(); 
      
      const T = CONFIG.THEME;
      const statusFgRgb = this.hexToRgbColor(T.STATUS_BAR.FG);
      const statusBgRgb = this.hexToRgbColor(T.STATUS_BAR.BG);
      
      // 🚀 ATOMIC STATUS UPDATE: Value + Theme in one transaction
      Sheets.Spreadsheets!.batchUpdate({
        requests: [
          {
            updateCells: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: 2 },
              rows: [{ values: [{ userEnteredValue: { stringValue: message } }] }],
              fields: "userEnteredValue"
            }
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: maxCols },
              cell: { 
                userEnteredFormat: { 
                  backgroundColor: statusBgRgb,
                  horizontalAlignment: "LEFT", 
                  verticalAlignment: "MIDDLE",
                  wrapStrategy: "WRAP",
                  textFormat: { bold: true, foregroundColor: statusFgRgb } 
                } 
              },
              fields: "userEnteredFormat(backgroundColor,horizontalAlignment,verticalAlignment,wrapStrategy,textFormat)"
            }
          }
        ]
      }, ssId);
    } catch (e: any) {
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
