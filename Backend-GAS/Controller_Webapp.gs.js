/**
 * ============================================================================
 * 🌐 MODULE: CONTROLLER_WEBAPP (DATA LAYER)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Data generation and caching layer for the JSON REST API.
 * 🏷️ VERSION: 10.0.0
 * ============================================================================
 */

const VER_CONTROLLER_WEBAPP = "10.0.0";

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

      // ⚡ SMART SYNC: Dynamically resolve column indices from headers before building matrix
      Utils.bootDynamicSchema();

      const data = {
        format: "matrix",
        schema: {
          lb: [
            "id",
            "n",
            "role",
            "t",
            "days",
            "req",
            "avg",
            "tot",
            "seen",
            "rate",
            "wfame",
            "hist",
            "r",
            "s",
            "dt",
            "war",
          ],
          hh: ["id", "n", "t", "s", "don", "war", "ago", "cards"],
        },
        lb: extractSheetDataMatrix(
          ss,
          CONFIG.SHEETS.LB,
          CONFIG.SCHEMA.LB,
          false,
        ),
        hh: extractSheetDataMatrix(
          ss,
          CONFIG.SHEETS.HH,
          CONFIG.SCHEMA.HH,
          true,
        ),
        playerTag: (CONFIG.SYSTEM.PLAYER_TAG || "").replace("#", "").trim(),
        timestamp: new Date().getTime(),
        _debug_schema: { lb: CONFIG.SCHEMA.LB, hh: CONFIG.SCHEMA.HH },
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
// 📊 DATA EXTRACTION (MATRIX MODE)
// ============================================================================

function extractSheetDataMatrix(ss, sheetName, SCHEMA, isHeadhunter) {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];

  const lastRow = sheet.getLastRow();
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;

  if (lastRow < startRow) return [];

  // Calculate the max column index we need to fetch based on the schema
  const maxIdx = Math.max(...Object.values(SCHEMA));
  const numCols = Math.max(20, maxIdx + 1); // Absolute 1:1 Sheet Fetch

  const range = sheet.getRange(startRow, 1, lastRow - startRow + 1, numCols);
  const vals = range.getValues();
  const displayVals = range.getDisplayValues();

  const sanitizeNum = (v, displayV) => {
    if (v === null || v === undefined) return 0;
    if (typeof v === "number") {
      // Handle ratio percentages (0.85 in cell, but 85 expected in PWA)
      if (displayV && displayV.includes("%") && v <= 1.5) return v * 100;
      return v;
    }
    let s = String(v).replace(/,/g, "").replace(/%/g, "").trim();
    let n = parseFloat(s);
    if (isNaN(n)) return 0;
    if (String(v).includes("%") && n <= 1.5) return n * 100;
    return n;
  };
  const sanitizeStr = (v) =>
    v === null || v === undefined ? "" : String(v).trim();

  return vals
    .map((r, index) => {
      try {
        const tagRaw = r[SCHEMA.TAG];
        if (!tagRaw || typeof tagRaw !== "string" || !tagRaw.startsWith("#"))
          return null;

        const id = tagRaw.replace("#", "").trim();
        if (id.length < 3) return null;

        // 🚨 AIRTIGHT FILTER: Check "Invited" status
        if (isHeadhunter) {
          const rawInvited = r[SCHEMA.INVITED];
          const isActuallyInvited =
            rawInvited === true ||
            String(rawInvited).toUpperCase() === "TRUE" ||
            String(rawInvited) === "1";
          if (isActuallyInvited) return null;
        }

        const name = sanitizeStr(r[SCHEMA.NAME]).replace(
          /^=HYPERLINK.*"(.*)".*$/,
          "$1",
        );
        const trophies = sanitizeNum(r[SCHEMA.TROPHIES]);

        // Explicit column values from Absolute Sheet Schema
        const raw = sanitizeNum(
          r[SCHEMA.RAW_SCORE],
          displayVals[index][SCHEMA.RAW_SCORE],
        );
        const score = sanitizeNum(
          r[SCHEMA.PERF_SCORE],
          displayVals[index][SCHEMA.PERF_SCORE],
        );
        const trend = sanitizeNum(
          r[SCHEMA.TREND],
          displayVals[index][SCHEMA.TREND],
        );

        if (isHeadhunter) {
          const fd = r[SCHEMA.FOUND_DATE];
          const ago =
            fd instanceof Date && !isNaN(fd.getTime()) ? fd.toISOString() : "";
          const don = sanitizeNum(r[SCHEMA.DONATIONS]);
          const war = sanitizeNum(r[SCHEMA.WAR_WINS]);
          const cards = sanitizeNum(r[SCHEMA.CARDS]);

          return [id, name, trophies, score, don, war, ago, cards];
        } else {
          // LEADERBOARD logic remains same...
          let role = sanitizeStr(r[SCHEMA.ROLE] || "Member");
          if (role === "coLeader") role = "Co-Leader";

          let rateDisplay = "0%";
          const visualRate = displayVals[index][SCHEMA.WAR_RATE];
          const rawRate = r[SCHEMA.WAR_RATE];

          if (visualRate && visualRate.includes("%")) {
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
          const seen = sanitizeStr(r[SCHEMA.LAST_SEEN] || "-");
          const hist = sanitizeStr(r[SCHEMA.HISTORY]);
          const trend = sanitizeNum(r[SCHEMA.TREND]);
          const raw = sanitizeNum(r[SCHEMA.RAW_SCORE]);
          const wfame = sanitizeNum(r[SCHEMA.AVG_WAR_FAME]);

          return [
            id,
            name,
            role,
            trophies,
            days,
            sanitizeNum(r[SCHEMA.WEEKLY_REQ]),
            avg,
            sanitizeNum(r[SCHEMA.TOTAL_DON]),
            seen,
            rateDisplay,
            wfame,
            hist,
            raw,
            score,
            trend,
            sanitizeNum(r[SCHEMA.WAR_DAY_WINS]),
          ];
        }
      } catch (err) {
        console.warn(`Row extraction error in ${sheetName}: ${err.message}`);
        return null;
      }
    })
    .filter(Boolean);
}
