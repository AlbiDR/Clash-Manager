/**
 * ============================================================================
 * 🌐 MODULE: CONTROLLER_WEBAPP (DATA LAYER)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Data generation and caching layer for the JSON REST API.
 *                 Provides fault-tolerant data extraction from Google Sheets.
 * ⚙️ STRATEGY: 
 *    1. String Transport Protocol: Returns JSON STRINGS for consistent handling.
 *    2. Payload Compression: Returns "Matrix" (Array of Arrays) to reduce size.
 *    3. Pre-Flight Checks: Verifies sheets exist before reading.
 *    4. Per-Row Sanitization: Skips corrupted rows instead of crashing.
 * 🏷️ VERSION: 6.1.0
 * ============================================================================
 */

const VER_CONTROLLER_WEBAPP = '6.1.0';

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
 * ⚡ BULK ACTION OPTIMIZATION (v5.0.0)
 * Handles "Discarding" multiple recruits in a single execution.
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
 * 📦 COMPRESSION UPDATE:
 * Returns data in 'matrix' format (Array of Arrays) instead of objects
 * to reduce JSON payload size by ~40%.
 * 
 * @returns {string} JSON string with payload
 */
function refreshWebPayload() {
  // 🛡️ RACE CONDITION PREVENTION: Wrap logic in Mutex Lock
  return Utils.executeSafely('PAYLOAD_GEN', () => {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();

      const data = {
        // Schema version helps frontend know how to hydrate the matrix
        format: 'matrix',
        schema: {
          lb: ['id', 'n', 't', 's', 'role', 'days', 'avg', 'seen', 'rate', 'hist'],
          hh: ['id', 'n', 't', 's', 'don', 'war', 'ago', 'cards']
        },
        lb: extractSheetDataMatrix(ss, CONFIG.SHEETS.LB, CONFIG.SCHEMA.LB, false),
        hh: extractSheetDataMatrix(ss, CONFIG.SHEETS.HH, CONFIG.SCHEMA.HH, true),
        timestamp: new Date().getTime()
      };

      const payload = { success: true, data: data, error: null };
      const payloadStr = JSON.stringify(payload);

      // Store the STRING in cache
      Utils.CacheHandler.putLarge(CONFIG.SYSTEM.JSON_STORE_KEY, payloadStr, 21600);
      
      // 🧠 SMART SYNC METADATA
      Utils.Props.set('LAST_PAYLOAD_TIMESTAMP', data.timestamp);
      
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
  });
}

// ============================================================================
// 📊 DATA EXTRACTION (MATRIX MODE)
// ============================================================================

/**
 * Robust data extraction returning a compressed Matrix (Array of Arrays).
 * 
 * @param {Spreadsheet} ss - Active spreadsheet
 * @param {string} sheetName - Name of sheet to extract from
 * @param {Object} SCHEMA - Column mapping schema
 * @param {boolean} isHeadhunter - Whether this is the Headhunter sheet
 * @returns {Array<Array>} Extracted data rows
 */
function extractSheetDataMatrix(ss, sheetName, SCHEMA, isHeadhunter) {
  // 1. PRE-FLIGHT CHECK: Sheet Existence
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    console.warn(`Data Extraction Warning: Sheet "${sheetName}" not found.`);
    return []; 
  }

  const lastRow = sheet.getLastRow();
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;

  // 2. PRE-FLIGHT CHECK: Content Existence
  if (lastRow < startRow) {
    return []; 
  }

  const range = sheet.getRange(startRow, 2, lastRow - startRow + 1, 20);

  // 🛠️ DUAL FETCH STRATEGY
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
      if (id.length < 3) return null;

      const name = sanitizeStr(r[SCHEMA.NAME]).replace(/^=HYPERLINK.*"(.*)".*$/, '$1');
      const trophies = sanitizeNum(r[SCHEMA.TROPHIES]);
      const score = sanitizeNum(r[SCHEMA.PERF_SCORE]);

      if (isHeadhunter) {
        // HEADHUNTER MATRIX: [id, n, t, s, don, war, ago, cards]
        if (r[SCHEMA.INVITED] === true) return null;
        
        const fd = r[SCHEMA.FOUND_DATE];
        const ago = (fd instanceof Date && !isNaN(fd.getTime())) ? fd.toISOString() : '';
        const don = sanitizeNum(r[SCHEMA.DONATIONS]);
        const war = sanitizeNum(r[SCHEMA.WAR_WINS]);
        const cards = sanitizeNum(r[SCHEMA.CARDS]); // Maps to cards won

        return [id, name, trophies, score, don, war, ago, cards];

      } else {
        // LEADERBOARD MATRIX: [id, n, t, s, role, days, avg, seen, rate, hist]
        let role = sanitizeStr(r[SCHEMA.ROLE] || 'Member');
        if (role === 'coLeader') role = 'Co-Leader';

        // War Rate Display Fix
        let rateDisplay = '0%';
        const visualRate = displayVals[index][SCHEMA.WAR_RATE];
        const rawRate = r[SCHEMA.WAR_RATE];

        if (visualRate && visualRate.includes('%')) {
          rateDisplay = visualRate.trim();
        } else {
          let val = parseFloat(String(rawRate));
          if (!isNaN(val)) {
            if (val <= 1.0) val = val * 100;
            rateDisplay = `${Math.round(val)}%`;
          }
        }

        const days = sanitizeNum(r[SCHEMA.DAYS]);
        const avg = sanitizeNum(r[SCHEMA.AVG_DAY]);
        const seen = sanitizeStr(r[SCHEMA.LAST_SEEN] || '-');
        const hist = sanitizeStr(r[SCHEMA.HISTORY]);

        return [id, name, trophies, score, role, days, avg, seen, rateDisplay, hist];
      }

    } catch (err) {
      console.warn(`Row extraction error in ${sheetName} at row ${startRow + index}: ${err.message}. Skipping.`);
      return null;
    }
  }).filter(Boolean);
}
