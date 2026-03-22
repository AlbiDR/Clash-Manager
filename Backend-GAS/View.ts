
/**
 * ============================================================================
 * MODULE: VIEW (UI & Layout Engine)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Handles all Spreadsheet visualization, formatting, and
 *    interactive elements (checkboxes, banding, headers).
 * ROLE: Pure Presentation Layer. "How it looks".
 * VERSION: 1.0.1
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

export interface ViewContract {
  applyStandardLayout(
    sheet: any,
    contentRows: number,
    contentCols: number,
    optHeaders?: string[] | null,
  ): void;
  drawMobileCheckbox(sheet: any): void;
  refreshMobileControls(ss: any): void;
  enforceGlobalTabHygiene(ss?: any): void;
  isStrayDuplicate(name: string): boolean;
  backupSheet(ss: any, sheetName: string): void;
  setTabColor(sheet: any, color: string | null): void;
  tagSheet(sheet: any, type: string): void;
  findSheetByType(ss: any, type: string): any | null;
  protectHeaders(sheet: any): void;
  setStatusMessage(sheet: any, message: string): void;
  getColLetter(index: number): string;
  createDeleteRequest(sheetId: number, row: number): any;
  getStandardVisualRequests(sheetId: number, contentRows: number, contentCols: number): any[];
  hexToRgbColor(hex: string): { red: number; green: number; blue: number };
  darkenRgb(rgb: { red: number; green: number; blue: number }, factor: number): { red: number; green: number; blue: number };
  interact(sheet: any, startMsg: string, taskFn: () => void): void;
}

var View: ViewContract = {
  /**
   * STANDARD VISUAL GENERATOR
   * Produces the signature "Clean Technical" request stack for batch updates.
   */
  createDeleteRequest: function (sheetId, row) {
    return {
      deleteDimension: {
        range: {
          sheetId: sheetId,
          dimension: "ROWS",
          startIndex: row - 1,
          endIndex: row
        }
      }
    };
  },

  getColLetter: function (index) {
    let letter = "";
    while (index > 0) {
      const temp = (index - 1) % 26;
      letter = String.fromCharCode(65 + temp) + letter;
      index = Math.floor((index - temp) / 26);
    }
    return letter;
  },

  getStandardVisualRequests: function (
    sheetId,
    contentRows,
    contentCols
  ) {
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
              gridProperties: { rowCount: totalRows, columnCount: totalCols, frozenRowCount: 2 }
            },
            fields: 'gridProperties.rowCount,gridProperties.columnCount,gridProperties.frozenRowCount'
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
            cell: { 
              userEnteredFormat: { 
                backgroundColor: headerRgb, 
                textFormat: { bold: true },
                wrapStrategy: "WRAP"
              } 
            },
            fields: 'userEnteredFormat(backgroundColor,textFormat.bold,wrapStrategy)'
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
        // 4.1 White Masks (Margins & Bottom Buffer)
        { 
          updateBorders: { 
            range: { sheetId, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: 1 }, 
            innerHorizontal: { style: "SOLID", color: { red: 1, green: 1, blue: 1 } },
            top: { style: "SOLID", color: { red: 1, green: 1, blue: 1 } },
            bottom: { style: "SOLID", color: { red: 1, green: 1, blue: 1 } }
          } 
        },
        { 
          updateBorders: { 
            range: { sheetId, startRowIndex: 0, endRowIndex: totalRows, startColumnIndex: totalCols - 1, endColumnIndex: totalCols }, 
            innerHorizontal: { style: "SOLID", color: { red: 1, green: 1, blue: 1 } },
            top: { style: "SOLID", color: { red: 1, green: 1, blue: 1 } },
            bottom: { style: "SOLID", color: { red: 1, green: 1, blue: 1 } }
          } 
        },
        { 
          updateBorders: { 
            range: { sheetId, startRowIndex: totalRows - 1, endRowIndex: totalRows, startColumnIndex: 0, endColumnIndex: totalCols }, 
            innerVertical: { style: "SOLID", color: { red: 1, green: 1, blue: 1 } },
            left: { style: "SOLID", color: { red: 1, green: 1, blue: 1 } },
            right: { style: "SOLID", color: { red: 1, green: 1, blue: 1 } },
            bottom: { style: "SOLID", color: { red: 1, green: 1, blue: 1 } }
          } 
        },
        { 
          updateBorders: { 
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: totalCols }, 
            innerVertical: { style: "SOLID", color: statusBgRgb },
            top: { style: "SOLID", color: statusBgRgb },
            bottom: { style: "SOLID", color: statusBgRgb }
          } 
        },

        // 4.2 Dark Table Borders
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: totalRows - 1, startColumnIndex: 0, endColumnIndex: 1 }, right: { style: "SOLID", color: borderDarkRgb } } },
        { updateBorders: { range: { sheetId, startRowIndex: 1, endRowIndex: totalRows - 1, startColumnIndex: totalCols - 1, endColumnIndex: totalCols }, left: { style: "SOLID", color: borderDarkRgb } } },
        { updateBorders: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 1, endColumnIndex: totalCols - 1 }, bottom: { style: "SOLID", color: borderDarkRgb } } },
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
        // 7. Invisible Column A (Sort Numbers) from Row 2 down
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 1, endRowIndex: totalRows - 1, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { 
              userEnteredFormat: { 
                horizontalAlignment: "CENTER",
                verticalAlignment: "MIDDLE",
                backgroundColor: { red: 1, green: 1, blue: 1 }, 
                textFormat: { foregroundColor: { red: 1, green: 1, blue: 1 } } 
              } 
            },
            fields: "userEnteredFormat(horizontalAlignment,verticalAlignment,backgroundColor,textFormat.foregroundColor)"
          }
        },
        // 7.5 Invisible Buffer dot for Right Margin
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
   * STANDARD LAYOUT ENGINE
   * Atomic execution of visual standards.
   */
  applyStandardLayout: function (
    sheet,
    contentRows,
    contentCols,
    optHeaders = null
  ) {
    if (!sheet) return;
    const sheetId = sheet.getSheetId();
    const ssId = sheet.getParent().getId();

    // 1. Cleanup
    try {
      sheet.getBandings().forEach((b: any) => b.remove());
    } catch (e: any) { /* Handled */ }

    // 2. Base Requests
    const requests = this.getStandardVisualRequests(sheetId, contentRows, contentCols);

    // 3. Optional Headers sync
    if (optHeaders && optHeaders.length > 0) {
      requests.push({
        updateCells: {
          rows: [{
            values: optHeaders.map(h => ({
              userEnteredValue: { stringValue: h }
            }))
          }],
          fields: 'userEnteredValue',
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 1 + optHeaders.length }
        }
      });
    }

    // 4. Execute
    Sheets.Spreadsheets.batchUpdate({ requests }, ssId);
  },

  /**
   * MOBILE INTERFACE ELEMENTS
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
      .setNote("QUICK UPDATE:\n(Select to run)");
  },

  refreshMobileControls: function (ss) {
    const sheets = [CONFIG.SHEETS.DB, CONFIG.SHEETS.ROSTER, CONFIG.SHEETS.HH];
    sheets.forEach((name) => {
      const sheet = ss.getSheetByName(name);
      if (sheet) {
        this.drawMobileCheckbox(sheet);
        sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL || "A1").setValue(false);
      }
    });
  },

  /**
   * Helper: Convert Hex to Sheets API Color object
   */
  hexToRgbColor: function(hex: string) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    return { red: r, green: g, blue: b };
  },

  /**
   * Helper: Darken an RGB color by a multiplier
   */
  darkenRgb: function(rgb: { red: number; green: number; blue: number }, factor: number) {
    return {
        red: Math.max(0, rgb.red * factor),
        green: Math.max(0, rgb.green * factor),
        blue: Math.max(0, rgb.blue * factor)
    };
  },

  /**
   * Helper: Detects failure artifacts (e.g. "Copy of Headhunter")
   */
  isStrayDuplicate: function(name: string): boolean {
    const prefixes = ["Copy of ", "Copia di "];
    const coreSheets = [CONFIG.SHEETS.DB, CONFIG.SHEETS.ROSTER, CONFIG.SHEETS.HH];
    
    return prefixes.some(prefix => {
        if (!name.startsWith(prefix)) return false;
        const originalName = name.substring(prefix.length);
        return coreSheets.includes(originalName);
    });
  },

  /**
   * GLOBAL HYGIENE PROTOCOL
   */
  enforceGlobalTabHygiene: function (ss) {
    if (!ss) ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Theme Palette
    const P = CONFIG.THEME.PALETTE;
    const SH = CONFIG.SHEETS;

    // Define Roles (Interleaved ordering: Parent -> Backups -> Legacy)
    const REGISTER: Array<{ name: string; color: any; visible: boolean }> = [];

    const WORKSPACE_CONFIGS = [
      { name: SH.DB, baseColor: P.WORKSPACE.DB, visible: true },
      { name: SH.ROSTER, baseColor: P.WORKSPACE.ROSTER, visible: true },
      { name: SH.HH, baseColor: P.WORKSPACE.HH, visible: true }
    ];

    WORKSPACE_CONFIGS.forEach(ws => {
      const baseRgb = this.hexToRgbColor(ws.baseColor);
      
      // 1. Primary Sheet (Use base color for visibility; technical companions will be darkened)
      REGISTER.push({ name: ws.name, color: baseRgb, visible: ws.visible });

      // 2. Rotation Backups (70% brightness)
      const backupColor = this.darkenRgb(baseRgb, 0.7);
      for (let i = 1; i <= CONFIG.SYSTEM.MAX_BACKUPS; i++) {
        REGISTER.push({ name: `Backup ${i} ${ws.name}`, color: backupColor, visible: false });
      }

      // 3. Legacy Backups (45% brightness)
      const legacyColor = this.darkenRgb(baseRgb, 0.45);
      REGISTER.push({ name: `Backup LEGACY ${ws.name}`, color: legacyColor, visible: false });
    });

    // 4. Technical / Infrastructure (Trailing)
    const hhDarkRgb = this.darkenRgb(this.hexToRgbColor(P.WORKSPACE.HH), 0.3); // Unified deep red for HH ecosystem
    
    REGISTER.push({ name: SH.QUEUE, color: hhDarkRgb, visible: false });
    REGISTER.push({ name: SH.BL, color: hhDarkRgb, visible: false });
    REGISTER.push({ name: SH.EVT, color: hhDarkRgb, visible: false });

    // EXECUTION
    const ssId = ss.getId();
    const sheets = ss.getSheets();
    const requests: any[] = [];
    const nameMap = new Map(REGISTER.map((item, idx) => [item.name, { ...item, index: idx }]));

    const sortedSheets = [...sheets].sort((a, b) => {
      const idxA = nameMap.get(a.getName())?.index ?? 999;
      const idxB = nameMap.get(b.getName())?.index ?? 999;
      return idxA - idxB;
    });

    sortedSheets.forEach((sheet: any, i: number) => {
      const name = sheet.getName();

      // HYGIENE CHECK: Delete known failure artifacts immediately
      if (this.isStrayDuplicate(name)) {
        console.warn(`Hygiene: Deleting stray artifact '${name}'`);
        requests.push({ deleteSheet: { sheetId: sheet.getSheetId() } });
        return; 
      }

      const meta = nameMap.get(name);
      
      const properties: any = {
        sheetId: sheet.getSheetId(),
        index: i,
        tabColor: meta ? meta.color : this.hexToRgbColor(P.STRAY)
      };

      const fields = ["index", "tabColor"];
      if (meta) {
        properties.hidden = !meta.visible;
        fields.push("hidden");
      }

      requests.push({
        updateSheetProperties: {
          properties: properties,
          fields: fields.join(",")
        }
      });
    });

    let summary = "Hydrated";
    if (requests.length > 0) {
      try {
        Sheets.Spreadsheets!.batchUpdate({ requests }, ssId);
        
        // Log Summary
        const hiddenCount = requests.filter(r => r.updateSheetProperties.properties.hidden).length;
        const colorCount = requests.filter(r => r.updateSheetProperties.properties.tabColor).length;
        summary = `${hiddenCount} Hidden, ${colorCount} Colored`;
      } catch (e: any) {
        summary = `Hygiene Error: ${e.message}`;
      }
    }

    // 5. INFRASTRUCTURE HEALING: Ensure mobile triggers exist on all system tabs
    this.refreshMobileControls(ss);
    return summary;
  },

  /**
   * Helper: Convert Hex to Sheets API Color object
   */

  /**
   * BACKUP SYSTEM
   * Rotates backups and creates a fresh clone using atomic operations.
   */
  backupSheet: function (ss, sheetName): string {
    const lock = LockService.getDocumentLock();
    try {
      if (!lock!.tryLock(20000)) return "Lock Timeout"; 
      
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return "Sheet Not Found";

      const MAX_BACKUPS = CONFIG.SYSTEM.MAX_BACKUPS;
      const backup1Name = `Backup 1 ${sheetName}`;
      const ssId = ss.getId();
      const sheetId = sheet.getSheetId();

      // 1. Check if backup is even necessary (Idempotency)
      const existingBackup1 = ss.getSheetByName(backup1Name);
      if (existingBackup1) {
        const lastRow = sheet.getLastRow();
        const lastCol = sheet.getLastColumn();
        if (lastRow === existingBackup1.getLastRow() && lastCol === existingBackup1.getLastColumn()) {
          const numRows = Math.min(100, lastRow); // Sample check
          if (numRows > 0) {
            const currentData = sheet.getRange(1, 1, numRows, lastCol).getValues();
            const backupData = existingBackup1.getRange(1, 1, numRows, lastCol).getValues();
            if (JSON.stringify(currentData) === JSON.stringify(backupData)) {
              return "No Changes"; 
            }
          }
        }
      }
      
      // 2. Atomic Rotation Strategy (Batch Update)
      const requests: any[] = [];
      const sheets = ss.getSheets();
      
      // A. Delete oldest
      const oldestName = `Backup ${MAX_BACKUPS} ${sheetName}`;
      const oldest = sheets.find((s: any) => s.getName() === oldestName);
      if (oldest) {
        requests.push({ deleteSheet: { sheetId: oldest.getSheetId() } });
      }

      // B. Shift others backwards
      for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
        const curName = `Backup ${i} ${sheetName}`;
        const targetName = `Backup ${i + 1} ${sheetName}`;
        const s = sheets.find((sh: any) => sh.getName() === curName);
        if (s) {
          requests.push({
            updateSheetProperties: {
              properties: { sheetId: s.getSheetId(), title: targetName },
              fields: "title"
            }
          });
        }
      }

      if (requests.length > 0) {
        try {
          Sheets.Spreadsheets!.batchUpdate({ requests }, ssId);
        } catch (rotError: any) {
          console.warn(`Backup Rotation (Rotation) failed for ${sheetName}: ${rotError.message}. Proceeding to Clone.`);
        }
      }

      // 3. High-Performance Clone
      const copyResponse = Sheets.Spreadsheets!.Sheets!.copyTo({
        destinationSpreadsheetId: ssId
      }, ssId, sheetId);

      const copySheetId = copyResponse.sheetId;
      
      // 4. Finalize Clone (Rename & Tag)
      // Robust Verification: Ensure the copied sheet is found even if GAS is slow
      SpreadsheetApp.flush(); 
      const allSheets = ss.getSheets();
      const clonedSheet = allSheets.find((s: any) => s.getSheetId() === copySheetId);

      if (clonedSheet) {
        clonedSheet.setName(backup1Name);
        clonedSheet.hideSheet(); // Proactive hide
        this.tagSheet(clonedSheet, "BACKUP");

        // STATUS OVERRIDE: Prevent backups from showing "Initializing..." forever
        // @ts-ignore
        const timestamp = Utilities.formatDate(new Date(), CONFIG.SYSTEM.TIMEZONE, CONFIG.SYSTEM.DATE_FORMAT_DATETIME);
        this.setStatusMessage(clonedSheet, `Backup: ${timestamp}`);
      } else {
        throw new Error("Cloned sheet not found");
      }

      return "Archives Rotated";

    } catch (e: any) {
      console.error(`Backup Error for ${sheetName}: ${e.message}`);
      return `Backup Fail: ${e.message}`;
    } finally {
      // Always run hygiene to clean up any stray "Copy of..." tabs created by failed attempts
      // PASS ss to avoid re-fetching active spreadsheet if possible
      try { this.enforceGlobalTabHygiene(ss); } catch(e: any) {}
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
   * DEVELOPER METADATA ENGINE
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
      console.warn(`Metadata Tagging failed for ${sheet.getName()}: ${e}`);
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
      console.warn(`Metadata Lookup failed for type ${type}: ${e}`);
    }
    return null;
  },

  /**
   * PROTECTED RANGE REGISTRY
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
                description: "SYSTEM HEADERS (Read Only)",
                warningOnly: false,
                editors: { domainUsersCanEdit: false, users: [Session.getEffectiveUser().getEmail()] }
              }
            }
          }
        ]
      }, ssId);
    } catch (e: any) {
      console.warn(`Range Protection failed for ${sheet.getName()}: ${e}`);
    }
  },

  setStatusMessage: function (sheet, message) {
    if (!sheet) return;
    try {
      const ssId = sheet.getParent().getId();
      const sheetId = sheet.getSheetId();
      // DYNAMIC WIDTH: Fetch actual width to avoid "Invalid Range" errors on resized sheets
      const maxCols = sheet.getMaxColumns(); 
      
      const T = CONFIG.THEME;
      const statusFgRgb = this.hexToRgbColor(T.STATUS_BAR.FG);
      const statusBgRgb = this.hexToRgbColor(T.STATUS_BAR.BG);
      
      // ATOMIC STATUS UPDATE: Value + Theme in one transaction
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
  },

  /**
   * ATOMIC UI TRANSACTION
   * Safe wrapper for user-facing scripts ensuring consistent status updates.
   */
  interact: function(sheet: any, startMsg: string, taskFn: () => void) {
    if (!sheet) return;
    try {
      this.setStatusMessage(sheet, `Initializing: ${startMsg}`);
      SpreadsheetApp.flush();
      taskFn();
    } catch (e: any) {
      console.error(e);
      this.setStatusMessage(sheet, `Error: ${e.message}`);
      throw e; 
    }
  }
};



/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { View, VER_VIEW });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default View;
