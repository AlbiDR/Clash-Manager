import { CONFIG } from './Configuration';
import Registry from './Registry';

declare var Sheets: any;
declare var SpreadsheetApp: any;

const RosterView = {
  /**
   * LAYOUT: Applies visual standards (Conditional formatting, numbering, banding).
   */
  restoreVisuals(sheet: any, rowCount: number, HEADERS_ARRAY: string[]) {
    const ssId = sheet.getParent().getId();
    const sheetId = sheet.getSheetId();
    const L = CONFIG.SCHEMA.ROSTER; 
    const startIdx = CONFIG.LAYOUT.DATA_START_ROW - 1;
    const contentCols = HEADERS_ARRAY.length;

    // Step 1: Standard Base Layout
    Registry.Services.View.applyStandardLayout(
      sheet,
      rowCount,
      contentCols,
      HEADERS_ARRAY
    );

    // Step 2: Specialized Roster Visuals
    const finalRequests: any[] = [
      // 2A. PERFORMANCE GRADIENT
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: startIdx, endRowIndex: startIdx + rowCount, startColumnIndex: L.PERF_SCORE + 1, endColumnIndex: L.PERF_SCORE + 2 }],
            gradientRule: {
              minpoint: { color: { red: 1, green: 1, blue: 1 }, type: "NUMBER", value: "0" },
              midpoint: { color: { red: 1, green: 0.949, blue: 0.8 }, type: "NUMBER", value: "50" },
              maxpoint: { color: { red: 0.415, green: 0.658, blue: 0.309 }, type: "NUMBER", value: "100" }
            }
          },
          index: 0
        }
      },
      // 2B. TREND COLORS
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: startIdx, endRowIndex: startIdx + rowCount, startColumnIndex: L.TREND + 1, endColumnIndex: L.TREND + 2 }],
            booleanRule: {
              condition: { type: "NUMBER_GREATER", values: [{ userEnteredValue: "0" }] },
              format: { textFormat: { foregroundColor: { green: 0.4 } } }
            }
          },
          index: 0
        }
      },
      {
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: startIdx, endRowIndex: startIdx + rowCount, startColumnIndex: L.TREND + 1, endColumnIndex: L.TREND + 2 }],
            booleanRule: {
              condition: { type: "NUMBER_LESS", values: [{ userEnteredValue: "0" }] },
              format: { textFormat: { foregroundColor: { red: 0.8 } } }
            }
          },
          index: 1
        }
      },
      // 2C. FORMATTING
      {
        repeatCell: {
          range: { sheetId, startRowIndex: startIdx, endRowIndex: startIdx + rowCount, startColumnIndex: L.WAR_RATE + 1, endColumnIndex: L.WAR_RATE + 2 },
          cell: { userEnteredFormat: { numberFormat: { type: "PERCENT", pattern: '0%' } } },
          fields: "userEnteredFormat.numberFormat"
        }
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: startIdx, endRowIndex: startIdx + rowCount, startColumnIndex: L.LAST_SEEN + 1, endColumnIndex: L.LAST_SEEN + 2 },
          cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: CONFIG.SYSTEM.DATE_FORMAT_DATETIME } } },
          fields: "userEnteredFormat.numberFormat"
        }
      }
    ];

    Sheets.Spreadsheets.batchUpdate({ requests: finalRequests }, ssId);
    Registry.Services.View.setStatusMessage(sheet, `ROSTER | ${new Date().toLocaleString()}`);
  }
};

export default RosterView;
