/**
 * ============================================================================
 * 🌐 MODULE: CONTROLLER_WEBAPP (DATA LAYER)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Data generation and caching layer for the JSON REST API.
 * 🏷️ VERSION: 10.0.6
 * ============================================================================
 */

const VER_CONTROLLER_WEBAPP = "10.0.6";

// ============================================================================
// 📦 DATA RETRIEVAL (Called by API_Public.gs.js)
// ============================================================================

function getWebAppData(forceRefresh) {
  try {
    let payloadStr = null;

    if (!forceRefresh) {
      payloadStr = Utils.CacheHandler.getLarge(CONFIG.SYSTEM.JSON_STORE_KEY);
    }

    if (payloadStr) {
      console.log("🌐 API Request: Serving from cache.");
      return payloadStr;
    }

    console.log(
      forceRefresh
        ? "🌐 API Request: Force-refreshing payload."
        : "🌐 API Request: Cache miss.",
    );
    return refreshWebPayload();
  } catch (e) {
    console.error(`getWebAppData CRITICAL FAILURE: ${e.stack}`);
    return JSON.stringify({
      success: false,
      data: null,
      error: {
        code: "GET_APP_DATA_FAILED",
        message: `The server encountered a critical error: ${e.message}`,
      },
    });
  }
}

// ============================================================================
// ✏️ WRITE OPERATIONS
// ============================================================================

function markRecruitsAsInvitedBulk(ids) {
  if (!ids || !Array.isArray(ids) || ids.length === 0) return { success: true };

  // 🔒 STRUCTURAL FIX: MUTEX LOCKING
  return Utils.executeSafely("WRITE_HH", () => {
    console.time("BulkDismiss");
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      
      // 1. DATABASE WRITE (Primary Source of Truth)
      // We write directly to the Blacklist/History sheet.
      let blSheet = ss.getSheetByName(CONFIG.SHEETS.BL);
      if (!blSheet) blSheet = ss.insertSheet(CONFIG.SHEETS.BL);

      const now = Date.now();
      const expiryDuration = (CONFIG.HEADHUNTER.BLACKLIST_DAYS || 30) * 86400000;
      const expiryDate = now + expiryDuration;
      
      // Create DB Entries: [Tag, ExpiryTimestamp, RawScore(0 placeholder)]
      // Note: We use 0 for RawScore as dismissed recruits shouldn't affect the high-end benchmark
      const dbEntries = ids.map(id => {
        const tag = id.startsWith("#") ? id : "#" + id;
        return [tag, expiryDate, 0]; 
      });

      // Append to DB
      if (dbEntries.length > 0) {
        const lastRow = Math.max(blSheet.getLastRow(), 1);
        blSheet.getRange(lastRow + 1, 1, dbEntries.length, 3).setValues(dbEntries);
        console.log(`🌐 DB Action: Added ${dbEntries.length} to Blacklist History.`);
      }

      // 2. SHEET CLEANUP (Visual Sync)
      // We remove the rows immediately so the spreadsheet reflects the "Dismissed" state.
      // This prevents the confusing "Ticked Box" state and ensures visual consistency.
      const sheet = ss.getSheetByName(CONFIG.SHEETS.HH);
      if (sheet) {
        Utils.bootDynamicSchema();
        const startRow = CONFIG.LAYOUT.DATA_START_ROW;
        const lastRowVisual = sheet.getLastRow();

        if (lastRowVisual >= startRow) {
          const numRows = lastRowVisual - startRow + 1;
          
          // ⚡ COLUMN RESOLUTION: Use 1-based index from Schema + 1 (A=1)
          const tagColIdx = 1 + CONFIG.SCHEMA.HH.TAG;

          const tagValues = sheet.getRange(startRow, tagColIdx, numRows, 1).getValues();
          const rowsToDelete = [];

          // Identify rows to delete
          // We map Tags to Absolute Row Indices
          const tagMap = new Map();
          for(let i=0; i<tagValues.length; i++) {
             const t = String(tagValues[i][0] || "");
             if(t) tagMap.set(t, startRow + i); 
          }

          ids.forEach(id => {
            const tag = id.startsWith("#") ? id : "#" + id;
            if (tagMap.has(tag)) {
               rowsToDelete.push(tagMap.get(tag));
            }
          });

          // Delete from bottom up to preserve indices of upper rows
          if (rowsToDelete.length > 0) {
            rowsToDelete.sort((a, b) => b - a);
            rowsToDelete.forEach(rowIdx => sheet.deleteRow(rowIdx));
            console.log(`🌐 Sheet Action: Deleted ${rowsToDelete.length} dismissed rows.`);
          }
        }
      }

      // 3. FLUSH & REFRESH
      SpreadsheetApp.flush();
      refreshWebPayload();

      console.timeEnd("BulkDismiss");
      return { success: true, count: ids.length };
    } catch (e) {
      console.error(`Bulk Dismiss Error: ${e.message}`);
      throw new Error(`Dismiss Failed: ${e.message}`);
    }
  });
}

