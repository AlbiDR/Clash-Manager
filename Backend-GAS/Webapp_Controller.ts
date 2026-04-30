// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * WEBAPP CONTROLLER (Layer 3)
 * ----------------------------------------------------------------------------
 * Rationale: Orchestration layer for the JSON REST API and spreadsheet state.
 * Features: Matrix Inflation Support, 100-Recruit Pool, Multi-Source Merging.
 * ----------------------------------------------------------------------------
 *
 * @remarks
 * The `WebappController` acts as a Layer 3 Feature Orchestrator within the
 * CleanStack Architecture (Section III). It bridges the gap between the
 * Spreadsheet (Dumb Store) and the PWA's requirements for high-performance,
 * low-bandwidth data.
 *
 * **Architectural Context:**
 * - **Layer:** Layer 3 (@features)
 * - **Responsibility:** Data aggregation, matrix transformation, and state persistence.
 * - **Import Boundaries:** May import from Layer 1 (@core) and Layer 2 (@shared).
 *   Imports from UI layers (Views/Components) are strictly forbidden.
 */

import type { AppConfig } from "./Configuration";
import type { RegistryContract } from "./Registry";
import type { Recruit } from "./Headhunter_Types";
import * as v from "valibot";
import {
  DismissRecruitsPayloadSchema,
  UndismissRecruitsPayloadSchema,
  RoyalePlayerSchema,
  RoyaleClanSchema,
  RoyaleWarLogResponseSchema
} from "./Validation";

// Global Version Constant
// @ts-ignore
// HARDEN: Unified versioning prevents false-negative health check failures.
const VER_CONTROLLER_WEBAPP = "13.1.2";

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
  rows: unknown[][];
}

/**
 * APPLICATION PAYLOAD
 * The global response envelope for the PWA.
 *
 * @remarks
 * // DECISION LOG: Matrix Reduction Strategy
 *
 * Rationale: Minimizes JSON overhead for high-latency mobile networks.
 *
 * Pattern:
 * 1. Single Schema: Column keys are declared once in the `schema` object.
 * 2. 2D Matrix: Rows are sent as primitive arrays (no repeated keys).
 * 3. Client Inflation: The PWA inflates these values based on the schema index.
 * 4. Savings: Reduces payload size by ~40% (up to 70% for large datasets).
 */
export interface AppPayload {
  success: boolean;
  data: {
    format: string;
    schema: {
      lb: string[];
      hh: string[];
    };
    lb: unknown[][];
    hh: unknown[][];
    playerTag: string;
    timestamp: number;
  } | null;
  error: { code: string; message: string } | null;
}

/**
 * WEBAPP CONTROLLER CONTRACT
 *
 * @remarks
 * Defines the authoritative interface for the project's REST API.
 * Methods focus on data retrieval, state mutation (recruitment),
 * and payload generation for the PWA.
 */
export interface WebappControllerContract {
  /**
   * Retrieves the current application data payload.
   *
   * @param forceRefresh - If true, bypasses the cache and regenerates the payload.
   * @returns A serialized JSON string containing the WebAppData matrix.
   */
  getWebAppData(forceRefresh: boolean): string;

  /**
   * Updates the invitation status for recruits (Dismissal).
   *
   * @remarks
   * Implements a "Write-Ahead" pattern by appending dismissal events to the EVT sheet.
   *
   * @param payload - Validated DismissRecruitsPayload containing recruit IDs and scores.
   * @returns Execution result with success status and processed count.
   */
  updateRecruitInvitationStatus(payload: unknown): {
    success: boolean;
    count: number;
    error?: string;
  };

  /**
   * Reverts a previous recruit dismissal (Undismiss).
   *
   * @param payload - Validated UndismissRecruitsPayload containing recruit IDs.
   * @returns Execution result with success status and removed count.
   */
  revertRecruitDismissal(payload: unknown): {
    success: boolean;
    count: number;
    error?: string;
  };

