
/**
 * MODULE: CONTROLLER_WEBAPP - TypeScript Edition
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Data generation and caching layer for the JSON REST API.
 * VERSION: 13.1.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { IRegistry } from "./Registry";

// Global Version Constant
// @ts-ignore
// HARDEN: Unified versioning prevents false-negative health check failures.
const VER_CONTROLLER_WEBAPP = "13.1.0";

declare var SpreadsheetApp: any;
declare var LockService: any;
declare var PropertiesService: any;
declare var UrlFetchApp: any;
declare var CacheService: any;
declare var ContentService: any;
declare var Utilities: any;
declare var ScriptApp: any;
declare var Logger: any;
declare var module: any;

declare namespace GoogleAppsScript {
  export namespace Events {
    export type DoGet = any;
    export type DoPost = any;
    export type AppsScriptEvent = any;
    export type SheetsOnEdit = any;
  }
  export namespace Spreadsheet {
    export type Sheet = any;
    export type Spreadsheet = any;
    export type Range = any;
  }
  export namespace Content {
    export type TextOutput = any;
  }
}

// Global Declarations for GAS Environment
declare const CONFIG: AppConfig;
declare const Registry: IRegistry;

// routed via Registry in modern stack

/**
 * CONTROLLER INTERFACES
 */

/**
 * EXTRACTION MAPPING
 * Defines the contract for transforming a spreadsheet column into a typed JSON key.
 */
export interface ExtractionMapping {
  key: string;
  col: number;
  type: "tag" | "str" | "num" | "rate" | "date" | "bool_check";
}

/**
 * SHEET DATA RESULT
 * A standardized container for raw matrix data and its associated schema.
 */
export interface SheetDataResult {
  schema: string[];
  rows: any[][];
}

/**
 * APPLICATION PAYLOAD
 * The global response envelope for the PWA.
 *
 * @remarks
 * Implements a "Matrix" format to minimize JSON overhead. Instead of returning
 * an array of objects (where keys are repeated for every row), it returns
 * a single schema array and a 2D matrix of values. The PWA then inflates
 * these values based on the schema index. This reduces payload size by ~40%.
 */
export interface AppPayload {
  success: boolean;
  data: {
    format: string;
    schema: {
      lb: string[];
      hh: string[];
    };
    lb: any[][];
    hh: any[][];
    playerTag: string;
    timestamp: number;
  } | null;
  error: { code: string; message: string } | null;
}

/**
 * DATA RETRIEVAL (Called by API_Public.ts)
 *
 * @remarks
 * Primary gateway for the PWA frontend. Implements a multi-tier caching
 * strategy using CacheService (L2) to ensure rapid response times and
 * minimize execution overhead.
 *
 * @param forceRefresh - If true, bypasses L2 cache and regenerates the payload.
 * @returns JSON string containing the AppPayload.
 * @warning Consumes CacheService (L2) and potentially heavy SpreadsheetApp quotas.
 */
function getWebAppData(forceRefresh: boolean): string {
  try {
    let payloadStr: string | null = null;

    if (!forceRefresh) {
      payloadStr = Registry.Services.Store.cache.getLarge(CONFIG.SYSTEM.JSON_STORE_KEY);
    }

    if (payloadStr) return payloadStr;

    return refreshWebPayload();
  } catch (e: any) {
    console.error(`[API] getWebAppData CRITICAL FAILURE: ${e.stack}`);
    return JSON.stringify({
      success: false,
      data: null,
      error: {
        code: "PAYLOAD_GENERATION_FAILED",
        message: `Unable to generate data payload. ${e.message || 'Unknown error'}. Please check backend logs.`,
      },
    });
  }
}

