
/**
 * ============================================================================
 * 🌐 MODULE: CONTROLLER_WEBAPP (DATA LAYER)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Data generation and caching layer for the JSON REST API.
 *                 Provides fault-tolerant data extraction from Google Sheets.
 * ⚙️ STRATEGY: 
 *    1. String Transport Protocol: Returns JSON STRINGS for consistent handling.
 *    2. Structured Payloads: All data is sent as `{ success, data/error }`.
 *    3. Pre-Flight Checks: Verifies sheets exist before reading.
 *    4. Per-Row Sanitization: Skips corrupted rows instead of crashing.
 *    5. WYSIWYG Parsing: Uses getDisplayValues() for formatted text fields.
 * 🏷️ VERSION: 6.0.0
 * 
 * 🧠 REASONING:
 *    - doGet/doPost have been moved to API_Public.gs.js (the router)
 *    - This module now focuses purely on data generation and sheet operations
 *    - All functions here are called by the API router
 * ============================================================================
 */

const VER_CONTROLLER_WEBAPP = '6.0.0';

// ============================================================================
// 📦 DATA RETRIEVAL (Called by API_Public.gs.js)
// ============================================================================

/**
 * Public Endpoint for Client-Side Hydration.
 * Returns a JSON STRING (String Transport Protocol).
 * 
 * @param {boolean} forceRefresh - If true, ignores cache and reads from Sheet.
 * @returns {string} A JSON stringified response object.
 */
function getWebAppData(forceRefresh) {
  try {
    let payloadStr = null;

    if (!forceRefresh) {
      payloadStr = Utils.CacheHandler.getLarge(CONFIG.SYSTEM.JSON_STORE_KEY);
    }

    if (payloadStr) {
      console.log("🌐 API Request: Serving from cache.");
      return payloadStr; // Return string directly
    }

    // If Cache Miss OR Forced Refresh, regenerate
    console.log(forceRefresh ? "🌐 API Request: Force-refreshing payload from Sheets." : "🌐 API Request: Cache miss. Generating fresh payload.");

    // refreshWebPayload now returns a String
    return refreshWebPayload();

  } catch (e) {
    console.error(`getWebAppData CRITICAL FAILURE: ${e.stack}`);
    // Return a valid JSON string even on failure
    return JSON.stringify({
      success: false,
      data: null,
      error: {
        code: 'GET_APP_DATA_FAILED',
        message: `The server encountered a critical error: ${e.message}`
      }
    });
  }
}

// ============================================================================
// ✏️ WRITE OPERATIONS
// ============================================================================

/**
 * Handles "Discarding" a recruit (Marking as Invited).
 * @deprecated Use markRecruitsAsInvitedBulk for better performance.
 * @param {string} id - The player tag (without #)
 */
function markRecruitAsInvited(id) {
  return markRecruitsAsInvitedBulk([id]);
}

/**
 * ⚡ BULK ACTION OPTIMIZATION (v5.0.0)
 * Handles "Discarding" multiple recruits in a single execution.
 * 
 * REASONING:
 * - Previous method called `markRecruitAsInvited` in a client-side loop.
 * - This created N network requests for N recruits (e.g., 20 requests).
 * - This function reads the sheet ONCE, updates memory, and writes ONCE.
 * 
 * @param {Array<string>} ids - Array of player tags (without #)
 * @returns {Object} Result object with success status
 */
function markRecruitsAsInvitedBulk(ids) {
  if (!ids || !Array.isArray(ids) || ids.length === 0) return { success: true };

  console.time('BulkDismiss');
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(CONFIG.SHEETS.HH);
    if (!sheet) return { success: false, message: "Headhunter sheet not found." };

    const lastRow = sheet.getLastRow();
    if (lastRow < CONFIG.LAYOUT.DATA_START_ROW) return { success: true };

    const startRow = CONFIG.LAYOUT.DATA_START_ROW;
    const numRows = lastRow - startRow + 1;

    // 1. Read Tags and Invited Status columns
    const tagColIdx = 2 + CONFIG.SCHEMA.HH.TAG;
    const invitedColIdx = 2 + CONFIG.SCHEMA.HH.INVITED;

    const tagValues = sheet.getRange(startRow, tagColIdx, numRows, 1).getValues();
    const invitedRange = sheet.getRange(startRow, invitedColIdx, numRows, 1);
    const invitedValues = invitedRange.getValues();

    // 2. Map Tags to Array Indices
    const tagMap = new Map();
    tagValues.forEach((row, idx) => {
      if (row[0]) tagMap.set(row[0].toString(), idx);
    });

    // 3. Update Memory
    let updatesCount = 0;
    const idsSet = new Set(ids.map(id => '#' + id));

    idsSet.forEach(tag => {
      if (tagMap.has(tag)) {
        const idx = tagMap.get(tag);
        invitedValues[idx][0] = true;
        updatesCount++;
      }
    });

    // 4. Single Batch Write
    if (updatesCount > 0) {
      invitedRange.setValues(invitedValues);
      console.log(`🌐 API Action: Bulk dismissed ${updatesCount} recruits.`);
    }

    console.timeEnd('BulkDismiss');
    return { success: true, count: updatesCount };

  } catch (e) {
    console.error(`Bulk Dismiss Error: ${e.message}`);
    return { success: false, message: e.message };
  }
}

// ============================================================================
// 🔄 CACHE MANAGEMENT
// ============================================================================

/**
 * Regenerates the JSON payload from the Google Sheets.
 * Stores it in cache and returns the JSON STRING.
 * 
 * @returns {string} JSON string with payload
 */