  /**
   * Forces the regeneration and persistence of the application data payload.
   *
   * @returns The newly generated serialized JSON string.
   */
  persistWebAppDataPayload(): string;

  /**
   * Fetches the current clan member list.
   *
   * @remarks
   * Attempts to use the Public Worker Hub as a primary source, falling back
   * to direct RoyaleAPI calls if the Hub is unavailable.
   *
   * @returns Array of raw member objects.
   */
  getMembers(): unknown[];

  /**
   * Retrieves a detailed player profile for a specific tag.
   *
   * @param tag - The Supercell player tag (e.g., "#PR20C8RR").
   * @returns Validated RoyalePlayer object.
   * @throws Error if the player is not found or validation fails.
   */
  getPlayerProfile(tag: string): unknown;

  /**
   * Retrieves the historical war log entries for the clan.
   *
   * @returns Array of formatted war log objects.
   */
  retrieveWarLogEntries(): unknown[];

  /**
   * [INTERNAL] The core engine for matrix payload generation.
   *
   * @remarks
   * Orchestrates data extraction, multi-source merging (Sheets + Worker Queue),
   * and 100-recruit pool compilation.
   *
   * @returns Serialized JSON string of the WebAppData.
   */
  _generatePayloadInternal(): string;
}

/**
 * WEBAPP CONTROLLER
 *
 * @remarks
 * Implements the WebappControllerContract. Orchestrates the flow of data
 * between the GAS Spreadsheet environment and the JSON REST API.
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
    } catch (apiError: any) {
      console.error(`[API] getWebAppData CRITICAL FAILURE: ${apiError.stack}`);
      return JSON.stringify({
        success: false,
        data: null,
        error: {
          code: "PAYLOAD_GENERATION_FAILED",
          message: `Unable to generate data payload. ${apiError.message || 'Unknown error'}.`,
        },
      });
    }
  },

  updateRecruitInvitationStatus(payload: unknown): { success: boolean; count: number; error?: string } {
    // [GUARD] VALIDATION BOUNDARY: Target B [1]
    // THREAT: Malformed recruitment event data causing spreadsheet corruption.
    const validation = v.safeParse(DismissRecruitsPayloadSchema, payload);
    if (!validation.success) {
      console.warn("[API] updateRecruitInvitationStatus: Validation failed", validation.issues);
      return { success: false, count: 0, error: "Invalid payload structure" };
    }

    const { items } = validation.output;
    if (!items || items.length === 0) return { success: true, count: 0 };

    return Registry.Services.Core.executeSafely("WRITE_HH_EVT", () => {
      try {
        const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        const ssId = activeSpreadsheet.getId();
        
        let evtSheet = activeSpreadsheet.getSheetByName(CONFIG.SHEETS.EVT);
        if (!evtSheet) {
          evtSheet = activeSpreadsheet.insertSheet(CONFIG.SHEETS.EVT);
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
          const item = typeof dismissalPayload === "string" ? { id: dismissalPayload, score: 0 } : dismissalPayload;
          const id = (item.id.startsWith("#") ? item.id : "#" + item.id).toUpperCase();
          let score = scoreMap.get(id);
          // @ts-ignore
          if (score === undefined) score = Number(item.score || item.potentialRawScore || item.rawScore) || 0;
          return [id, now, score];
        });

        if (values.length > 0) {
          // @ts-ignore
          Sheets.Spreadsheets.Values.append({ values }, ssId, `'${CONFIG.SHEETS.EVT}'!A1`, { valueInputOption: "USER_ENTERED" });
        }

        SpreadsheetApp.flush();
        Registry.Services.Store.cache.remove(CONFIG.SYSTEM.JSON_STORE_KEY);

        return { success: true, count: items.length };
      } catch (apiError: any) {
        throw new Error(`Dismiss Failed: ${apiError.message}`);
      }
    });
  },

  revertRecruitDismissal(payload: unknown): { success: boolean; count: number; error?: string } {
    // [GUARD] VALIDATION BOUNDARY: Target B [1]
    // THREAT: Malformed undismiss IDs causing incorrect spreadsheet deletions.
    const validation = v.safeParse(UndismissRecruitsPayloadSchema, payload);
    if (!validation.success) {
      console.warn("[API] revertRecruitDismissal: Validation failed", validation.issues);
      return { success: false, count: 0, error: "Invalid payload structure" };
    }

    const { ids } = validation.output;
    if (!ids || ids.length === 0) return { success: true, count: 0 };

    return Registry.Services.Core.executeSafely("REVERSE_HH_EVT", () => {
      try {
        const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
        const evtSheet = activeSpreadsheet.getSheetByName(CONFIG.SHEETS.EVT);
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
      } catch (apiError: any) {
        throw new Error(`Undismiss Failed: ${apiError.message}`);
      }
    });
  },

  persistWebAppDataPayload(): string {
    return Registry.Services.Core.executeSafely("PAYLOAD_GEN", () => {
      return this._generatePayloadInternal();
    });
  },

  getMembers(): unknown[] {
    const remoteData = Registry.Services.Network.fetchPublicJson("members");
    if (remoteData) return remoteData as unknown[];

    console.info("WebappController: getMembers: Using local GAS fallback (remote unavailable).");
    const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
    const rawClanData = Registry.Services.Network.fetchRoyaleAPIOne(
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}`,
    );

    if (!rawClanData) {
      console.warn("WebappController: getMembers: No data returned from Clash Royale API.");
      return [];
    }

    // [GUARD] VALIDATION BOUNDARY: Target B [1]
    // THREAT: Malformed clan data causing downstream UI crashes or pathogens.
    // Rationale: Validate the local fallback response before processing.
    const validation = v.safeParse(RoyaleClanSchema, rawClanData);
    if (!validation.success) {
      console.warn("[WebappController] Clan validation failed for getMembers", validation.issues);
      return [];
    }

    const clanData = validation.output;

    return clanData.memberList.map((memberCandidate) => ({
      tag: memberCandidate.tag,
      name: memberCandidate.name,
      role: formatRole(memberCandidate.role),
      kingLevel: memberCandidate.expLevel,
      donations: memberCandidate.donations,
      donationsReceived: memberCandidate.donationsReceived,
    }));
  },

  getPlayerProfile(tag: string): unknown {
    const encodedPlayerTag = encodeURIComponent(tag.startsWith("#") ? tag : `#${tag}`);
    const rawProfile = Registry.Services.Network.fetchRoyaleAPIOne(
      `${CONFIG.SYSTEM.API_BASE}/players/${encodedPlayerTag}`,
    );

    if (!rawProfile) {
      throw new Error(`Player ${tag} not found`);
    }

    // [GUARD] VALIDATION BOUNDARY: Target B [1]
    // THREAT: Malformed player profile data causing downstream runtime failures.
    // Rationale: Establishing a strict validation boundary for external API data
    // ensures only valid player profiles enter the Clean Stack.
    return v.parse(RoyalePlayerSchema, rawProfile);
  },

  retrieveWarLogEntries(): unknown[] {
    const remoteData = Registry.Services.Network.fetchPublicJson("warlog");
    if (remoteData) return remoteData as unknown[];

    console.info("WebappController: getWarLog: Using local GAS fallback (remote unavailable).");
    const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
    const rawWarLog = Registry.Services.Network.fetchRoyaleAPIOne(
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/riverracelog?limit=52&__t=${new Date().getTime()}`,
    );

    if (!rawWarLog) {
      console.warn("WebappController: getWarLog: No data returned from Clash Royale API.");
      return [];
    }

    // [GUARD] VALIDATION BOUNDARY: Target B [1]
    // THREAT: Corrupt war log data polluting clan historical records.
    // Rationale: Enforce strict validation boundary for Royale API data.
    const validation = v.safeParse(RoyaleWarLogResponseSchema, rawWarLog);
    if (!validation.success) {
      console.warn("[WebappController] War Log validation failed", validation.issues);
      return [];
    }

    const warLogData = validation.output;

    const myClanTag = (CONFIG.SYSTEM.CLAN_TAG.startsWith("#") ? CONFIG.SYSTEM.CLAN_TAG : "#" + CONFIG.SYSTEM.CLAN_TAG).toUpperCase();

    return warLogData.items.map((warLogEntry) => {
      const standings = warLogEntry.standings || [];
      const myStanding = standings.find(
        (standingEntry) => standingEntry.clan.tag.toUpperCase() === myClanTag,
      );
      const opponents = standings.filter(
        (standingEntry) => standingEntry.clan.tag.toUpperCase() !== myClanTag,
      );

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
      const activeSpreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      const ssId = activeSpreadsheet.getId();
      Registry.Services.Schema.bootDynamicSchema();

      // THREAT: Corrupt matrix data from GAS sheets causing PWA hydration failure.
      // Target B [1]: Enforce strict extraction boundary for roster and headhunter data.
      const lbResult = extractSheetDataStrict(activeSpreadsheet, CONFIG.SHEETS.ROSTER, "lb");
      const hhResult = extractSheetDataStrict(activeSpreadsheet, CONFIG.SHEETS.HH, "hh");

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
      } catch (extractionError) {}

      try {
        // @ts-ignore
        const evtResponse = Sheets.Spreadsheets.Values.get(ssId, `'${CONFIG.SHEETS.EVT}'!A:A`);
        const rawEVT = evtResponse.values || [];
        rawEVT.forEach((eventRow: any, rowIndex: number) => {
          if (rowIndex === 0) return;
          const tag = String(eventRow[0] || "").toUpperCase().trim();
          if (tag) exclusionSet.add(tag);
        });
      } catch (extractionError) {}

      // --- 3. MERGE HEADHUNTER POOL (Sheets + Queue) ---
      /**
       * // DECISION LOG: 100-Recruit Fresh Pool Strategy
       *
       * Rationale: Provides an "Infinite Scroll" feel by merging the main HH sheet
       * findings with the latest discoveries from the worker queue.
       *
       * Strategy:
       * 1. De-duplicate: Prefer manually audited spreadsheet rows over raw worker findings.
       * 2. Windowing: Compile 100 recruits (Top 50 active + 50 backup).
       * 3. Continuity: As recruits are dismissed in the PWA, the "backup" recruits
       *    automatically slide into the active view without requiring a full sheet update.
       */
      const hhSchema = hhResult.schema;
      const tagIdx = hhSchema.indexOf("id");
      const scoreIdx = hhSchema.indexOf("potentialRawScore");

      const hhSheetRows = hhResult.rows;

      // Reuse activeSpreadsheet from outer scope (Line 330)
      const queueRecruits = Registry.Services.HeadhunterStore.loadQueue(activeSpreadsheet);
      
      // De-duplication Map: Prefer HH Sheet rows over Queue discoveries.
      const recruitPoolMap = new Map<string, unknown[]>();

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
    } catch (apiError: any) {
      console.error(`[API] _generatePayloadInternal FAILED: ${apiError.stack}`);
      return JSON.stringify({ success: false, data: null, error: { code: "PAYLOAD_REFRESH_FAILED", message: apiError.message } });
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
 * @param activeSpreadsheet - Active Spreadsheet instance.
 * @param sheetName - Target sheet to extract.
 * @param type - 'lb' (Leaderboard) or 'hh' (Headhunter) to determine schema.
 * @returns Parsed SheetDataResult.
 * @warning Consumes SpreadsheetApp quota for data range retrieval.
 */
/**
 * THREAT: Spreadsheet data exfiltration or malformed matrix ingestion.
 * Rationale: This function serves as the primary boundary between the untrusted
 * spreadsheet environment and the CleanStack API.
 */
function extractSheetDataStrict(
  activeSpreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  sheetName: string,
  type: "lb" | "hh",
): SheetDataResult {
  const sheet = activeSpreadsheet.getSheetByName(sheetName);
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
  const rawSheetValues = sheet.getRange(startRow, 2, numRows, safeNumCols).getValues();
  const rows: unknown[][] = [];

  for (let rowIndex = 0; rowIndex < rawSheetValues.length; rowIndex++) {
    const rawRowData = rawSheetValues[rowIndex];

    if (!Array.isArray(rawRowData)) continue;

    const tagRaw = String(rawRowData[S.TAG] || "").trim();
    // Validate tag: Minimum 3 characters to exclude empty or corrupted rows.
    if (!tagRaw || tagRaw.length < 3) continue;

    if (type === "hh") {
      // In Headhunter mode, we skip recruits already marked as "Invited"
      // in the sheet to prevent UI clutter.
      const invitedVal = rawRowData[S.INVITED];
      const isInvited =
        invitedVal === true || String(invitedVal).toUpperCase() === "TRUE";
      if (isInvited) continue;
    }

    const outputRow = mapping
      .map((mappingEntry) => {
        // "bool_check" columns are control-only (e.g. checkbox for invitation).
        // They are excluded from the "Matrix" data payload to reduce size.
        if (mappingEntry.type === "bool_check") return null;

        if (mappingEntry.col >= rawRowData.length) return mappingEntry.type === "num" ? 0 : "";

        const cellValue = rawRowData[mappingEntry.col];

        switch (mappingEntry.type) {
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
            const parsedNumber = parseFloat(sVal);
            return isNaN(parsedNumber) ? "0%" : `${Math.round(parsedNumber * 100)}%`;
          case "date":
            const dateObj = Registry.Services.Time.parseFlexibleDate(cellValue);
            if (isNaN(dateObj.getTime()) || dateObj.getTime() <= 0) {
                return cellValue ? String(cellValue) : "";
            }
            return dateObj.toISOString();
          case "str":
          default:
            const formulaContent = cellValue === null || cellValue === undefined ? "" : String(cellValue);
            // [GUARD] FORMULA STRIPPING:
            // THREAT: Spreadsheet formula exfiltration or malformed JSON artifacts.
            // Extract URL from =HYPERLINK("url", "label") artifacts to ensure
            // the JSON API returns raw data instead of spreadsheet formulas.
            if (formulaContent.startsWith("=")) {
              return formulaContent.replace(/^=HYPERLINK.*"(.*)".*$/, "$1");
            }
            return formulaContent.trim();
        }
      })
      .filter((filteredValue) => filteredValue !== null);

    rows.push(outputRow);
  }

  return {
    schema: mapping.filter((mappingEntry) => mappingEntry.type !== "bool_check").map((mappingEntry) => mappingEntry.key),
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
 * THREAT: Malformed numeric strings (e.g., "1,000", "10%") causing NaN or runtime errors.
 * Rationale: Defense-in-depth ensures that data entering the PWA is already sanitized.
 *
 * @param inputValue - Raw value from spreadsheet.
 * @param displayV - (Legacy) Original display value. Deprecated in v11.0.
 * @returns Cleaned numeric value.
 */
function sanitizeNum(inputValue: unknown, displayV: string): number {
  if (inputValue === null || inputValue === undefined) return 0;
  if (typeof inputValue === "number") return inputValue;
  const stringifiedValue = String(inputValue).replace(/,/g, "").replace(/%/g, "").trim();
  if (stringifiedValue.toUpperCase() === "N/A") return 0;
  const parsedNumber = parseFloat(stringifiedValue);
  if (isNaN(parsedNumber)) return 0;
  return parsedNumber;
}

/**
 * HELPERS
 */
const formatRole = (role: string): string => {
  const roleMap: Record<string, string> = { leader: "Leader", coLeader: "Co-Leader", elder: "Elder" };
  return roleMap[role] || "Member";
};

function parseCRDateISO(dateString: string): string {
  if (!dateString) return new Date().toISOString().split("T")[0];
  const parsedDate = new Date(
    dateString.replace(
      /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2}).*/,
      "$1-$2-$3T$4:$5:$6Z",
    ),
  );
  return Registry.Services.Time.formatDate(parsedDate);
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