// ============================================================================
// 🔄 CACHE MANAGEMENT
// ============================================================================

function refreshWebPayload() {
  return Utils.executeSafely("PAYLOAD_GEN", () => {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();

      // ⚡ SMART SYNC: Dynamically resolve column indices from headers
      Utils.bootDynamicSchema();

      // 1. EXTRACT DATA & SCHEMA SIMULTANEOUSLY
      const lbResult = extractSheetDataStrict(ss, CONFIG.SHEETS.LB, "lb");
      const hhResult = extractSheetDataStrict(ss, CONFIG.SHEETS.HH, "hh");

      // ⚡ FILTER: Remove Blacklisted items from HH result immediately
      // This prevents "flickering" where a dismissed recruit might show up for 1 second before the blacklist syncs
      const blSheet = ss.getSheetByName(CONFIG.SHEETS.BL);
      const blacklist = new Set();
      if (blSheet) {
         const rawBL = blSheet.getDataRange().getValues();
         const now = Date.now();
         // Col 0 = Tag, Col 1 = Expiry
         rawBL.forEach(r => {
            if (r[1] > now) blacklist.add(String(r[0]));
         });
      }

      const filteredHH = hhResult.rows.filter(row => {
         // Assuming ID is index 0 in the output array (matches schema order)
         const id = "#" + row[0]; 
         return !blacklist.has(id);
      });

      const data = {
        format: "matrix",
        schema: {
          lb: lbResult.schema,
          hh: hhResult.schema,
        },
        lb: lbResult.rows,
        hh: filteredHH,
        playerTag: (CONFIG.SYSTEM.PLAYER_TAG || "").replace("#", "").trim(),
        timestamp: new Date().getTime(),
      };

      const payload = { success: true, data: data, error: null };
      const payloadStr = JSON.stringify(payload);

      Utils.CacheHandler.putLarge(
        CONFIG.SYSTEM.JSON_STORE_KEY,
        payloadStr,
        21600,
      );
      Utils.Props.set("LAST_PAYLOAD_TIMESTAMP", data.timestamp);

      console.log(
        `🚀 Web Payload Generated (${Math.round(payloadStr.length / 1024)} KB)`,
      );

      return payloadStr;
    } catch (e) {
      console.error(`refreshWebPayload FAILED: ${e.stack}`);
      return JSON.stringify({
        success: false,
        data: null,
        error: {
          code: "PAYLOAD_GENERATION_FAILED",
          message: `Failed to generate data from Sheets: ${e.message}`,
        },
      });
    }
  });
}

// ============================================================================
// 📊 DATA EXTRACTION (STRICT MODE)
// ============================================================================

/**
 * Robust Extractor that guarantees the output Matrix matches the generated Schema.
 */