function refreshWebPayload() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    const data = {
      lb: extractSheetData(ss, CONFIG.SHEETS.LB, CONFIG.SCHEMA.LB, false),
      hh: extractSheetData(ss, CONFIG.SHEETS.HH, CONFIG.SCHEMA.HH, true),
      timestamp: new Date().getTime()
    };

    const payload = { success: true, data: data, error: null };
    const payloadStr = JSON.stringify(payload);

    // Store the STRING in cache
    Utils.CacheHandler.putLarge(CONFIG.SYSTEM.JSON_STORE_KEY, payloadStr, 21600);
    console.log(`🚀 Web Payload Generated (${Math.round(payloadStr.length / 1024)} KB)`);

    return payloadStr; // Return STRING

  } catch (e) {
    console.error(`refreshWebPayload FAILED: ${e.stack}`);
    return JSON.stringify({
      success: false,
      data: null,
      error: {
        code: 'PAYLOAD_GENERATION_FAILED',
        message: `Failed to generate data from Sheets: ${e.message}`
      }
    });
  }
}

// ============================================================================
// 📊 DATA EXTRACTION
// ============================================================================

/**
 * Robust data extraction logic with pre-flight checks and per-row sanitization.
 * 
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {string} sheetName - Name of sheet to extract from
 * @param {Object} SCHEMA - Column mapping schema
 * @param {boolean} isHeadhunter - Whether this is the Headhunter sheet
 * @returns {Array} Extracted and sanitized data rows
 */
function extractSheetData(ss, sheetName, SCHEMA, isHeadhunter) {
  // 1. PRE-FLIGHT CHECK: Sheet Existence
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    console.warn(`Data Extraction Warning: Sheet "${sheetName}" not found.`);
    return []; // Return empty array, not an error, as it's a valid state.
  }

  const lastRow = sheet.getLastRow();
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;

  // 2. PRE-FLIGHT CHECK: Content Existence
  if (lastRow < startRow) {
    return []; // Sheet exists but is empty.
  }

  const range = sheet.getRange(startRow, 2, lastRow - startRow + 1, 20);

  // 🛠️ DUAL FETCH STRATEGY
  // REASONING: 
  // - getValues() returns raw data (Numbers, Dates), perfect for sorting and math.
  // - getDisplayValues() returns the String EXACTLY as shown in the sheet (e.g., "90%").
  // We use values for math-heavy columns (Score/Trophies) and displayValues for formatted text (War Rate).
  const vals = range.getValues();
  const displayVals = range.getDisplayValues();

  const sanitizeNum = (v) => {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  };
  const sanitizeStr = (v) => (v === null || v === undefined) ? '' : String(v).trim();

  return vals.map((r, index) => {
    try {
      const tagRaw = r[SCHEMA.TAG];
      if (!tagRaw || typeof tagRaw !== 'string' || !tagRaw.startsWith('#')) return null;

      const id = tagRaw.replace('#', '').trim();
      // Safety: Ensure ID is valid length
      if (id.length < 3) return null;

      const name = sanitizeStr(r[SCHEMA.NAME]).replace(/^=HYPERLINK.*"(.*)".*$/, '$1');
      const trophies = sanitizeNum(r[SCHEMA.TROPHIES]);
      const score = sanitizeNum(r[SCHEMA.PERF_SCORE]);

      let details = {};

      if (isHeadhunter) {
        if (r[SCHEMA.INVITED] === true) return null;
        const fd = r[SCHEMA.FOUND_DATE];
        details = {
          don: sanitizeNum(r[SCHEMA.DONATIONS]),
          war: sanitizeNum(r[SCHEMA.WAR_WINS]),
          ago: (fd instanceof Date && !isNaN(fd.getTime())) ? fd.toISOString() : ''
        };
      } else {
        let role = sanitizeStr(r[SCHEMA.ROLE] || 'Member');
        if (role === 'coLeader') role = 'Co-Leader';

        // 🛠️ WAR RATE FIX (Final - v9.0.2)
        // Strategy: Trust the Eye.
        // We use the Display Value (what the user sees) as the primary source of truth.
        // If the sheet says "90%", we send "90%".

        let rateDisplay = '0%';
        const visualRate = displayVals[index][SCHEMA.WAR_RATE]; // From getDisplayValues()
        const rawRate = r[SCHEMA.WAR_RATE]; // From getValues()

        if (visualRate && visualRate.includes('%')) {
          // Case 1: Sheet is formatted as %, e.g., "90%". We take it literally.
          rateDisplay = visualRate.trim();
        }
        else {
          // Case 2: Sheet is formatted as Number (e.g., 0.9 or 90).
          // We fall back to math.
          let val = parseFloat(String(rawRate));
          if (!isNaN(val)) {
            // Heuristic: If <= 1.0, it's a decimal percentage (0.9 -> 90%).
            // We use 1.0 (100%) as the cutoff.
            if (val <= 1.0) {
              val = val * 100;
            }
            rateDisplay = `${Math.round(val)}%`;
          }
        }

        details = {
          role: role,
          days: sanitizeNum(r[SCHEMA.DAYS]),
          avg: sanitizeNum(r[SCHEMA.AVG_DAY]),
          seen: sanitizeStr(r[SCHEMA.LAST_SEEN] || '-'),
          rate: rateDisplay,
          hist: sanitizeStr(r[SCHEMA.HISTORY])
        };
      }

      return { id, n: name, t: trophies, s: score, d: details };
    } catch (err) {
      console.warn(`Row extraction error in ${sheetName} at row ${startRow + index}: ${err.message}. Skipping.`);
      return null;
    }
  }).filter(Boolean);
}