/**
 * DISMISSAL ENGINE (Event-Sourced)
 *
 * @remarks
 * Implements the "Event-Sourced Dismissal" pattern. Instead of modifying
 * the main database sheets directly (which is slow and error-prone during
 * concurrent access), dismissals are logged as events in the `EVT` sheet.
 * The payload generator then uses this event stream to filter the UI.
 *
 * @param ids - Array of player tags to dismiss.
 * @returns Result object with success status and metrics.
 * @warning Consumes SpreadsheetApp and Advanced Sheets Service quotas.
 */
function markRecruitsAsInvitedBulk(items: Array<{ id: string; score: number }>): {
  success: boolean;
  count: number;
  dbWrite?: number;
  payloadSize?: number;
} {
  if (!items || !Array.isArray(items) || items.length === 0)
    return { success: true, count: 0 };

  return Registry.Services.Core.executeSafely("WRITE_HH_EVT", () => {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const ssId = ss.getId();
      
      // 1. ENSURE EVENT LOG SHEET
      let evtSheet = ss.getSheetByName(CONFIG.SHEETS.EVT);
      if (!evtSheet) {
        evtSheet = ss.insertSheet(CONFIG.SHEETS.EVT);
        evtSheet.getRange(1, 1, 1, 3).setValues([["Tag", "Timestamp", CONFIG.SCHEMA.HH_HEADERS.RAW_SCORE]]);
        evtSheet.setTabColor("#ff5722"); // Visual marker for "Hot" data
      } else {
        // Robust header verification (Ensures headers persist even if cleared)
        // Ensure sheet is wide enough for 3 columns to prevent 400 errors
        if (evtSheet.getMaxColumns() < 3) {
           evtSheet.insertColumnsAfter(evtSheet.getMaxColumns(), 3 - evtSheet.getMaxColumns());
        }
        if (evtSheet.getLastRow() === 0 || evtSheet.getRange(1, 1).getValue() !== "Tag" || evtSheet.getLastColumn() < 3) {
           evtSheet.getRange(1, 1, 1, 3).setValues([["Tag", "Timestamp", CONFIG.SCHEMA.HH_HEADERS.RAW_SCORE]]);
        }
      }

      // 2. FETCH SOURCE OF TRUTH (Headhunter Sheet)
      // Reliable Injection: We read the current Headhunter sheet to get the
      // authoritative Raw Score, bypassing any potential client-side data loss.
      const scoreMap = new Map<string, number>();
      try {
        // Fetch Columns B (Tag) through J (Raw Score) - robust range calculation
        // Data starts at Row 3 (CONFIG.LAYOUT.DATA_START_ROW)
        const hhDataRange = `'${CONFIG.SHEETS.HH}'!B${CONFIG.LAYOUT.DATA_START_ROW}:J`;
        // @ts-ignore
        const hhResponse = Sheets.Spreadsheets.Values.get(ssId, hhDataRange);
        const rows = hhResponse.values || [];
        
        // Column Index relative to range start (B=0):
        // Tag is at 0 (Col B)
        // Raw Score is at 8 (Col J)
        rows.forEach((row: any[]) => {
          if (!row || row.length < 1) return;
          const tag = String(row[0] || "").toUpperCase().trim();
          // Use sanitizeNum to handle potentially formatted spreadsheet strings (e.g. "50,000")
          const rawScore = (row.length > 8) ? sanitizeNum(row[8], "") : 0;
          if (tag) {
             scoreMap.set(tag, rawScore);
          }
        });
        console.log(`[API] Hydrated ${scoreMap.size} authoritative scores from Headhunter sheet.`);
      } catch (readErr) {
        console.warn(`[API] Failed to read Headhunter source scores (fallback to client): ${readErr}`);
      }

      // ATOMIC APPEND (Advanced API)
      const now = Date.now();
      const values = items.map((item) => {
        let id = (item.id.startsWith("#") ? item.id : "#" + item.id).toUpperCase();
        
        // INJECTION: Prefer the Authoritative Score from Sheet, fallback to Client payload
        let score = scoreMap.get(id);
        if (score === undefined) {
           score = Number(item.score) || 0;
        }

        return [
          id,
          now,
          score
        ];
      });

      if (values.length > 0) {
        // @ts-ignore
        Sheets.Spreadsheets.Values.append({
          values: values
        }, ssId, `'${CONFIG.SHEETS.EVT}'!A1`, {
          valueInputOption: "USER_ENTERED"
        });
      }

      // 3. ATOMIC FLUSH & CACHE INVALIDATION
      // Rationale: We invalidate the cache instead of re-generating the heavy
      // payload synchronously. This reduces write latency from ~10s to <1s.
      // The payload will be re-generated on the next read request.
      SpreadsheetApp.flush();
      Registry.Services.Store.cache.remove(CONFIG.SYSTEM.JSON_STORE_KEY);

      return {
        success: true,
        count: items.length,
        dbWrite: values.length,
        payloadSize: 0,
        metadata: { 
          processedAt: now,
          writtenScores: values.map(v => `${v[0]}: ${v[2]}`),
          columnsWritten: values[0] ? values[0].length : 0
        }
      };
    } catch (e: any) {
      console.error(`[API] Event-Sourced Dismiss Fail: ${e.message}`);
      throw new Error(`Dismiss Failed (Event-Log): ${e.message}`);
    }
  });
}

