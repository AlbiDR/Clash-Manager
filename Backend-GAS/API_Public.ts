
/**
 * ============================================================================
 * MODULE: API_PUBLIC - TypeScript Edition
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Pure JSON REST API for the Vue 3 PWA frontend.
 * VERSION: 13.1.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { RegistryContract } from "./Registry";
import * as v from "valibot";
import {
  DismissRecruitsPayloadSchema,
  UndismissRecruitsPayloadSchema,
  TriggerUpdatePayloadSchema,
  PlayerProfilePayloadSchema,
  LoggerPayloadSchema,
  BaseActionSchema
} from "./Validation";
import { doGetRawFeed } from "./API_Raw";

// Global Version Constant
// @ts-ignore
const VER_API_PUBLIC = "13.1.0";

declare var SpreadsheetApp: any;
declare var LockService: any;
declare var PropertiesService: any;
declare var UrlFetchApp: any;
declare var CacheService: any;
declare var ContentService: any;
declare var Utilities: any;
declare var ScriptApp: any;
declare var Logger: any;
declare var Sheets: any;
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

// Redundant declarations removed - routed via Registry.Services.WebappController


// Module Version Constants
declare const VER_CONFIGURATION: string;
declare const VER_CONTROLLER_WEBAPP: string;
declare const VER_REGISTRY: string;
declare const VER_ROSTER: string;
declare const VER_DATABASE: string;
declare const VER_HEADHUNTER: string;
declare const VER_SCORING: string;
declare const VER_ORCHESTRATOR: string;
declare const VER_VALIDATION: string;

/**
 * API INTERFACES
 */
export interface ApiResponseEnvelope<T = any> {
  status: "success" | "error";
  data: T | null;
  error: { code: string; message: string | null } | null;
  timestamp: string;
}


export interface WarLogEntry {
  result: "win" | "lose" | "n/a";
  endTime: string;
  opponent: string;
  teamSize: number;
  score: number;
  opponentScore: number;
}

/**
 * GET Handler
 */
function doGet(
  e: GoogleAppsScript.Events.DoGet,
): GoogleAppsScript.Content.TextOutput {
  return handleRequest(e, "GET");
}

function handleRequest(e: GoogleAppsScript.Events.DoGet | GoogleAppsScript.Events.DoPost, method: "GET" | "POST"): GoogleAppsScript.Content.TextOutput {
  try {
    // THREAT: Manual validation (Target B [4]).
    // Rationale: Using BaseActionSchema ensures the action is always safely extracted
    // and validated against a schema before processing.
    const actionResult = v.safeParse(BaseActionSchema, e?.parameter || {});
    const action = (actionResult.success ? actionResult.output.action || "" : "").toLowerCase().trim();

    if (!action) {
      return respond(null, "MISSING_ACTION", "Request parameter 'action' is required.");
    }

    switch (action) {
      case "ping":
        // OPTIMIZATION: Check cache first to avoid slow SpreadsheetApp load
        const cachedPing = Registry.Services.Store.cache.getLarge("PING_METADATA_V2");
        if (cachedPing) {
           return respondRaw(cachedPing);
        }

        // Cache Miss: Perform full API load (Fast)
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const ssId = ss.getId();
        const ssUrl = ss.getUrl();
        const ssMeta = Sheets.Spreadsheets!.get(ssId, { fields: "sheets(properties(title,sheetId))" });
        const sheetsMap: Record<string, number> = {};
        
        if (ssMeta && ssMeta.sheets) {
          ssMeta.sheets.forEach((s: any) => {
            if (s.properties) sheetsMap[s.properties.title] = s.properties.sheetId;
          });
        }

        const pingResponse = {
          status: "success",
          data: {
             version: VER_API_PUBLIC,
             status: "online",
             scriptId: ScriptApp.getScriptId(),
             spreadsheetUrl: ssUrl,
             sheets: sheetsMap,
             modules: getModuleVersions(),
          },
          error: null,
          timestamp: new Date().toISOString()
        };
        
        const pingStr = JSON.stringify(pingResponse);
        Registry.Services.Store.cache.putLarge("PING_METADATA_V2", pingStr, 3600); // Cache for 1 hour
        return respondRaw(pingStr);

      case "getleaderboard":
      case "getwebappdata":
        return respondRaw(Registry.Services.WebappController.getWebAppData(false));

      case "raw":
        return doGetRawFeed(e);

      case "getrecruits":
        const recruitData = Registry.Services.WebappController.getWebAppData(false);
        const parsed = JSON.parse(recruitData);
        if (parsed.status === "success" && parsed.data) {
          return respond({
            hh: parsed.data.hh,
            timestamp: parsed.data.timestamp,
          });
        }
        return respond(null, "NO_DATA", "Recruit data not available");

      case "getmembers":
        return respond(Registry.Services.WebappController.getMembers());

      case "getplayerprofile": {
        // THREAT: Unvalidated external parameters (Target B [1]).
        // Rationale: Enforce [VALIDATION] boundary for player tags. Manual String/trim
        // checks are replaced with PlayerProfilePayloadSchema to ensure data integrity.
        const valRes = v.safeParse(PlayerProfilePayloadSchema, { ...e?.parameter, action });
        if (!valRes.success) {
           return respond(null, "VALIDATION_ERROR", "Parameter 'tag' is required and must be valid.");
        }
        return respond(Registry.Services.WebappController.getPlayerProfile(valRes.output.tag));
      }

      case "getwarlog":
        return respond(Registry.Services.WebappController.retrieveWarLogEntries());

      case "refresh":
        return respondRaw(Registry.Services.WebappController.getWebAppData(true));

      case "log": {
        const result = v.safeParse(LoggerPayloadSchema, { ...e?.parameter, action });
        if (!result.success) return respond(null, "VALIDATION_ERROR", "Invalid log payload.");
        const { level = "INFO", message = "No message provided", context = "" } = result.output;
        
        Logger.log(`[FE_${level.toUpperCase()}] ${message} ${context}`);
        return respond({ logged: true });
      }

      default:
        return respond(null, "INVALID_ACTION", `Unknown action: "${action}". Valid actions: ping, getwebappdata, refresh, log.`);
    }
  } catch (err: any) {
    console.error(`API: ${method} Handler ERROR: ${err.stack}`);
    return respond(null, "SERVER_ERROR", `Internal server error: ${err.message}`);
  }
}

