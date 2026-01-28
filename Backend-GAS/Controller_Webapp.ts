
/**
 * ============================================================================
 * 🌐 MODULE: CONTROLLER_WEBAPP - TypeScript Edition
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Data generation and caching layer for the JSON REST API.
 * 🏷️ VERSION: 11.0.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { IRegistry } from "./Registry";

// Global Version Constant
// @ts-ignore
const VER_CONTROLLER_WEBAPP = "11.0.0";

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
 * 🌐 CONTROLLER INTERFACES
 */
export interface ExtractionMapping {
  key: string;
  col: number;
  type: "tag" | "str" | "num" | "rate" | "date" | "bool_check";
}

export interface SheetDataResult {
  schema: string[];
  rows: any[][];
}

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
 * 📦 DATA RETRIEVAL (Called by API_Public.ts)
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
    console.error(`❌ [API] getWebAppData CRITICAL FAILURE: ${e.stack}`);
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
 * ✏️ WRITE OPERATIONS
 */
function markRecruitsAsInvitedBulk(ids: string[]): {
  success: boolean;
  count: number;
  dbWrite?: number;
  deleted?: number;
  payloadSize?: number;
} {
  if (!ids || !Array.isArray(ids) || ids.length === 0)
    return { success: true, count: 0 };

  return Registry.Services.Core.executeSafely("WRITE_HH", () => {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      SpreadsheetApp.flush();

      // 1. READ EXISTING DATA
      const sheet = ss.getSheetByName(CONFIG.SHEETS.HH);
      const tagScoreMap = new Map<string, number>();
      const tagRowMap = new Map<string, number>();

      const ssId = ss.getId();
      if (sheet) {
        Registry.Services.Schema.bootDynamicSchema();
        const startRow = CONFIG.LAYOUT.DATA_START_ROW;
        const lastRowVisual = sheet.getLastRow();

        if (lastRowVisual >= startRow) {
          const numRows = lastRowVisual - startRow + 1;
          const H = CONFIG.SCHEMA.HH;

          const tagValues = sheet
            .getRange(startRow, 1 + H.TAG, numRows, 1)
            .getValues();
          const scoreValues = sheet
            .getRange(startRow, 1 + H.RAW_SCORE, numRows, 1)
            .getValues();

          for (let i = 0; i < tagValues.length; i++) {
            const t = String(tagValues[i][0] || "").trim();
            const s = Number(scoreValues[i][0]) || 0;
            if (t) {
              const normTag = (t.startsWith("#") ? t : "#" + t).toUpperCase();
              tagScoreMap.set(normTag, s);
              tagRowMap.set(normTag, startRow + i);
            }
          }
        }
      }
      const lbSheet = ss.getSheetByName(CONFIG.SHEETS.LB);
      const hhSheet = ss.getSheetByName(CONFIG.SHEETS.HH);

      if (!lbSheet) {
        throw new Error(`Sheet '${CONFIG.SHEETS.LB}' not found. Please run the Leaderboard update first.`);
      }
      if (!hhSheet) {
        throw new Error(`Sheet '${CONFIG.SHEETS.HH}' not found. Please run the Headhunter scout first.`);
      }

      // 2. DATABASE WRITE
      let blSheet = ss.getSheetByName(CONFIG.SHEETS.BL);
      if (!blSheet) {
        blSheet = ss.insertSheet(CONFIG.SHEETS.BL);
        blSheet.getRange(1, 1, 1, 3).setValues([["Tag", "Expiry", "RawScore"]]);
      }

      const now = Date.now();
      const expiryDuration =
        (CONFIG.HEADHUNTER.BLACKLIST_DAYS || 30) * 86400000;
      const expiryDate = now + expiryDuration;

      const dbEntries = ids.map((id) => {
        const tag = (id.startsWith("#") ? id : "#" + id).toUpperCase();
        const rawScore = tagScoreMap.get(tag) || 0;
        return [tag, expiryDate, rawScore];
      });

      if (dbEntries.length > 0) {
        Sheets.Spreadsheets!.Values!.append({
          values: dbEntries
        }, ssId, `'${CONFIG.SHEETS.BL}'!A1`, {
          valueInputOption: "USER_ENTERED"
        });
      }

      // 3. SHEET CLEANUP
      let deletedCount = 0;
      if (sheet && tagRowMap.size > 0) {
        const rowsToDelete: number[] = [];
        ids.forEach((id) => {
          const tag = (id.startsWith("#") ? id : "#" + id).toUpperCase();
          if (tagRowMap.has(tag)) rowsToDelete.push(tagRowMap.get(tag)!);
        });

        if (rowsToDelete.length > 0) {
          const deleteRequests = rowsToDelete
            .sort((a, b) => b - a)
            .map(idx => ({
              deleteDimension: {
                range: {
                  sheetId: sheet.getSheetId(),
                  dimension: "ROWS",
                  startIndex: idx - 1,
                  endIndex: idx
                }
              }
            }));
          
          Sheets.Spreadsheets!.batchUpdate({ requests: deleteRequests }, ssId);
          deletedCount = rowsToDelete.length;
        }
      }

      // 4. FLUSH & REFRESH
      SpreadsheetApp.flush();
      const payloadStr = _generatePayloadInternal();

      return {
        success: true,
        count: ids.length,
        dbWrite: dbEntries.length,
        deleted: deletedCount,
        payloadSize: payloadStr.length,
      };
    } catch (e: any) {
      console.error(`❌ [API] Bulk Dismiss Error: ${e.message}`);
      throw new Error(`Dismiss Failed: ${e.message}`);
    }
  });
}