/**
 * DISMISSAL REVERSAL
 *
 * @remarks
 * Removes specific tags from the `EVT` hot stream, effectively "undismissing"
 * them and making them visible again in the PWA.
 *
 * @param ids - Array of player tags to restore.
 * @returns Result object with the number of successfully removed records.
 * @warning Consumes SpreadsheetApp quotas for row deletion.
 */
function undismissRecruitsBulk(ids: string[]): {
  success: boolean;
  count: number;
} {
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return { success: true, count: 0 };

  return Registry.Services.Core.executeSafely("REVERSE_HH_EVT", () => {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const evtSheet = ss.getSheetByName(CONFIG.SHEETS.EVT);
      if (!evtSheet) return { success: true, count: 0 };

      const lastRow = evtSheet.getLastRow();
      if (lastRow <= 1) return { success: true, count: 0 };

      const rawEVT = evtSheet.getDataRange().getValues();
      const tagsToUndo = new Set(ids.map(id => (id.startsWith("#") ? id : "#" + id).toUpperCase()));
      
      // Work backwards to delete rows to avoid index shifts.
      // Deleting from the top would change the absolute index of all
      // subsequent rows, causing us to delete the wrong data.
      let removedCount = 0;
      for (let i = rawEVT.length - 1; i >= 1; i--) {
        const tag = String(rawEVT[i][0]).toUpperCase().trim();
        if (tagsToUndo.has(tag)) {
          evtSheet.deleteRow(i + 1);
          removedCount++;
        }
      }

      if (removedCount > 0) {
        SpreadsheetApp.flush();
        Registry.Services.Store.cache.remove(CONFIG.SYSTEM.JSON_STORE_KEY);
      }

      return {
        success: true,
        count: removedCount
      };
    } catch (e: any) {
      console.error(`[API] Event-Sourced Undismiss Fail: ${e.message}`);
      throw new Error(`Undismiss Failed: ${e.message}`);
    }
  });
}

/**
 * CACHE MANAGEMENT
 *
 * @remarks
 * Synchronously triggers the payload generation pipeline and updates the
 * global cache. Used after write operations to ensure UI consistency.
 *
 * @returns Freshly generated JSON payload.
 * @warning Consumes heavy SpreadsheetApp and Advanced Sheets Service quotas.
 */
function refreshWebPayload(): string {
  return Registry.Services.Core.executeSafely("PAYLOAD_GEN", () => {
    return _generatePayloadInternal();
  });
}

