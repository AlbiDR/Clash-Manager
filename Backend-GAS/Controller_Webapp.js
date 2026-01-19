/**
 * ============================================================================
 * 🌐 MODULE: CONTROLLER_WEBAPP (DATA LAYER)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Data generation and caching layer for the JSON REST API.
 * 🏷️ VERSION: 10.0.2
 * ============================================================================
 */

const VER_CONTROLLER_WEBAPP = "10.0.2";

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
  // This ensures we never collide with a Scout Run (which clears/rewrites the sheet).
  return Utils.executeSafely("WRITE_HH", () => {
    console.time("BulkDismiss");
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.HH);
      if (!sheet)
        return { success: false, message: "Headhunter sheet not found." };

      const startRow = CONFIG.LAYOUT.DATA_START_ROW;
      const lastRow = sheet.getLastRow();

      const idsSet = new Set(ids.map((id) => "#" + id));
      let sheetUpdates = 0;

      // 1. UPDATE SHEET (Visual/Database)
      if (lastRow >= startRow) {
        const numRows = lastRow - startRow + 1;
        const tagColIdx = 2 + CONFIG.SCHEMA.HH.TAG;
        const invitedColIdx = 2 + CONFIG.SCHEMA.HH.INVITED;

        const tagValues = sheet
          .getRange(startRow, tagColIdx, numRows, 1)
          .getValues();
        const invitedRange = sheet.getRange(
          startRow,
          invitedColIdx,
          numRows,
          1,
        );
        const invitedValues = invitedRange.getValues();

        const tagMap = new Map(
          tagValues
            .map((row, idx) => (row[0] ? [row[0].toString(), idx] : null))
            .filter(Boolean),
        );

        idsSet.forEach((tag) => {
          const idx = tagMap.get(tag);
          if (idx !== undefined) {
            invitedValues[idx][0] = true;
            sheetUpdates++;
          }
        });

        if (sheetUpdates > 0) {
          invitedRange.setValues(invitedValues);
        }
      }

      // 2. FLUSH & FORCE REFRESH
      if (sheetUpdates > 0) {
        SpreadsheetApp.flush();
        console.log(`🌐 API Action: Dismissed ${sheetUpdates} candidates.`);
        refreshWebPayload();
      }

      console.timeEnd("BulkDismiss");
      return { success: true, count: sheetUpdates };
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
      // We no longer manually type the schema array. It comes from the same map used to read the data.
      const lbResult = extractSheetDataStrict(ss, CONFIG.SHEETS.LB, "lb");
      const hhResult = extractSheetDataStrict(ss, CONFIG.SHEETS.HH, "hh");

      const data = {
        format: "matrix",
        schema: {
          lb: lbResult.schema,
          hh: hhResult.schema,
        },
        lb: lbResult.rows,
        hh: hhResult.rows,
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
    
    // Headhunter filter: Skip invited
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
