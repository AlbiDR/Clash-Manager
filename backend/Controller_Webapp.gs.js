
/**
 * ============================================================================
 * 🌐 MODULE: CONTROLLER_WEBAPP (DATA LAYER)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Data generation and caching layer for the JSON REST API.
 * 🏷️ VERSION: 6.2.1
 * ============================================================================
 */

const VER_CONTROLLER_WEBAPP = '6.2.1';

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

  // 🔒 STRUCTURAL FIX: MUTEX LOCKING
  // This ensures we never collide with a Scout Run (which clears/rewrites the sheet).
  // "WRITE_HH" effectively serializes this operation with "TASK_HH" via script lock.
  return Utils.executeSafely('WRITE_HH', () => {
    console.time('BulkDismiss');
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const sheet = ss.getSheetByName(CONFIG.SHEETS.HH);
      if (!sheet) return { success: false, message: "Headhunter sheet not found." };

      const startRow = CONFIG.LAYOUT.DATA_START_ROW;
      const lastRow = sheet.getLastRow();
      
      // Prep Tag Set (Client sends ID without #, System uses #)
      const idsSet = new Set(ids.map(id => '#' + id));
      let sheetUpdates = 0;

      // 1. UPDATE SHEET (Visual/Database)
      if (lastRow >= startRow) {
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

        idsSet.forEach(tag => {
          if (tagMap.has(tag)) {
            const idx = tagMap.get(tag);
            // 🚨 Explicitly set to TRUE to match filter logic
            invitedValues[idx][0] = true; 
            sheetUpdates++;
          }
        });

        if (sheetUpdates > 0) {
          invitedRange.setValues(invitedValues);
        }
      }

      // 2. UPDATE PERSISTENT BLACKLIST (Structural/Memory)
      // This ensures that even if the sheet is wiped/re-scanned, these IDs remain banned.
      let blUpdates = 0;
      try {
          const PROP_KEY = 'HH_BLACKLIST';
          const blacklist = Utils.Props.getChunked(PROP_KEY, {});
          const now = Date.now();
          const dayMs = 24 * 60 * 60 * 1000;
          const expiry = now + (CONFIG.HEADHUNTER.BLACKLIST_DAYS || 14) * dayMs;
          
          idsSet.forEach(tag => {
              // Preserve existing score data if present, otherwise default to 0
              // This is critical to maintain the dynamic benchmark
              const existing = blacklist[tag];
              if (!existing) blUpdates++;
              
              blacklist[tag] = { 
                e: expiry, 
                s: existing ? existing.s : 0 
              };
          });
          
          // Save back to properties
          Utils.Props.setChunked(PROP_KEY, blacklist);
      } catch (blErr) {
          console.warn("⚠️ Blacklist sync warning: " + blErr.message);
      }

      // 3. FLUSH & REGENERATE
      if (sheetUpdates > 0 || idsSet.size > 0) {
        SpreadsheetApp.flush();
        console.log(`🌐 API Action: Dismissed ${sheetUpdates} rows. Synced ${idsSet.size} to blacklist.`);
        
        // 🔄 SYNC CACHE: Immediately regenerate the cached JSON
        refreshWebPayload();
      }

      console.timeEnd('BulkDismiss');
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
  return Utils.executeSafely('PAYLOAD_GEN', () => {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();

      const data = {
        format: 'matrix',
        schema: {
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

  // Reading a generous range to ensure we don't miss columns
  const range = sheet.getRange(startRow, 2, lastRow - startRow + 1, 15);
  const vals = range.getValues();
  const displayVals = range.getDisplayValues();

  // 🕵️‍♀️ PRE-FETCH BLACKLIST (Passive Hiding Enforcement)
  // We double-check the persistent blacklist properties. 
  // Even if the sheet "Invited" column isn't updated (rare race condition),
  // we MUST NOT return blacklisted recruits to the client.
  const blacklistSet = new Set();
  if (isHeadhunter) {
    try {
        const raw = Utils.Props.getChunked('HH_BLACKLIST', {});
        const now = Date.now();
        // Only consider active blacklist entries
        Object.keys(raw).forEach(tag => {
            if (raw[tag].e > now) blacklistSet.add(tag);
        });
    } catch(e) { 
        console.warn("Blacklist passive check failed:", e); 
    }
  }

  const sanitizeNum = (v) => {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  };
  const sanitizeStr = (v) => (v === null || v === undefined) ? '' : String(v).trim();

  return vals.map((r, index) => {
    try {
      const tagRaw = r[SCHEMA.TAG];
      if (!tagRaw || typeof tagRaw !== 'string' || !tagRaw.startsWith('#')) return null;

      // 🛡️ PASSIVE HIDING: Check Blacklist Property
      if (isHeadhunter && blacklistSet.has(tagRaw)) {
          return null;
      }

      const id = tagRaw.replace('#', '').trim();
      if (id.length < 3) return null;

      // 🚨 AIRTIGHT FILTER: Check "Invited" status (Column Index 1)
      if (isHeadhunter) {
        const rawInvited = r[SCHEMA.INVITED];
        
        // Broad truthy check: handles boolean true, "TRUE", "checked", 1, etc.
        const isActuallyInvited = (
           rawInvited === true || 
           String(rawInvited).toUpperCase() === 'TRUE' ||
           String(rawInvited) === '1'
        );
        
        // IF INVITED -> STRIP FROM PAYLOAD IMMEDIATELY
        if (isActuallyInvited) {
          return null;
        }
      }

      const name = sanitizeStr(r[SCHEMA.NAME]).replace(/^=HYPERLINK.*"(.*)".*$/, '$1');
      const trophies = sanitizeNum(r[SCHEMA.TROPHIES]);
      const score = sanitizeNum(r[SCHEMA.PERF_SCORE]);

      if (isHeadhunter) {
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
        const trend = sanitizeNum(r[SCHEMA.TREND]); 
        const raw = sanitizeNum(r[SCHEMA.RAW_SCORE]); 

        return [id, name, trophies, score, role, days, avg, seen, rateDisplay, hist, trend, raw];
      }

    } catch (err) {
      console.warn(`Row extraction error in ${sheetName}: ${err.message}`);
      return null;
    }
  }).filter(Boolean); // Nuke all nulls (Invited recruits)
}

