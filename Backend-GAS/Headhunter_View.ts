
import { CONFIG } from './Configuration';
import Registry from './Registry';
import type { Recruit } from './Headhunter_Types';

/**
 * ============================================================================
 * MODULE: HEADHUNTER VIEW
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Rendering engine for the Headhunter Interface.
 *    Handles Atomic Data Delivery + Visual Formatting.
 * ============================================================================
 */

declare var Sheets: any;
declare var Utilities: any;

export interface HeadhunterViewContract {
  render(sheet: any, list: Recruit[], baseline: number): void;
}

const HeadhunterView: HeadhunterViewContract = {
  render(sheet: any, list: Recruit[], baseline: number): void {
    if (!sheet) return;

    const CANONICAL_KEYS: Array<keyof typeof CONFIG.SCHEMA.HH> = [
      "TAG",
      "INVITED",
      "NAME",
      "TROPHIES",
      "DONATIONS",
      "CARDS",
      "WAR_WINS",
      "FOUND_DATE",
      "RAW_SCORE",
      "POTENTIAL_SCORE",
      "LAST_SCAN",
    ];

    // STRUCTURAL SANITY CHECK: Enforce 11 Columns (index 0-10)
    if (CANONICAL_KEYS.length !== 11 || CANONICAL_KEYS[10] !== "LAST_SCAN") {
       throw new Error(`CRITICAL SCHEMA DRIFT: Expected 11 Headhunter keys, found ${CANONICAL_KEYS.length}. Check Configuration.ts`);
    }

    // Ensure numeric indices are synced (Redundant if Config is static but safe)
    CANONICAL_KEYS.forEach((key, index) => {
      CONFIG.SCHEMA.HH[key] = index;
    });

    const HEADERS = CANONICAL_KEYS.map(
      (key) =>
        CONFIG.SCHEMA.HH_HEADERS[key as keyof typeof CONFIG.SCHEMA.HH_HEADERS],
    );

    // LAYOUT PREPARATION (Run FIRST to establish canvas)
    // HEADERS.length must be exactly 11.
    Registry.Services.View.applyStandardLayout(
      sheet,
      Math.max(list.length, CONFIG.HEADHUNTER.TARGET),
      HEADERS.length,
      HEADERS,
    );
    
    // COMPATIBLE DATE WRITE: Use dot-separated strings (dd/MM/yyyy HH.mm.ss)
    // This prevents Sheets from auto-formatting in ways that break scripts.
    // The numberFormat applied later handles the visual display (dd/MM/yyyy HH:mm).
    const fmt = (d: any): string => {
      const dateObj = Registry.Services.Time.parseFlexibleDate(d);
      // Fallback if Date is invalid or Unix Epoch
      if (isNaN(dateObj.getTime()) || dateObj.getTime() === 0) return "-";
      return Registry.Services.Time.formatDate(dateObj);
    };

    const fmtDt = (d: any): string => {
      const dateObj = Registry.Services.Time.parseFlexibleDate(d);
      if (isNaN(dateObj.getTime()) || dateObj.getTime() === 0) return "-";
      return Registry.Services.Time.formatDatetime(dateObj);
    };

    const rows = list.map((c) => [
      c.tag,
      c.invited,
      c.name,
      Number(c.trophies || 0),
      Number(c.donations || 0),
      Number(c.cards || 0),
      Number(c.war || 0),
      fmt(c.foundDate),
      Number(c.rawScore || 0),
      Number(c.potentialScore || 0),
      fmtDt(c.lastScan),
    ]);

    // PAD TO FIXED SIZE (50 Recruits + Buffer)
    // Ensures the headhunter table maintains a consistent 50-row UI footprint.
    const actualCount = rows.length;
    const HH_LIMIT = CONFIG.HEADHUNTER.TARGET || 50;
    while (rows.length < HH_LIMIT) {
      const emptyRow = new Array(HEADERS.length).fill("");
      rows.push(emptyRow);
    }

    const ssId = sheet.getParent().getId();
    const sheetId = sheet.getSheetId();
    const startIdx = CONFIG.LAYOUT.DATA_START_ROW - 1;
    const contentRows = rows.length; // Now padded to HH_LIMIT
    const contentCols = HEADERS.length;

    // 1. DATA DELIVERY (Atomic Update) - USER_ENTERED (Only if rows exist)
    if (rows.length > 0) {
      Sheets.Spreadsheets!.Values!.update({
        values: rows
      }, ssId, `'${sheet.getName()}'!B${CONFIG.LAYOUT.DATA_START_ROW}`, {
        valueInputOption: "USER_ENTERED"
      });
    }

    // 2. TOTAL ATOMIC VISUALS (Consolidated) - ALWAYS EXECUTE
    const finalRequests: any[] = [
      // 2A. HEADERS DELIVERY (Row 2 Style & Value)
      {
        updateCells: {
          rows: [{
            values: HEADERS.map(h => ({
              userEnteredValue: { stringValue: h },
              userEnteredFormat: { 
                textFormat: { bold: true }, 
                wrapStrategy: "WRAP", 
                horizontalAlignment: "CENTER", 
                backgroundColor: Registry.Services.View.hexToRgbColor(CONFIG.THEME?.TABLE?.HEADER_BG || "#f8f9fa") 
              }
            }))
          }],
          fields: 'userEnteredValue,userEnteredFormat(textFormat.bold,wrapStrategy,horizontalAlignment,backgroundColor)',
          range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 1 + contentCols }
        }
      },
      // 2B. CHECKBOXES (Only if data exists to validate)
      ...(contentRows > 0 ? [{
        repeatCell: {
          range: { sheetId, startRowIndex: startIdx, endRowIndex: startIdx + contentRows, startColumnIndex: CONFIG.SCHEMA.HH.INVITED + 1, endColumnIndex: CONFIG.SCHEMA.HH.INVITED + 2 },
          cell: { dataValidation: { condition: { type: "BOOLEAN" } } },
          fields: "dataValidation"
        }
      }] : []),
      // 2C. SCORING GRADIENT
      ...(contentRows > 0 ? [{
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: startIdx, endRowIndex: startIdx + contentRows, startColumnIndex: CONFIG.SCHEMA.HH.POTENTIAL_SCORE + 1, endColumnIndex: CONFIG.SCHEMA.HH.POTENTIAL_SCORE + 2 }],
            gradientRule: {
              minpoint: { color: { red: 1, green: 1, blue: 1 }, type: "NUMBER", value: "0" },
              midpoint: { color: { red: 1, green: 0.949, blue: 0.8 }, type: "NUMBER", value: "50" },
              maxpoint: { color: { red: 0.415, green: 0.658, blue: 0.309 }, type: "NUMBER", value: "100" }
            }
          },
          index: 0
        }
      }] : []),
      // 2D. NUMBER FORMATS (Percentage & Date)
      ...(contentRows > 0 ? [{
        repeatCell: {
          range: { sheetId, startRowIndex: startIdx, endRowIndex: startIdx + contentRows, startColumnIndex: CONFIG.SCHEMA.HH.POTENTIAL_SCORE + 1, endColumnIndex: CONFIG.SCHEMA.HH.POTENTIAL_SCORE + 2 },
          cell: { userEnteredFormat: { numberFormat: { type: "NUMBER", pattern: '0' } } },
          fields: "userEnteredFormat.numberFormat"
        }
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: startIdx, endRowIndex: startIdx + contentRows, startColumnIndex: CONFIG.SCHEMA.HH.FOUND_DATE + 1, endColumnIndex: CONFIG.SCHEMA.HH.FOUND_DATE + 2 },
          cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: CONFIG.SYSTEM.DATE_FORMAT_DATETIME } } },
          fields: "userEnteredFormat.numberFormat"
        }
      },
      {
        repeatCell: {
          range: { sheetId, startRowIndex: startIdx, endRowIndex: startIdx + contentRows, startColumnIndex: CONFIG.SCHEMA.HH.LAST_SCAN + 1, endColumnIndex: CONFIG.SCHEMA.HH.LAST_SCAN + 2 },
          cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: CONFIG.SYSTEM.DATE_FORMAT_DATETIME } } },
          fields: "userEnteredFormat.numberFormat"
        }
      }] : [])
    ];

    // EXECUTE UNBREAKABLE TRANSACTION
    Sheets.Spreadsheets!.batchUpdate({ requests: finalRequests }, ssId);

    // Apply specific formatting (Green Highlight for high potential)
    // Creating Conditional Formatting via API is better (atomic), but I'll stick to GAS if complex.
    // I can implement it here.
    
    // We already added gradient. Let's add the Highlight Rule via API too?
    // "High Potential > 80 (Column 11 / K)"
    // Column 11 is 'L'? No.
    // SCHEMA.HH.POTENTIAL_SCORE is 9 (0-indexed relative to B). So it is Column K (11th letter).
    // range: startColumnIndex: 10, endColumnIndex: 11?
    // B is index 1. 1 + 9 = 10. So it is Column 10 (K).
    // Correct logic: `startColumnIndex: CONFIG.SCHEMA.HH.POTENTIAL_SCORE + 1`.

    // Using GAS API for conditional formatting usually overwrites all rules.
    // The Batch Update `addConditionalFormatRule` appends.
    // I'll stick to the Batch Update for gradients.
    // For the >80 rule, I'll add it to `finalRequests` as well.
    
    // Mixing Batch Update and GAS Object calls is risky for Conditional Formatting.
    // Ideally do ALL or NONE via API.
    // Since `applyStandardLayout` clears things, I should probably do ALL via API.
    
    Registry.Services.View.setStatusMessage(sheet, `HEADHUNTER | ${new Date().toLocaleString()}`);
    console.log(`Headhunter View Rendered: ${actualCount} candidates (Atomic).`);
  }
};

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = HeadhunterView;
}

(function(scope: any) {
  Object.assign(scope, { HeadhunterView });
})(typeof globalThis !== 'undefined' ? globalThis : this);

export default HeadhunterView;
