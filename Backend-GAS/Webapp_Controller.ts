
/**
 * MODULE: CONTROLLER_WEBAPP - TypeScript Edition
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Data generation and caching layer for the JSON REST API.
 * VERSION: 13.1.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { RegistryContract } from "./Registry";
import type { Recruit } from "./Headhunter_Types";

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
declare const Registry: RegistryContract;

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
 * WEBAPP CONTROLLER CONTRACT
 */
export interface WebappControllerContract {
  getWebAppData(forceRefresh: boolean): string;
  updateRecruitInvitationStatus(items: Array<{ id: string; score: number }>): {
    success: boolean;
    count: number;
    dbWrite?: number;
    payloadSize?: number;
  };
  revertRecruitDismissal(ids: string[]): {
    success: boolean;
    count: number;
  };
  persistWebAppDataPayload(): string;
  getMembers(): any[];
  getPlayerProfile(tag: string): any;
  retrieveWarLogEntries(): any[];
  _generatePayloadInternal(): string;
}

/**
 * WEBAPP CONTROLLER: JSON REST API Layer.
 */
const WebappController: WebappControllerContract = {
  getWebAppData(forceRefresh: boolean): string {
    try {
      let payloadStr: string | null = null;
      if (!forceRefresh) {
        payloadStr = Registry.Services.Store.cache.getLarge(CONFIG.SYSTEM.JSON_STORE_KEY);
      }
      if (payloadStr) return payloadStr;
      return this.persistWebAppDataPayload();
    } catch (e: any) {
      console.error(`[API] getWebAppData CRITICAL FAILURE: ${e.stack}`);
      return JSON.stringify({
        success: false,
        data: null,
        error: {
          code: "PAYLOAD_GENERATION_FAILED",
          message: `Unable to generate data payload. ${e.message || 'Unknown error'}.`,
        },
      });
    }
  },

  updateRecruitInvitationStatus(items: Array<{ id: string; score: number }>): any {
    if (!items || !Array.isArray(items) || items.length === 0)
      return { success: true, count: 0 };

    return Registry.Services.Core.executeSafely("WRITE_HH_EVT", () => {
      try {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const ssId = ss.getId();
        
        let evtSheet = ss.getSheetByName(CONFIG.SHEETS.EVT);
        if (!evtSheet) {
          evtSheet = ss.insertSheet(CONFIG.SHEETS.EVT);
          evtSheet.getRange(1, 1, 1, 3).setValues([["Tag", "Timestamp", CONFIG.SCHEMA.HH_HEADERS.RAW_SCORE]]);
        }

        const scoreMap = new Map<string, number>();
        try {
          const hhDataRange = `'${CONFIG.SHEETS.HH}'!B${CONFIG.LAYOUT.DATA_START_ROW}:J`;
          // @ts-ignore
          const hhResponse = Sheets.Spreadsheets.Values.get(ssId, hhDataRange);
          const rows = hhResponse.values || [];
          rows.forEach((memberRow: any[]) => {
            if (!memberRow || memberRow.length < 1) return;
            const tag = String(memberRow[0] || "").toUpperCase().trim();
            const rawScore = (memberRow.length > 8) ? sanitizeNum(memberRow[8], "") : 0;
            if (tag) scoreMap.set(tag, rawScore);
          });
        } catch (readErr) {}

        const now = Date.now();
        const values = items.map((dismissalPayload) => {
          let id = (dismissalPayload.id.startsWith("#") ? dismissalPayload.id : "#" + dismissalPayload.id).toUpperCase();
          let score = scoreMap.get(id);
          if (score === undefined) score = Number(dismissalPayload.score) || 0;
          return [id, now, score];
        });

        if (values.length > 0) {
          // @ts-ignore
          Sheets.Spreadsheets.Values.append({ values }, ssId, `'${CONFIG.SHEETS.EVT}'!A1`, { valueInputOption: "USER_ENTERED" });
        }

        SpreadsheetApp.flush();
        Registry.Services.Store.cache.remove(CONFIG.SYSTEM.JSON_STORE_KEY);

        return { success: true, count: items.length };
      } catch (e: any) {
        throw new Error(`Dismiss Failed: ${e.message}`);
      }
    });
  },

  revertRecruitDismissal(ids: string[]): any {
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
        
        let removedCount = 0;
        for (let rowIndex = rawEVT.length - 1; rowIndex >= 1; rowIndex--) {
          const tag = String(rawEVT[rowIndex][0]).toUpperCase().trim();
          if (tagsToUndo.has(tag)) {
            evtSheet.deleteRow(rowIndex + 1);
            removedCount++;
          }
        }

        if (removedCount > 0) {
          SpreadsheetApp.flush();
          Registry.Services.Store.cache.remove(CONFIG.SYSTEM.JSON_STORE_KEY);
        }

        return { success: true, count: removedCount };
      } catch (e: any) {
        throw new Error(`Undismiss Failed: ${e.message}`);
      }
    });
  },

  persistWebAppDataPayload(): string {
    return Registry.Services.Core.executeSafely("PAYLOAD_GEN", () => {
      return this._generatePayloadInternal();
    });
  },

  getMembers(): any[] {
    const remoteData = Registry.Services.Network.fetchPublicJson("members");
    if (remoteData) return remoteData as any[];

    console.info("WebappController: getMembers: Using local GAS fallback (remote unavailable).");
    const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
    const data = Registry.Services.Network.fetchRoyaleAPIOne(
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}`,
    );

    if (!data || !data.memberList) {
      console.warn("WebappController: getMembers: No data returned from Clash Royale API.");
      return [];
    }

    return data.memberList.map((m: any) => ({
      tag: m.tag,
      name: m.name,
      role: formatRole(m.role),
      kingLevel: m.expLevel,
      donations: m.donations,
      donationsReceived: m.donationsReceived,
    }));
  },

  getPlayerProfile(tag: string): any {
    const cleanTag = encodeURIComponent(tag.startsWith("#") ? tag : `#${tag}`);
    const data = Registry.Services.Network.fetchRoyaleAPIOne(
      `${CONFIG.SYSTEM.API_BASE}/players/${cleanTag}`,
    );

    if (!data) {
      throw new Error(`Player ${tag} not found`);
    }

    return data;
  },

  retrieveWarLogEntries(): any[] {
    const remoteData = Registry.Services.Network.fetchPublicJson("warlog");
    if (remoteData) return remoteData as any[];

    console.info("WebappController: getWarLog: Using local GAS fallback (remote unavailable).");
    const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
    const data = Registry.Services.Network.fetchRoyaleAPIOne(
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/riverracelog?limit=52&__t=${new Date().getTime()}`,
    );

    if (!data || !data.items) {
      console.warn("WebappController: getWarLog: No data returned from Clash Royale API.");
      return [];
    }

    return data.items.map((warLogEntry: any) => {
      let myStanding: any = null;
      let opponents: any[] = [];

      if (warLogEntry.standings) {
        myStanding = warLogEntry.standings.find(
          (s: any) => s.clan.tag === CONFIG.SYSTEM.CLAN_TAG,
        );
        opponents = warLogEntry.standings.filter(
          (s: any) => s.clan.tag !== CONFIG.SYSTEM.CLAN_TAG,
        );
      }

      const myFame = myStanding ? myStanding.clan.fame : 0;
      const myRank = myStanding ? myStanding.rank : null;
      const bestRival = opponents.sort((a, b) => b.clan.fame - a.clan.fame)[0];

      let result: "win" | "lose" | "n/a" = "lose";
      if (myRank === 1) result = "win";
      if (myRank === null) result = "n/a";

      return {
        result,
        endTime: parseCRDateISO(warLogEntry.createdDate),
        opponent: bestRival ? bestRival.clan.name : "No Opponent",
        teamSize: 50,
        score: myFame,
        opponentScore: bestRival ? bestRival.clan.fame : 0,
      };
    });
  },

  _generatePayloadInternal(): string {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const ssId = ss.getId();
      Registry.Services.Schema.bootDynamicSchema();

      const lbResult = extractSheetDataStrict(ss, CONFIG.SHEETS.ROSTER, "lb");
      const hhResult = extractSheetDataStrict(ss, CONFIG.SHEETS.HH, "hh");

      const exclusionSet = new Set<string>();

      try {
        // @ts-ignore
        const blResponse = Sheets.Spreadsheets.Values.get(ssId, `'${CONFIG.SHEETS.BL}'!A:B`);
        const rawBL = blResponse.values || [];
        const now = Date.now();
        rawBL.forEach((blacklistRow: any) => {
          const tag = String(blacklistRow[0] || "").toUpperCase().trim();
          const expiry = Number(blacklistRow[1]) || 0;
          if (tag && expiry > now) exclusionSet.add(tag);
        });
      } catch (e) {}

      try {
        // @ts-ignore
        const evtResponse = Sheets.Spreadsheets.Values.get(ssId, `'${CONFIG.SHEETS.EVT}'!A:A`);
        const rawEVT = evtResponse.values || [];
        rawEVT.forEach((eventRow: any, rowIndex: number) => {
          if (rowIndex === 0) return;
          const tag = String(eventRow[0] || "").toUpperCase().trim();
          if (tag) exclusionSet.add(tag);
        });
      } catch (e) {}

      // --- 3. MERGE HEADHUNTER POOL (Sheets + Queue) ---
      // [OCD] 100-Recruit Fresh Pool Strategy:
      // We aim to provide a "Infinite Scroll" feel by merging the main HH sheet
      // with the latest discoveries from the worker (HH_QUEUE).
      const hhSchema = (hhResult as any).schema as string[];
      const tagIdx = hhSchema.indexOf("id");
      const scoreIdx = hhSchema.indexOf("potentialRawScore");

      const hhSheetRows = (hhResult as any).rows as any[][];

      // Reuse ss from outer scope (Line 330)
      const queueRecruits = Registry.Services.HeadhunterStore.loadQueue(ss);
      
      // De-duplication Map: Prefer HH Sheet rows over Queue discoveries.
      const recruitPoolMap = new Map<string, any[]>();

      // A. Populate with main sheet findings
      hhSheetRows.forEach((row) => {
        const tag = String(row[tagIdx]).toUpperCase();
        if (!exclusionSet.has("#" + tag)) {
          recruitPoolMap.set(tag, row);
        }
      });

      // B. Inject worker findings from Queue (if not already present or if we need more)
      queueRecruits.forEach((recruit: Recruit, tagWithHash: string) => {
        const tag = tagWithHash.replace("#", "").toUpperCase();
        if (!recruitPoolMap.has(tag) && !exclusionSet.has("#" + tag)) {
          // Map Recruit object to Schema-Aware matrix format.
          const mappedRow = new Array(hhSchema.length).fill(null);
          
          const recruitData: Record<string, any> = {
            id: tag,
            n: recruit.name,
            t: recruit.trophies,
            potentialScore: recruit.potentialScore || 0,
            potentialRawScore: recruit.rawScore || 0,
            don: recruit.donations,
            war: recruit.war,
            cards: recruit.cards,
            ago: recruit.foundDate.toISOString(),
            lastScan: recruit.lastScan ? new Date(recruit.lastScan).toISOString() : ""
          };

          hhSchema.forEach((key, idx) => {
            if (recruitData[key] !== undefined) {
              mappedRow[idx] = recruitData[key];
            }
          });
          
          recruitPoolMap.set(tag, mappedRow);
        }
      });

      // C. Sort by Raw Score (descending) and truncate to 100.
      const consolidatedPool = Array.from(recruitPoolMap.values())
        .sort((a, b) => (Number(b[scoreIdx]) || 0) - (Number(a[scoreIdx]) || 0))
        .slice(0, 100);

      const dataPayload = {
        format: "matrix",
        schema: { lb: lbResult.schema, hh: hhResult.schema },
        lb: lbResult.rows,
        hh: consolidatedPool,
        playerTag: (CONFIG.SYSTEM.PLAYER_TAG || "").replace("#", "").trim(),
        timestamp: new Date().getTime(),
      };

      const fullPayload = { success: true, data: dataPayload, error: null };
      const payloadStr = JSON.stringify(fullPayload);

      Registry.Services.Store.cache.putLarge(CONFIG.SYSTEM.JSON_STORE_KEY, payloadStr, 600);
      Registry.Services.Store.props.set("LAST_PAYLOAD_TIMESTAMP", String(dataPayload.timestamp));

      return payloadStr;
    } catch (e: any) {
      console.error(`[API] _generatePayloadInternal FAILED: ${e.stack}`);
      return JSON.stringify({ success: false, data: null, error: { code: "PAYLOAD_REFRESH_FAILED", message: e.message } });
    }
  }
};

export default WebappController;


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

  for (let rowIndex = 0; rowIndex < vals.length; rowIndex++) {
    const rowRaw = vals[rowIndex];

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

        const cellValue = rowRaw[m.col];

        switch (m.type) {
          case "tag":
            // Normalize tags for the PWA (No # prefix, Uppercase).
            return String(cellValue || "").replace("#", "").trim().toUpperCase();
          case "num":
            return sanitizeNum(cellValue, "");
          case "rate":
            // Performance Optimization: Manual percentage formatting.
            // Using getDisplayValues() on the sheet is significantly slower (10x+)
            // than getValues() + manual JS parsing because it forces the
            // spreadsheet engine to calculate formatting for every cell.
            if (cellValue === null || cellValue === undefined || cellValue === "") return "0%";
            if (typeof cellValue === "number") {
                if (cellValue <= 1.0) return `${Math.round(cellValue * 100)}%`;
                return `${Math.round(cellValue)}%`;
            }
            const sVal = String(cellValue);
            if (sVal.toUpperCase().includes("N/A")) return "N/A";
            if (sVal.includes("%")) return sVal.trim();
            const n = parseFloat(sVal);
            return isNaN(n) ? "0%" : `${Math.round(n * 100)}%`;
          case "date":
            const dateObj = Registry.Services.Time.parseFlexibleDate(cellValue);
            if (isNaN(dateObj.getTime()) || dateObj.getTime() <= 0) {
                return cellValue ? String(cellValue) : "";
            }
            return dateObj.toISOString();
          case "str":
          default:
            const s = cellValue === null || cellValue === undefined ? "" : String(cellValue);
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
 * HELPERS
 */
const formatRole = (role: string): string =>
  (({ leader: "Leader", coLeader: "Co-Leader", elder: "Elder" }) as any)[
    role
  ] || "Member";

function parseCRDateISO(dateString: string): string {
  if (!dateString) return new Date().toISOString().split("T")[0];
  const d = new Date(
    dateString.replace(
      /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2}).*/,
      "$1-$2-$3T$4:$5:$6Z",
    ),
  );
  return Registry.Services.Time.formatDate(d);
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, {
    getWebAppData: WebappController.getWebAppData.bind(WebappController),
    markRecruitsAsInvitedBulk: WebappController.updateRecruitInvitationStatus.bind(WebappController),
    undismissRecruitsBulk: WebappController.revertRecruitDismissal.bind(WebappController),
    refreshWebPayload: WebappController.persistWebAppDataPayload.bind(WebappController),
    getMembers: WebappController.getMembers.bind(WebappController),
    getPlayerProfile: WebappController.getPlayerProfile.bind(WebappController),
    getWarLog: WebappController.retrieveWarLogEntries.bind(WebappController),
    VER_CONTROLLER_WEBAPP,
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));