/**
 * 🔄 CACHE MANAGEMENT
 */
function refreshWebPayload(): string {
  return Registry.Services.Core.executeSafely("PAYLOAD_GEN", () => {
    return _generatePayloadInternal();
  });
}

/**
 * 🔒 INTERNAL GENERATOR
 */
function _generatePayloadInternal(): string {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    Registry.Services.Schema.bootDynamicSchema();

    const lbResult = extractSheetDataStrict(ss, CONFIG.SHEETS.LB, "lb");
    const hhResult = extractSheetDataStrict(ss, CONFIG.SHEETS.HH, "hh");

    const blSheet = ss.getSheetByName(CONFIG.SHEETS.BL);
    const blacklist = new Set<string>();
    if (blSheet) {
      const rawBL = blSheet.getDataRange().getValues();
      const now = Date.now();
      rawBL.forEach((r: any) => {
        if (Number(r[1]) > now) blacklist.add(String(r[0]).toUpperCase());
      });
    }

    const filteredHH = hhResult.rows.filter((row) => {
      const id = "#" + row[0];
      return !blacklist.has(id.toUpperCase());
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
      600, // Reduced from 21600 (6h) to 600 (10m) for higher freshness
    );
    Registry.Services.Store.props.set("LAST_PAYLOAD_TIMESTAMP", String(dataPayload.timestamp));

    return payloadStr;
  } catch (e: any) {
    console.error(`❌ [API] refreshWebPayload FAILED: ${e.stack}`);
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
 * 📊 DATA EXTRACTION (STRICT MODE)
 */
function extractSheetDataStrict(
  ss: GoogleAppsScript.Spreadsheet.Spreadsheet,
  sheetName: string,
  type: "lb" | "hh",
): SheetDataResult {
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    console.warn(`⚠️ [DATA] extractSheetDataStrict: Sheet '${sheetName}' not found.`);
    return { schema: [], rows: [] };
  }

  const lastRow = sheet.getLastRow();
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;
  if (lastRow < startRow) {
    console.info(`ℹ️ [DATA] extractSheetDataStrict: Sheet '${sheetName}' has no data rows.`);
    return { schema: [], rows: [] };
  }

  let mapping: ExtractionMapping[] = [];
  const S = type === "lb" ? CONFIG.SCHEMA.LB : CONFIG.SCHEMA.HH;

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
      { key: "invited", col: S.INVITED, type: "bool_check" },
    ];
  }

  const maxColIdx = Math.max(...mapping.map((m) => m.col));
  const numCols = Math.max(20, maxColIdx + 1);
  
  // 🛡️ BOUNDS VALIDATION: Ensure we don't exceed sheet dimensions
  const sheetMaxCols = sheet.getMaxColumns();
  if (numCols > sheetMaxCols) {
    console.warn(`⚠️ [DATA] extractSheetDataStrict: Required columns (${numCols}) exceed sheet columns (${sheetMaxCols}). Data may be incomplete.`);
  }
  
  const safeNumCols = Math.min(numCols, sheetMaxCols);
  const numRows = lastRow - startRow + 1;
  
  if (numRows <= 0) {
    console.warn(`⚠️ [DATA] extractSheetDataStrict: Invalid row count (${numRows}) for sheet '${sheetName}'.`);
    return { schema: [], rows: [] };
  }
  
  const range = sheet.getRange(startRow, 2, numRows, safeNumCols);
  const vals = range.getValues();
  const displayVals = range.getDisplayValues();

  const rows: any[][] = [];

  for (let i = 0; i < vals.length; i++) {
    const rowRaw = vals[i];
    const rowDisplay = displayVals[i];

    // 🛡️ SAFETY: Ensure row arrays exist and have minimum length
    if (!Array.isArray(rowRaw) || !Array.isArray(rowDisplay)) {
      console.warn(`⚠️ [DATA] extractSheetDataStrict: Invalid row data at index ${i}. Skipping.`);
      continue;
    }

    const tagRaw = String(rowRaw[S.TAG] || "").trim();
    if (!tagRaw || tagRaw.length < 3) continue;

    if (type === "hh") {
      const invitedVal = rowRaw[S.INVITED];
      const isInvited =
        invitedVal === true || String(invitedVal).toUpperCase() === "TRUE";
      if (isInvited) continue;
    }

    const outputRow = mapping
      .map((m) => {
        if (m.type === "bool_check") return null;

        // 🛡️ SAFETY: Bounds check for column access
        if (m.col >= rowRaw.length || m.col >= rowDisplay.length) {
          console.warn(`⚠️ [DATA] Column index ${m.col} out of bounds for row ${i}. Using default value.`);
          return m.type === "num" ? 0 : "";
        }

        const val = rowRaw[m.col];
        const disp = rowDisplay[m.col];

        switch (m.type) {
          case "tag":
            return String(val || "").replace("#", "").trim().toUpperCase();
          case "num":
            return sanitizeNum(val, disp);
          case "rate":
            if (typeof disp === "string" && disp.toUpperCase().includes("N/A"))
              return "N/A";
            if (typeof disp === "string" && disp.includes("%"))
              return disp.trim();
            const n = parseFloat(String(val));
            if (isNaN(n)) return "0%";
            if (n <= 1.0) return `${Math.round(n * 100)}%`;
            return `${Math.round(n)}%`;
          case "date":
            return val instanceof Date ? val.toISOString() : "";
          case "str":
          default:
            const s = val === null || val === undefined ? "" : String(val);
            if (s.startsWith("=")) {
              return s.replace(/^=HYPERLINK.*"(.*)".*$/, "$1");
            }
            return s.trim();
        }
      })
      .filter((v) => v !== null);

    rows.push(outputRow);
  }

  console.info(`ℹ️ [DATA] extractSheetDataStrict: Extracted ${rows.length} valid row${rows.length !== 1 ? 's' : ''} from '${sheetName}'.`);

  return {
    schema: mapping.filter((m) => m.type !== "bool_check").map((m) => m.key),
    rows: rows,
  };
}

/**
 * Robust number parsing helper.
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
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, {
  getWebAppData,
  markRecruitsAsInvitedBulk,
  refreshWebPayload,
  VER_CONTROLLER_WEBAPP,
});
