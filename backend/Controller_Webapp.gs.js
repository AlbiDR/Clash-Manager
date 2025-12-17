
/**
 * ============================================================================
 * 🌐 MODULE: CONTROLLER_WEBAPP (DATA LAYER)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Data generation and caching layer for the JSON REST API.
 * 🏷️ VERSION: 6.1.2
 * ============================================================================
 */

const VER_CONTROLLER_WEBAPP = '6.1.2';

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

    console.log(forceRefresh ? "🌐 API Request: Force-refreshing payload." : "🌐 API Request: Cache miss.");
    return refreshWebPayload();

  } catch (e) {
    console.error(`getWebAppData CRITICAL FAILURE: ${e.stack}`);
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

    const tagColIdx = 2 + CONFIG.SCHEMA.HH.TAG;
    const invitedColIdx = 2 + CONFIG.SCHEMA.HH.INVITED;

    const tagValues = sheet.getRange(startRow, tagColIdx, numRows, 1).getValues();
    const invitedRange = sheet.getRange(startRow, invitedColIdx, numRows, 1);
    const invitedValues = invitedRange.getValues();

    const tagMap = new Map();
    tagValues.forEach((row, idx) => {
      if (row[0]) tagMap.set(row[0].toString(), idx);
    });

    let updatesCount = 0;
    const idsSet = new Set(ids.map(id => '#' + id));

    idsSet.forEach(tag => {
      if (tagMap.has(tag)) {
        const idx = tagMap.get(tag);
        invitedValues[idx][0] = true;
        updatesCount++;
      }
    });

    if (updatesCount > 0) {
      invitedRange.setValues(invitedValues);
      console.log(`🌐 API Action: Bulk dismissed ${updatesCount} recruits.`);
      
      // 🔄 FORCE SYNC: Regenerate cache so subsequent reads reflect the dismissal
      console.log("🌐 API Action: Refreshing read cache...");
      refreshWebPayload();
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

function refreshWebPayload() {
  return Utils.executeSafely('PAYLOAD_GEN', () => {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();

      const data = {
        format: 'matrix',
        schema: {
          // 'dt' = Delta Trend (Raw Score Change), 'r' = Raw Score
          lb: ['id', 'n', 't', 's', 'role', 'days', 'avg', 'seen', 'rate', 'hist', 'dt', 'r'],
          hh: ['id', 'n', 't', 's', 'don', 'war', 'ago', 'cards']
        },
        lb: extractSheetDataMatrix(ss, CONFIG.SHEETS.LB, CONFIG.SCHEMA.LB, false),
        hh: extractSheetDataMatrix(ss, CONFIG.SHEETS.HH, CONFIG.SCHEMA.HH, true),
        timestamp: new Date().getTime()
      };

      const payload = { success: true, data: data, error: null };
      const payloadStr = JSON.stringify(payload);

      Utils.CacheHandler.putLarge(CONFIG.SYSTEM.JSON_STORE_KEY, payloadStr, 21600);
      Utils.Props.set('LAST_PAYLOAD_TIMESTAMP', data.timestamp);
      
      console.log(`🚀 Web Payload Generated (${Math.round(payloadStr.length / 1024)} KB)`);

      return payloadStr;

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

function extractSheetDataMatrix(ss, sheetName, SCHEMA, isHeadhunter) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;

  if (lastRow < startRow) return [];

  const range = sheet.getRange(startRow, 2, lastRow - startRow + 1, 20);
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
        // 🛡️ ROBUST CHECK: Filter out invited (Checked) recruits
        // Handles boolean true, string 'TRUE', 'true', etc.
        const invitedVal = r[SCHEMA.INVITED];
        const isInvited = invitedVal === true || String(invitedVal).toUpperCase() === 'TRUE';
        
        if (isInvited) return null;
        
        const fd = r[SCHEMA.FOUND_DATE];
        const ago = (fd instanceof Date && !isNaN(fd.getTime())) ? fd.toISOString() : '';
        const don = sanitizeNum(r[SCHEMA.DONATIONS]);
        const war = sanitizeNum(r[SCHEMA.WAR_WINS]);
        const cards = sanitizeNum(r[SCHEMA.CARDS]); 

        return [id, name, trophies, score, don, war, ago, cards];

      } else {
        // LEADERBOARD
        let role = sanitizeStr(r[SCHEMA.ROLE] || 'Member');
        if (role === 'coLeader') role = 'Co-Leader';

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
        const trend = sanitizeNum(r[SCHEMA.TREND]); // Raw Score Delta
        const raw = sanitizeNum(r[SCHEMA.RAW_SCORE]); // Raw Score Total

        return [id, name, trophies, score, role, days, avg, seen, rateDisplay, hist, trend, raw];
      }

    } catch (err) {
      console.warn(`Row extraction error in ${sheetName}: ${err.message}`);
      return null;
    }
  }).filter(Boolean);
}