/**
 * POST Handler
 */
function doPost(
  e: GoogleAppsScript.Events.DoPost,
): GoogleAppsScript.Content.TextOutput {
  try {
    const body = e?.postData?.contents;
    let rawPayload: Record<string, unknown> = {};
    if (body) {
      try {
        rawPayload = JSON.parse(body);
      } catch (parseErr: any) {
        return respond(null, "PARSE_ERROR", `Invalid JSON: ${parseErr.message}`);
      }
    }

    // THREAT: Manual validation and "any Plague" (Target B [4]).
    // Rationale: Extracting action via schema ensures consistency between URL params
    // and POST body while eliminating unvalidated 'any' lookups.
    const actionResult = v.safeParse(BaseActionSchema, { ...e?.parameter, ...rawPayload });
    const action = (actionResult.success ? actionResult.output.action || "" : "").toLowerCase().trim();

    switch (action) {
      case "dismissrecruits": {
        const valRes = v.safeParse(DismissRecruitsPayloadSchema, rawPayload);
        if (!valRes.success) return respond(null, "VALIDATION_ERROR", `Invalid payload structure.`);
        const payload = valRes.output;

        // [GUARD] DUAL-MODE SUPPORT: Handle both mapping formats and ensure score capture
        const rawItems = payload.items || [];
        const rawIds = payload.ids || [];
        
        // Normalize: Zip entries and prioritize score-aware objects
        const normalizedItems = (rawItems.length > 0 ? rawItems : rawIds).map(item => {
          if (typeof item === 'string') return { id: item, score: 0 };
          if (item && typeof item === 'object') {
             // [GUARD] AGGRESSIVE FALLBACK: Handle any possible naming variant from any client version
             const rawVal = item.potentialRawScore !== undefined ? item.potentialRawScore : 
                            (item.score !== undefined ? item.score : (item.rawScore || 0));
             
             // Convert to Number safely
             const score = typeof rawVal === 'number' ? rawVal : parseFloat(String(rawVal).replace(/,/g, '')) || 0;
             return { id: item.id, score: isNaN(score) ? 0 : score };
          }
          return null;
        }).filter((item): item is {id: string, score: number} => item !== null);

        if (normalizedItems.length === 0) {
           return respond(null, "INVALID_PARAMS", "Processed 0 valid items from payload.");
        }

        return respond(Registry.Services.WebappController.updateRecruitInvitationStatus(normalizedItems));
      }

      case "undismissrecruits": {
        const valRes = v.safeParse(UndismissRecruitsPayloadSchema, rawPayload);
        if (!valRes.success) {
          return respond(null, "VALIDATION_ERROR", `undismissRecruits requires "ids" string array.`);
        }
        return respond(Registry.Services.WebappController.revertRecruitDismissal(valRes.output.ids));
      }

      case "triggerupdate": {
        const valRes = v.safeParse(TriggerUpdatePayloadSchema, rawPayload);
        if (!valRes.success) return respond(null, "VALIDATION_ERROR", `triggerUpdate requires a "target" string.`);
        return respond(triggerAsyncUpdate(valRes.output.target));
      }

      case "ping":
      case "getleaderboard":
      case "getwebappdata":
      case "getrecruits":
      case "getmembers":
      case "getplayerprofile":
      case "getwarlog":
      case "refresh":
        // Delegation to handleRequest logic (which was based on doGet)
        const syntheticE = {
          ...e,
          parameter: { ...e.parameter, ...rawPayload, action: action }
        };
        return handleRequest(syntheticE as any, "POST");

      case "":
        return respond(null, "NO_ACTION", 'Missing "action" in POST body or URL');

      default:
        return respond(null, "INVALID_ACTION", `Unknown action: "${action}". Valid actions: dismissrecruits, triggerupdate, ping, getwebappdata, getplayerprofile.`);
    }
  } catch (err: any) {
    console.error(`API: doPost ERROR: ${err.stack}`);
    return respond(null, "SERVER_ERROR", `Internal server error: ${err.message}`);
  }
}

