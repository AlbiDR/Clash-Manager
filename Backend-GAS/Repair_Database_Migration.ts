/**
 * ============================================================================
 * 🛠️ MODULE: REPAIR - DATE MIGRATION
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: One-time script to convert text-based dates to Native Dates.
 * ⚙️ SCOPE: Clan Database, Leaderboard, Headhunter.
 * 🏷️ VERSION: 1.0.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { IRegistry } from "./Registry";

declare var SpreadsheetApp: any;
declare var Sheets: any;
declare const CONFIG: AppConfig;
declare const Registry: IRegistry;

/**
 * ⚡ RUN ONCE: migrationSystemDates
 * Corrects all historical date columns to use Native Date objects and proper formatting.
 */
function migrateSystemDates(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ssId = ss.getId();
  
  // 1. CLAN DATABASE MIGRATION
  processSheetMigration(ss.getSheetByName(CONFIG.SHEETS.DB), [
    { key: "DATE", column: CONFIG.SCHEMA.DB.DATE, format: "ddd dd/mm/yyyy" },
    { key: "LAST_SEEN", column: CONFIG.SCHEMA.DB.LAST_SEEN, format: "dd/mm/yyyy HH:mm" }
  ]);

  // 2. LEADERBOARD MIGRATION
  processSheetMigration(ss.getSheetByName(CONFIG.SHEETS.LB), [
    { key: "LAST_SEEN", column: CONFIG.SCHEMA.LB.LAST_SEEN, format: "dd/mm/yyyy HH:mm" }
  ]);

  // 3. HEADHUNTER MIGRATION
  processSheetMigration(ss.getSheetByName(CONFIG.SHEETS.HH), [
    { key: "FOUND_DATE", column: CONFIG.SCHEMA.HH.FOUND_DATE, format: "dd/mm/yyyy HH:mm" }
  ]);

  console.log("✅ SYSTEM MIGRATION COMPLETE: All dates standardized.");
}

/**
 * Helper to process a sheet's columns for date conversion and formatting.
 */
function processSheetMigration(
  sheet: GoogleAppsScript.Spreadsheet.Sheet | null, 
  configs: Array<{ key: string, column: number, format: string }>
): void {
  if (!sheet) return;
  
  const ssId = sheet.getParent().getId();
  const sheetId = sheet.getSheetId();
  const sheetName = sheet.getName();
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;
  
  // Get current metadata
  const meta = Sheets.Spreadsheets!.get(ssId, { ranges: [sheetName], includeGridData: false });
  const rowCount = meta.sheets[0].properties.gridProperties.rowCount;
  
  if (rowCount < startRow) return;
  const numRows = rowCount - startRow + 1;

  console.log(`🛠️ Migrating '${sheetName}': ${numRows} rows...`);

  configs.forEach(cfg => {
    // 1. FETCH DATA
    const colLetter = String.fromCharCode(65 + 1 + cfg.column); // Column B is index 0 in data block, so cfg.column is offset
    const rangeStr = `'${sheetName}'!${colLetter}${startRow}:${colLetter}${rowCount}`;
    const response = Sheets.Spreadsheets!.Values!.get(ssId, rangeStr);
    const values = response.values || [];

    // 2. CONVERT STRINGS TO DATES
    const correctedValues = values.map((row: any[]) => {
      let val = row && row[0];
      if (!val) return [null];
      
      // If already a Date object
      if (val instanceof Date) return [val];
      
      let d: Date;
      val = String(val).trim();

      // CASE A: RoyaleAPI Iso-Compact (20260115T143015)
      if (val.match(/^\d{8}T\d{6}/)) {
          d = new Date(val.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2}).*/, "$1-$2-$3T$4:$5:$6Z"));
      
      // CASE B: Legacy Java/GAS toString() (Thu Jan 15 01:00:00 GMT+01:00 2026)
      // We move the year (at the end) to be after the Month/Day
      } else if (val.match(/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2} \d{2}:\d{2}:\d{2} GMT[+-]\d{2}:\d{2} \d{4}$/)) {
          const parts = val.split(" ");
          // parts: [Thu, Jan, 15, 01:00:00, GMT+01:00, 2026]
          // Reassemble to: Thu Jan 15 2026 01:00:00 GMT+01:00
          if (parts.length === 6) {
             const reordered = `${parts[0]} ${parts[1]} ${parts[2]} ${parts[5]} ${parts[3]} ${parts[4]}`;
             d = new Date(reordered);
          } else {
             d = new Date(val); // Fallback
          }

      // CASE C: Standard JS/ISO
      } else {
          d = new Date(val);
      }

      return isNaN(d.getTime()) ? [val] : [d]; // Return original if parse failed
    });

    // 3. WRITE BACK CORRECTED VALUES
    if (correctedValues.length > 0) {
        Sheets.Spreadsheets!.Values!.update({
            values: correctedValues
        }, ssId, rangeStr, { valueInputOption: "USER_ENTERED" });
    }

    // 4. APPLY VISUAL FORMATTING (Advanced API)
    Sheets.Spreadsheets!.batchUpdate({
      requests: [{
        repeatCell: {
          range: { 
              sheetId, 
              startRowIndex: startRow - 1, 
              endRowIndex: rowCount, 
              startColumnIndex: 1 + cfg.column, 
              endColumnIndex: 2 + cfg.column 
          },
          cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: cfg.format } } },
          fields: "userEnteredFormat.numberFormat"
        }
      }]
    }, ssId);
  });
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, { migrateSystemDates });