/**
 * PAYLOAD GENERATOR
 *
 * @remarks
 * The architectural heart of the API. This function orchestrates the
 * full extraction, filtering, and compression pipeline:
 * 1. Boot dynamic schemas.
 * 2. Extract raw data from Roster and Headhunter sheets.
 * 3. Blend the Permanent Blacklist with the Hot Event Stream.
 * 4. Filter out dismissed/blacklisted recruits.
 * 5. Compress into 'Matrix' format.
 * 6. Persist to CacheService (L2).
 *
 * @returns Minified JSON string of the AppPayload.
 * @warning Consumes heavy SpreadsheetApp and Advanced Sheets Service quotas.
 */
function _generatePayloadInternal(): string {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ssId = ss.getId();
    Registry.Services.Schema.bootDynamicSchema();

    const lbResult = extractSheetDataStrict(ss, CONFIG.SHEETS.ROSTER, "lb");
    const hhResult = extractSheetDataStrict(ss, CONFIG.SHEETS.HH, "hh");

    // BUILD GLOBAL EXCLUSION SET (Blacklist + Event Stream)
    // OPTIMIZATION: Use Advanced API for faster metadata fetch
    const exclusionSet = new Set<string>();

    // A. Read Permanent Blacklist
    try {
      // ADVANCED SERVICE: Sheets.Spreadsheets.Values.get
      // Rationale: This is faster for large metadata reads than the standard
      // SpreadsheetApp.getRange().getValues() because it returns a raw JSON
      // object and bypasses the heavy SpreadsheetApp wrapper.
      // @ts-ignore
      const blResponse = Sheets.Spreadsheets.Values.get(ssId, `'${CONFIG.SHEETS.BL}'!A:B`);
      const rawBL = blResponse.values || [];
      const now = Date.now();
      rawBL.forEach((r: any) => {
        const tag = String(r[0] || "").toUpperCase().trim();
        const expiry = Number(r[1]) || 0;
        if (tag && expiry > now) exclusionSet.add(tag);
      });
    } catch (e) {
      console.warn("[API] Blacklist read skipped (Sheet might not exist or be empty)");
    }

    // B. Read Hot Event Stream (Dismissals not yet reconciled to main sheets)
    try {
      // ADVANCED SERVICE: Sheets.Spreadsheets.Values.get
      // @ts-ignore
      const evtResponse = Sheets.Spreadsheets.Values.get(ssId, `'${CONFIG.SHEETS.EVT}'!A:A`);
      const rawEVT = evtResponse.values || [];
      rawEVT.forEach((r: any, idx: number) => {
        if (idx === 0) return; // Skip Header
        const tag = String(r[0] || "").toUpperCase().trim();
        if (tag) exclusionSet.add(tag);
      });
    } catch (e) {
       console.warn("[API] Event stream read skipped (Sheet might not exist or be empty)");
    }

    // FILTER RECRUITS
    const filteredHH = hhResult.rows.filter((row) => {
      const id = ("#" + row[0]).toUpperCase();
      return !exclusionSet.has(id);
    });

    const dataPayload = {
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

    const fullPayload: AppPayload = {
      success: true,
      data: dataPayload,
      error: null,
    };
    const payloadStr = JSON.stringify(fullPayload);

    Registry.Services.Store.cache.putLarge(
      CONFIG.SYSTEM.JSON_STORE_KEY,
      payloadStr,
      600, // Freshness window
    );
    Registry.Services.Store.props.set("LAST_PAYLOAD_TIMESTAMP", String(dataPayload.timestamp));

    return payloadStr;
  } catch (e: any) {
    console.error(`[API] refreshWebPayload FAILED: ${e.stack}`);
    return JSON.stringify({
      success: false,
      data: null,
      error: {
        code: "PAYLOAD_REFRESH_FAILED",
        message: `Failed to refresh data: ${e.message || 'Unknown error'}. Check if sheets exist and contain valid data.`,
      },
    });
  }
}


