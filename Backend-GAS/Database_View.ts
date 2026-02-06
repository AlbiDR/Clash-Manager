import { CONFIG } from './Configuration';
import Registry from './Registry';

declare var Sheets: any;

/**
 * ============================================================================
 * MODULE: DATABASE VIEW
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Handles all Spreadsheet rendering, formatting, and layout
 *    for the Clan Database.
 * ============================================================================
 */

const DatabaseView = {
  /**
   * HEADERS: Single source of truth from SCHEMA.
   */
  getHeaders(): string[] {
    return Object.values(CONFIG.SCHEMA.DB_HEADERS);
  },

  /**
   * Ensures the sheet has the correct columns and headers.
   */
  ensureStructure(ss: any, sheet: any) {
    const ssId = ss.getId();
    const headers = this.getHeaders();
    
    // SCHEMA & GRID MANAGEMENT
    const sheetMetadata = Sheets.Spreadsheets.get(ssId, {
      ranges: [CONFIG.SHEETS.DB],
      includeGridData: false
    });
    
    const dbSheetMeta = sheetMetadata.sheets.find((s: any) => s.properties.title === CONFIG.SHEETS.DB);
    const sheetId = dbSheetMeta.properties.sheetId;
    const gridProps = dbSheetMeta.properties.gridProperties;
    const currentMaxRows = gridProps.rowCount;
    const currentMaxCols = gridProps.columnCount;
    const requiredCols = headers.length + 2; // +2 buffer/standard logic

    // Header Check & Initialization
    if (currentMaxRows < 2) {
       // Atomic write of headers if sheet is empty
       Sheets.Spreadsheets.Values.update({
         values: [headers]
       }, ssId, `'${CONFIG.SHEETS.DB}'!B2`, {
         valueInputOption: "USER_ENTERED"
       });
    }

    if (currentMaxCols < requiredCols) {
      Registry.Services.Reporting.logStep(2, 5, `Adjusting Sheet Topology (+${requiredCols - currentMaxCols} cols)...`);
      Sheets.Spreadsheets.batchUpdate({
        requests: [{
          appendDimension: {
            sheetId: sheetId,
            dimension: "COLUMNS",
            length: requiredCols - currentMaxCols
          }
        }]
      }, ssId);
    }
    
    const S_DB = CONFIG.SCHEMA.DB;
    Sheets.Spreadsheets.batchUpdate({
      requests: [
        {
          repeatCell: {
            range: { sheetId, startColumnIndex: 1 + S_DB.TAG, endColumnIndex: 2 + S_DB.TAG },
            cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
            fields: "userEnteredFormat(numberFormat)"
          }
        },
        {
          repeatCell: {
            range: { sheetId, startColumnIndex: 1 + S_DB.TROPHIES, endColumnIndex: 2 + S_DB.DON_REC },
            cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0" } } },
            fields: "userEnteredFormat(numberFormat)"
          }
        },
        {
          repeatCell: {
            range: { sheetId, startColumnIndex: 1 + S_DB.WAR_FAME, endColumnIndex: 2 + S_DB.BATTLE_CREDITS },
            cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0" } } },
            fields: "userEnteredFormat(numberFormat)"
          }
        }
      ]
    }, ssId);
    
    return { sheetId, currentMaxRows };
  },

  /**
   * Applies the standard layout and specific data formatting.
   */
  restoreVisuals(sheet: any, sheetId: number, dataRowCount: number) {
     const startRow = CONFIG.LAYOUT.DATA_START_ROW;
     const S_DB = CONFIG.SCHEMA.DB;
     const ssId = sheet.getParent().getId();
     const headers = this.getHeaders();
     const contentCols = headers.length;
     
     // Calculate target grid size for formatting consistency
     const targetRowCount = (CONFIG.LAYOUT.DATA_START_ROW - 1) + dataRowCount + 1;

     // Sweep for existing bandings
     try {
         sheet.getBandings().forEach((b: any) => b.remove());
     } catch (e: any) {
         console.warn(`[VIEW] Could not remove existing bandings: ${e}`);
     }

      const finalVisualRequests: any[] = [
        // 6A. HEADERS DELIVERY (Row 2 Style & Value Sync)
        {
          updateCells: {
            rows: [{
              values: headers.map(h => ({
                userEnteredValue: { stringValue: h },
                userEnteredFormat: { 
                    textFormat: { bold: true }, 
                    wrapStrategy: "WRAP", 
                    horizontalAlignment: "CENTER", 
                    backgroundColor: Registry.Services.View.hexToRgbColor(CONFIG.THEME.TABLE.HEADER_BG)
                }
              }))
            }],
            fields: 'userEnteredValue,userEnteredFormat(textFormat.bold,wrapStrategy,horizontalAlignment,backgroundColor)',
            range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 1 + contentCols }
          }
        }
      ];

     if (targetRowCount >= startRow) {
         // 6B. NUMBER FORMATS (ISO Roots -> Visual Display)
         finalVisualRequests.push(
           {
             repeatCell: {
               range: { sheetId, startRowIndex: startRow - 1, endRowIndex: targetRowCount - 1, startColumnIndex: 1 + S_DB.DATE, endColumnIndex: 2 + S_DB.DATE },
               cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: CONFIG.SYSTEM.DATE_FORMAT_DATE } } },
               fields: "userEnteredFormat(numberFormat)"
             }
           },
           {
             repeatCell: {
               range: { sheetId, startRowIndex: startRow - 1, endRowIndex: targetRowCount - 1, startColumnIndex: 1 + S_DB.TAG, endColumnIndex: 4 + S_DB.TAG },
               cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
               fields: "userEnteredFormat(numberFormat)"
             }
           },
           {
             repeatCell: {
               range: { sheetId, startRowIndex: startRow - 1, endRowIndex: targetRowCount - 1, startColumnIndex: 1 + S_DB.LAST_SEEN, endColumnIndex: 2 + S_DB.LAST_SEEN },
               cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: CONFIG.SYSTEM.DATE_FORMAT_DATETIME } } },
               fields: "userEnteredFormat(numberFormat)"
             }
           },
            {
              repeatCell: {
                range: { 
                  sheetId, 
                  startRowIndex: startRow - 1, 
                  endRowIndex: targetRowCount - 1, 
                  startColumnIndex: 1 + S_DB.TROPHIES, 
                  endColumnIndex: 2 + S_DB.DON_REC 
                },
                cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0" } } },
                fields: "userEnteredFormat(numberFormat)"
              }
            },
            {
              repeatCell: {
                range: { 
                  sheetId, 
                  startRowIndex: startRow - 1, 
                  endRowIndex: targetRowCount - 1, 
                  startColumnIndex: 1 + S_DB.WAR_FAME, 
                  endColumnIndex: 2 + S_DB.BATTLE_CREDITS 
                },
                cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: "0" } } },
                fields: "userEnteredFormat(numberFormat)"
              }
            }
         );
     }

     // 6C. INJECT STANDARD LAYOUT (Borders, Alignment, Status Bar, Auto-Resize)
     finalVisualRequests.push(...Registry.Services.View.getStandardVisualRequests(sheetId, dataRowCount, contentCols));

     // EXECUTE UNBREAKABLE TRANSACTION
     Sheets.Spreadsheets.batchUpdate({ requests: finalVisualRequests }, ssId);

     Registry.Services.View.setStatusMessage(sheet, `DATABASE | ${new Date().toLocaleString()}`);
  }
};

export default DatabaseView;
