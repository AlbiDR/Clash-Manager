/**
 * ============================================================================
 * 🛠️ UTILITY: DATABASE REPAIR
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Surgically repairs historical "Training Day" entries.
 * ⚙️ LOGIC: Uses Utils.getWarPhaseFromDate() to identify past Training Days.
 *    If a Training Day has Fame 0 or invalid data, it overwrites it with "N/A".
 *    Leaves "Battle Days" untouched.
 * 🏷️ VERSION: 1.0.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { AppUtils } from "./Utilities";

// Global Version Constant
// @ts-ignore
const VER_REPAIR_DB = "1.0.1"; // Bumped for Force-Refresh

declare var SpreadsheetApp: any;
declare var Logger: any;
declare var module: any;

// Global Declarations for GAS Environment
declare const CONFIG: AppConfig;
declare const Utils: AppUtils;

/**
 * 🛠️ MAIN REPAIR FUNCTION
 */
function repairDatabase(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbSheet = ss.getSheetByName(CONFIG.SHEETS.DB);

  if (!dbSheet) {
    Logger.log("❌ Error: DB Sheet not found.");
    return;
  }

  Logger.log("🛠️ Starting Database Repair Sequence...");

  // 1. Resolve Schema Indices
  Utils.bootDynamicSchema();
  const H = CONFIG.SCHEMA.DB;

  const lastRow = dbSheet.getLastRow();
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;
  
  if (lastRow < startRow) {
    Logger.log("⚠️ Database is empty. Nothing to repair.");
    return;
  }

  const numRows = lastRow - startRow + 1;
  const range = dbSheet.getRange(startRow, 1, numRows, 20); // Read wide to get all cols
  const data = range.getValues();
  const corrections: any[] = []; // Store updates to batch write if needed, or row-by-row
  
  let modifiedCount = 0;
  let scannedCount = 0;

  // 2. Iterate and Inspect
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const rawDate = row[H.DATE];
    const rawFame = row[H.WAR_FAME];
    
    // Skip if date is missing
    let dateObj = rawDate;
    if (typeof rawDate === "string") {
      dateObj = new Date(rawDate);
    }

    if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) {
      continue;
    }
    scannedCount++;

    // 🐛 DEBUG DATE for first 5 rows
    if (i < 5) {
      Logger.log(`[DEBUG] Row ${i}: RawDate='${rawDate}' Type=${typeof rawDate} Parsed=${dateObj}`);
    }

    // 🔬 HEURISTIC CHECK
    const phaseInfo = Utils.getWarPhaseFromDate(dateObj);

    // 🎯 TARGET: Training Days with Numeric Fame (0 or otherwise) that isn't already N/A
    if (phaseInfo.isTraining) {
      // If it's a number (likely 0) or empty, we want to set it to "N/A"
      // If it is already "N/A", we skip it.
      const isAlreadyNA = String(rawFame).trim().toUpperCase() === "N/A";
      const isSuspicious = !isAlreadyNA; // Any value on a training day that isn't N/A is suspicious

      if (isSuspicious) {
        // SURGICAL FIX: Overwrite with "N/A"
        // We write directly to the cell to allow for visual feedback/batching
        // For performance, we could batch, but for a repair script, safety > speed.
        // Let's modify the local array and write back patches.
        
        // 1-based Row Index = startRow + i
        // 1-based Col Index = H.WAR_FAME + 1
        const cellRow = startRow + i;
        const cellCol = H.WAR_FAME + 1;
        
        // Log the change
        Logger.log(`[FIX] Row ${cellRow} (${dateObj.toISOString().slice(0,10)}): Phase=${phaseInfo.phase} | Val '${rawFame}' -> 'N/A'`);
        
        // Apply Fix
        dbSheet.getRange(cellRow, cellCol).setValue("N/A");
        modifiedCount++;
      }
    }
  }

  Logger.log(`✅ Repair Complete. Scanned: ${scannedCount} | Fixed: ${modifiedCount}`);
  SpreadsheetApp.flush();
}

function diagnosticDump(): void {
  Utils.bootDynamicSchema();
  const H = CONFIG.SCHEMA.DB;
  Logger.log(`[DIAGNOSTIC] DB Sheet: ${CONFIG.SHEETS.DB}`);
  Logger.log(`[DIAGNOSTIC] Schema Indices: DATE=${H.DATE} | FAME=${H.WAR_FAME}`);
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(CONFIG.SHEETS.DB);
  if (!sheet) { Logger.log("❌ DB Sheet not found."); return; }
  
  const headers = sheet.getRange(2, 1, 1, 20).getValues()[0];
  Logger.log(`[DIAGNOSTIC] Row 2 Headers: ${JSON.stringify(headers)}`);
  
  const sample = sheet.getRange(3, 1, 1, 20).getValues()[0];
  Logger.log(`[DIAGNOSTIC] Row 3 Sample: ${JSON.stringify(sample)}`);
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, { repairDatabase, diagnosticDump, VER_REPAIR_DB });