/**
 * DATA EXTRACTION (STRICT MODE)
 *
 * @remarks
 * A high-performance extractor that prioritizes speed and low quota usage.
 *
 * PHILOSOPHY:
 * 1. Single RPC: It uses a single `getValues()` call to fetch all data rows.
 * 2. JS over GAS: Performs all mapping and type conversion in the JS engine
 *    rather than calling SpreadsheetApp methods for every cell (which is slow).
 * 3. Matrix Output: Returns raw arrays to minimize JSON size.
 *
 * @param ss - Active Spreadsheet instance.
 * @param sheetName - Target sheet to extract.
 * @param type - 'lb' (Leaderboard) or 'hh' (Headhunter) to determine schema.
 * @returns Parsed SheetDataResult.
 * @warning Consumes SpreadsheetApp quota for data range retrieval.
 */
function extractSheetDataStrict(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  sheetName: string,
  type: "lb" | "hh",
): SheetDataResult {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    console.warn(`[DATA] extractSheetDataStrict: Sheet '${sheetName}' not found.`);
    return { schema: [], rows: [] };
  }

  const lastRow = sheet.getLastRow();
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;
  if (lastRow < startRow) {
    console.info(`[DATA] extractSheetDataStrict: Sheet '${sheetName}' has no data rows.`);
    return { schema: [], rows: [] };
  }

  let mapping: ExtractionMapping[] = [];
  const S = type === "lb" ? CONFIG.SCHEMA.ROSTER : CONFIG.SCHEMA.HH;

  if (type === "lb") {
    mapping = [
      { key: "id", col: S.TAG, type: "tag" },
      { key: "n", col: S.NAME, type: "str" },
      { key: "role", col: S.ROLE, type: "str" },
      { key: "t", col: S.TROPHIES, type: "num" },
      { key: "performanceScore", col: S.PERF_SCORE, type: "num" },
      { key: "performanceRawScore", col: S.RAW_SCORE, type: "num" },
      { key: "days", col: S.DAYS, type: "num" },
      { key: "req", col: S.WEEKLY_REQ, type: "num" },
      { key: "avg", col: S.AVG_DAY, type: "num" },
      { key: "tot", col: S.TOTAL_DON, type: "num" },
      { key: "seen", col: S.LAST_SEEN, type: "date" },
      { key: "rate", col: S.WAR_RATE, type: "rate" },
      { key: "wfame", col: S.AVG_WAR_FAME, type: "num" },
      { key: "hist", col: S.HISTORY, type: "str" },
      { key: "dt", col: S.TREND, type: "num" },
    ];
  } else {
    mapping = [
      { key: "id", col: S.TAG, type: "tag" },
      { key: "n", col: S.NAME, type: "str" },
      { key: "t", col: S.TROPHIES, type: "num" },
      { key: "potentialScore", col: S.POTENTIAL_SCORE, type: "num" },
      { key: "potentialRawScore", col: S.RAW_SCORE, type: "num" },
      { key: "don", col: S.DONATIONS, type: "num" },
      { key: "war", col: S.WAR_WINS, type: "num" },
      { key: "cards", col: S.CARDS, type: "num" },
      { key: "ago", col: S.FOUND_DATE, type: "date" },
      { key: "lastScan", col: S.LAST_SCAN, type: "date" },
      { key: "invited", col: S.INVITED, type: "bool_check" },
    ];
  }

  const maxColIdx = Math.max(...mapping.map((m) => m.col));
  const requiredCols = maxColIdx + 1;
  const sheetMaxCols = sheet.getMaxColumns();

  const safeNumCols = Math.min(requiredCols, sheetMaxCols);
  const numRows = lastRow - startRow + 1;
  
  if (numRows <= 0) return { schema: [], rows: [] };
  
  // SINGLE RPC CALL: Fetch only raw values. 
  // Formatting is handled in JS to avoid the slow getDisplayValues() RPC.
  const vals = sheet.getRange(startRow, 2, numRows, safeNumCols).getValues();
  const rows: any[][] = [];

  for (let i = 0; i < vals.length; i++) {
    const rowRaw = vals[i];

    if (!Array.isArray(rowRaw)) continue;

    const tagRaw = String(rowRaw[S.TAG] || "").trim();
    // Validate tag: Minimum 3 characters to exclude empty or corrupted rows.
    if (!tagRaw || tagRaw.length < 3) continue;

    if (type === "hh") {
      // In Headhunter mode, we skip recruits already marked as "Invited"
      // in the sheet to prevent UI clutter.
      const invitedVal = rowRaw[S.INVITED];
      const isInvited =
        invitedVal === true || String(invitedVal).toUpperCase() === "TRUE";
      if (isInvited) continue;
    }

    const outputRow = mapping
      .map((m) => {
        // "bool_check" columns are control-only (e.g. checkbox for invitation).
        // They are excluded from the "Matrix" data payload to reduce size.
        if (m.type === "bool_check") return null;

        if (m.col >= rowRaw.length) return m.type === "num" ? 0 : "";

        const val = rowRaw[m.col];

        switch (m.type) {
          case "tag":
            // Normalize tags for the PWA (No # prefix, Uppercase).
            return String(val || "").replace("#", "").trim().toUpperCase();
          case "num":
            return sanitizeNum(val, "");
          case "rate":
            // Performance Optimization: Manual percentage formatting.
            // Using getDisplayValues() on the sheet is significantly slower (10x+)
            // than getValues() + manual JS parsing because it forces the
            // spreadsheet engine to calculate formatting for every cell.
            if (val === null || val === undefined || val === "") return "0%";
            if (typeof val === "number") {
                if (val <= 1.0) return `${Math.round(val * 100)}%`;
                return `${Math.round(val)}%`;
            }
            const sVal = String(val);
            if (sVal.toUpperCase().includes("N/A")) return "N/A";
            if (sVal.includes("%")) return sVal.trim();
            const n = parseFloat(sVal);
            return isNaN(n) ? "0%" : `${Math.round(n * 100)}%`;
          case "date":
            const dateObj = Registry.Services.Time.parseFlexibleDate(val);
            if (isNaN(dateObj.getTime()) || dateObj.getTime() <= 0) {
                return val ? String(val) : "";
            }
            return dateObj.toISOString();
          case "str":
          default:
            const s = val === null || val === undefined ? "" : String(val);
            // FORMULA STRIPPING:
            // Extract URL from =HYPERLINK("url", "label") artifacts to ensure
            // the JSON API returns raw data instead of spreadsheet formulas.
            if (s.startsWith("=")) {
              return s.replace(/^=HYPERLINK.*"(.*)".*$/, "$1");
            }
            return s.trim();
        }
      })
      .filter((v) => v !== null);

    rows.push(outputRow);
  }

  return {
    schema: mapping.filter((m) => m.type !== "bool_check").map((m) => m.key),
    rows: rows,
  };
}

/**
 * NUMERIC SANITIZER
 *
 * @remarks
 * Cleans raw spreadsheet values (which may contain strings like "1,000" or "10%")
 * into standard JavaScript numbers for the PWA.
 *
 * It handles the transition from spreadsheet engine strings to JS numbers,
 * stripping common formatting characters that `parseFloat` might choke on.
 *
 * @param v - Raw value from spreadsheet.
 * @param displayV - (Legacy) Original display value. Deprecated in v11.0.
 * @returns Cleaned numeric value.
 */
function sanitizeNum(v: any, displayV: string): number {
  if (v === null || v === undefined) return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/,/g, "").replace(/%/g, "").trim();
  if (s.toUpperCase() === "N/A") return 0;
  const n = parseFloat(s);
  if (isNaN(n)) return 0;
  return n;
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, {
    getWebAppData,
    markRecruitsAsInvitedBulk,
    undismissRecruitsBulk,
    refreshWebPayload,
    VER_CONTROLLER_WEBAPP,
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));