/**
 * RESPONSE UTILITIES
 */
function respond<T>(
  data: T,
  errorCode: string | null = null,
  errorMessage: string | null = null,
): GoogleAppsScript.Content.TextOutput {
  const envelope: ApiResponseEnvelope<T> = {
    status: errorCode ? "error" : "success",
    data: errorCode ? null : data,
    error: errorCode ? { code: errorCode, message: errorMessage } : null,
    timestamp: new Date().toISOString(),
  };

  return ContentService.createTextOutput(JSON.stringify(envelope)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function respondRaw(jsonString: string): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(jsonString).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function getModuleVersions(): Record<string, string> {
  const modules = [
    "API_PUBLIC",
    "CONFIGURATION",
    "CONTROLLER_WEBAPP",
    "REGISTRY",
    "ROSTER",
    "DATABASE",
    "HEADHUNTER",
    "SCORING",
    "SCORING_KERNEL",
    "ORCHESTRATOR",
    "VALIDATION",
  ];

  const versions: Record<string, string> = {};
  modules.forEach((m) => {
    // @ts-ignore
    const ver = globalThis[`VER_${m}`];
    versions[m] = typeof ver !== "undefined" ? ver : "N/A";
  });
  return versions;
}

/**
 * ASYNC UPDATE DISPATCHER
 */
function triggerAsyncUpdate(target: string | undefined): any {
  const normTarget = (target || "").toLowerCase().trim();
  const validTargets = ["members", "leaderboard", "roster", "headhunter"];

  if (!validTargets.includes(normTarget)) {
    return {
      success: false,
      error: "INVALID_TARGET",
      message: `Invalid target: "${normTarget}". Valid targets: ${validTargets.join(', ')}.`,
    };
  }

  return Registry.Services.Core.executeSafely("ASYNC_TRIGGER_QUEUE", () => {
    try {
      const cache = CacheService.getScriptCache();
      if (cache.get("SYSTEM_STATUS") === "BUSY") {
        return {
          success: false,
          status: "BUSY",
          message: "System is already processing an update.",
        };
      }

      Registry.Services.Store.props.set("PENDING_UPDATE_TARGET", normTarget);
      cache.put("SYSTEM_STATUS", "BUSY", 1200);

      ScriptApp.getProjectTriggers().forEach((t: any) => {
        if (t.getHandlerFunction() === "dispatchAsyncUpdate")
          ScriptApp.deleteTrigger(t);
      });

      ScriptApp.newTrigger("dispatchAsyncUpdate")
        .timeBased()
        .after(500)
        .create();

      console.info(`API: Async Trigger Queued: ${normTarget}`);
      return { success: true, status: "QUEUED", target: normTarget };
    } catch (e: any) {
      console.error(`API: triggerAsyncUpdate Failed: ${e.message}`);
      throw e;
    }
  });
}

function dispatchAsyncUpdate(): void {
  const target = Registry.Services.Store.props.get("PENDING_UPDATE_TARGET");
  if (!target) {
    console.warn("API: Async Dispatcher: No pending target found. Aborting.");
    return;
  }

  Registry.Services.Store.props.delete("PENDING_UPDATE_TARGET");

  Registry.Services.Core.executeSafely(`ASYNC_EXEC_${target.toUpperCase()}`, () => {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheetName = "";
      if (target === "members") sheetName = CONFIG.SHEETS.DB;
      else if (target === "leaderboard" || target === "roster") sheetName = CONFIG.SHEETS.ROSTER;
      else if (target === "headhunter") sheetName = CONFIG.SHEETS.HH;

      const sheet = ss.getSheetByName(sheetName);

      if (sheet) {
        sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL).setValue(true);
        SpreadsheetApp.flush();
      }

      if (target === "members") {
        Registry.Actions["database:synchronize"]();
        Registry.Actions["webapp:synchronize"]();
      } else if (target === "leaderboard" || target === "roster") {
        Registry.Actions["roster:synchronize"]();
        Registry.Actions["webapp:synchronize"]();
      } else if (target === "headhunter") {
        Registry.Actions["headhunter:scout"]();
      }

      if (sheet) sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL).setValue(false);

      console.info(`API: Async Execution Complete: ${target}`);
    } catch (e: any) {
      console.error(`API: Async Execution Failed [${target}]: ${e.message}`);
    } finally {
      CacheService.getScriptCache().remove("SYSTEM_STATUS");
    }
  });
}

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { doGet, doPost, dispatchAsyncUpdate, VER_API_PUBLIC });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));