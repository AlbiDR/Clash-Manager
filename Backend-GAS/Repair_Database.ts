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
import type { IRegistry } from "./Registry";

// Global Version Constant
// @ts-ignore
const VER_REPAIR_DB = "1.1.0"; // Flexible Precision Mode

declare var CONFIG: any;
declare var Registry: IRegistry;
declare var Logger: any;
declare var SpreadsheetApp: any;
declare var getWarSnapshot: any;

/**
 * 🛠️ MAIN REPAIR FUNCTION
 */
function repairDatabase(startDate?: Date): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const dbSheet = ss.getSheetByName(CONFIG.SHEETS.DB);

  if (!dbSheet) {
    Logger.log("❌ Error: DB Sheet not found.");
    return;
  }

  Logger.log("🛠️ Starting Dynamic Database Repair Sequence...");

  // 1. Resolve Schema Indices & Live Grounding
  Registry.Services.Schema.bootDynamicSchema();
  const H = CONFIG.SCHEMA.DB;

  let liveSnap: any = null;
  try {
    liveSnap = typeof getWarSnapshot === "function" ? getWarSnapshot() : null;
    if (liveSnap) {
      Logger.log(`🌍 Dynamic Grounding Enabled: Phase is ${liveSnap.protocol.phase}`);
    }
  } catch (e) {
    Logger.log("⚠️ Grounding failed: Snap skipped.");
  }

  const lastRow = dbSheet.getLastRow();
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;

  if (lastRow < startRow) {
    Logger.log("⚠️ Database is empty. Nothing to repair.");
    return;
  }

  const numRows = lastRow - startRow + 1;
  const range = dbSheet.getRange(startRow, 1, numRows, 20); // Read wide to get all cols
  const data = range.getValues();

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
    
    // Optimization: Skip old rows if startDate provided
    if (startDate && dateObj < startDate) continue;

    scannedCount++;

    // 🔬 DYNAMIC HEURISTIC CHECK (Uses snapshot grounding)
    // We use forceCalendarDay: true because for repairs, "Monday" means "Training"
    // regardless of the exact midnight UTC game reset crossover.
    const phaseInfo = Registry.Services.Time.getWarPhaseFromDate(dateObj, liveSnap, { forceCalendarDay: true });

    // 🎯 TARGET: Training Days with Numeric Fame (0 or otherwise) that isn't already N/A
    if (phaseInfo.isTraining) {
      const isAlreadyNA = String(rawFame).trim().toUpperCase() === "N/A";

      if (!isAlreadyNA) {
        // 1-based indices for writing back
        const cellRow = startRow + i;
        const cellCol = H.WAR_FAME + 1;

        // Log the change
        Logger.log(
          `[FIX] Row ${cellRow} (${dateObj.toISOString().slice(0, 10)}): Logic=${
            phaseInfo.phase
          } | Val '${rawFame}' -> 'N/A'`,
        );

        // Apply Fix
        dbSheet.getRange(cellRow, cellCol).setValue("N/A");
        modifiedCount++;
      }
    }
  }

  Logger.log(
    `✅ Repair Complete. Scanned: ${scannedCount} | Fixed: ${modifiedCount}`,
  );
  SpreadsheetApp.flush();
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, { repairDatabase, VER_REPAIR_DB });