function extractSheetDataStrict(ss, sheetName, type) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { schema: [], rows: [] };

  const lastRow = sheet.getLastRow();
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;
  if (lastRow < startRow) return { schema: [], rows: [] };

  // 1. DEFINE THE SOURCE OF TRUTH MAP
  // This array defines both the JSON Key and the Sheet Column Index.
  // Order here determines the order in the output array.
  let mapping = [];
  const S = type === "lb" ? CONFIG.SCHEMA.LB : CONFIG.SCHEMA.HH;

  if (type === "lb") {
    mapping = [
      { key: "id", col: S.TAG, type: "tag" },
      { key: "n", col: S.NAME, type: "str" },
      { key: "role", col: S.ROLE, type: "str" },
      { key: "t", col: S.TROPHIES, type: "num" },
      { key: "performanceScore", col: S.PERF_SCORE, type: "num" }, // 0-100
      { key: "performanceRawScore", col: S.RAW_SCORE, type: "num" }, // Unbounded
      { key: "days", col: S.DAYS, type: "num" },
      { key: "req", col: S.WEEKLY_REQ, type: "num" },
      { key: "avg", col: S.AVG_DAY, type: "num" },
      { key: "tot", col: S.TOTAL_DON, type: "num" },
      { key: "seen", col: S.LAST_SEEN, type: "str" },
      { key: "rate", col: S.WAR_RATE, type: "rate" },
      { key: "wfame", col: S.AVG_WAR_FAME, type: "num" },
      { key: "hist", col: S.HISTORY, type: "str" },
      { key: "dt", col: S.TREND, type: "num" },
      { key: "war", col: S.WAR_DAY_WINS, type: "num" },
    ];
  } else {
    mapping = [
      { key: "id", col: S.TAG, type: "tag" },
      { key: "n", col: S.NAME, type: "str" },
      { key: "t", col: S.TROPHIES, type: "num" },
      { key: "potentialScore", col: S.POTENTIAL_SCORE, type: "num" }, // 0-100
      { key: "potentialRawScore", col: S.RAW_SCORE, type: "num" }, // Unbounded
      { key: "don", col: S.DONATIONS, type: "num" },
      { key: "war", col: S.WAR_WINS, type: "num" },
      { key: "cards", col: S.CARDS, type: "num" },
      { key: "ago", col: S.FOUND_DATE, type: "date" },
      { key: "invited", col: S.INVITED, type: "bool_check" }, // Internal check
    ];
  }

  // 2. FETCH DATA
  // We fetch a wide range to ensure we cover all columns defined in CONFIG
  const maxColIdx = Math.max(...Object.values(S));
  const numCols = Math.max(20, maxColIdx + 1);
  const range = sheet.getRange(startRow, 1, lastRow - startRow + 1, numCols);
  const vals = range.getValues();
  const displayVals = range.getDisplayValues();

  // 3. TRANSFORM
  const rows = [];
  
  for (let i = 0; i < vals.length; i++) {
    const rowRaw = vals[i];
    const rowDisplay = displayVals[i];
    
    // Global filter: Must have a valid tag
    const tagRaw = rowRaw[S.TAG];
    if (!tagRaw || typeof tagRaw !== "string" || !tagRaw.startsWith("#")) continue;
    
    // Headhunter filter: Skip invited (Legacy check for safety)
    if (type === "hh") {
      const invitedVal = rowRaw[S.INVITED];
      const isInvited = invitedVal === true || String(invitedVal).toUpperCase() === "TRUE";
      if (isInvited) continue;
    }

    const outputRow = mapping.map(m => {
      // Don't include internal check columns in output
      if (m.type === "bool_check") return null;

      const val = rowRaw[m.col];
      const disp = rowDisplay[m.col];

      switch(m.type) {
        case "tag": 
          return String(val).replace("#", "").trim();
        case "num":
          return sanitizeNum(val, disp);
        case "rate":
          if (disp && disp.includes("%")) return disp.trim();
          let n = parseFloat(String(val));
          if (!isNaN(n) && n <= 1.0) return `${Math.round(n * 100)}%`;
          return `${Math.round(n)}%`;
        case "date":
          return val instanceof Date ? val.toISOString() : "";
        case "str":
        default:
          let s = val === null || val === undefined ? "" : String(val);
          // Strip formulas like =HYPERLINK
          if (s.startsWith("=")) {
             return s.replace(/^=HYPERLINK.*"(.*)".*$/, "$1");
          }
          return s.trim();
      }
    }).filter(v => v !== null); // Remove nulls from boolean checks

    rows.push(outputRow);
  }

  // 4. RETURN SYNCHRONIZED SCHEMA & DATA
  return {
    schema: mapping.filter(m => m.type !== "bool_check").map(m => m.key),
    rows: rows
  };
}

// Helper: Robust number parsing
function sanitizeNum(v, displayV) {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  let s = String(v).replace(/,/g, "").replace(/%/g, "").trim();
  let n = parseFloat(s);
  if (isNaN(n)) return 0;
  // Handle displayed percentages that might be stored as strings
  if (displayV && displayV.includes("%")) return n; 
  return n;
}
