
/**
 * ============================================================================
 * MODULE: API_PUBLIC - TypeScript Edition
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Pure JSON REST API for the Vue 3 PWA frontend.
 * VERSION: 11.0.1
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { IRegistry } from "./Registry";

// Global Version Constant
// @ts-ignore
const VER_API_PUBLIC = "11.0.1";

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
declare const Registry: IRegistry;

// External module functions
declare function getWebAppData(forceRefresh: boolean): string;
declare function markRecruitsAsInvitedBulk(items: Array<{ id: string, score: number }>): {
  success: boolean;
  count: number;
};
declare function undismissRecruitsBulk(ids: string[]): {
  success: boolean;
  count: number;
};
declare function updateClanDatabase(): void;
declare function updateLeaderboard(): void;
declare function scoutRecruits(): void;
declare function refreshWebPayload(): void;

// Module Version Constants
declare const VER_CONFIGURATION: string;
declare const VER_CONTROLLER_WEBAPP: string;
declare const VER_REGISTRY: string;
declare const VER_ROSTER: string;
declare const VER_DATABASE: string;
declare const VER_HEADHUNTER: string;
declare const VER_SCORING: string;
declare const VER_ORCHESTRATOR: string;

/**
 * API INTERFACES
 */
export interface ApiResponseEnvelope<T = any> {
  status: "success" | "error";
  data: T | null;
  error: { code: string; message: string | null } | null;
  timestamp: string;
}

export interface ApiRequestPayload {
  action?: string;
  ids?: string[];
  target?: string;
  [key: string]: any;
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

function handleRequest(e: any, method: "GET" | "POST"): GoogleAppsScript.Content.TextOutput {
  try {
    const action = String(e?.parameter?.action || "").toLowerCase().trim();

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
        return respondRaw(getWebAppData(false));

      case "getrecruits":
        const recruitData = getWebAppData(false);
        const parsed = JSON.parse(recruitData);
        if (parsed.status === "success" && parsed.data) {
          return respond({
            hh: parsed.data.hh,
            timestamp: parsed.data.timestamp,
          });
        }
        return respond(null, "NO_DATA", "Recruit data not available");

      case "getmembers":
        return respond(getMembers());

      case "getplayerprofile":
        const tag = String(e?.parameter?.tag || "").trim();
        if (!tag) return respond(null, "MISSING_TAG", "Parameter 'tag' is required.");
        return respond(getPlayerProfile(tag));

      case "getwarlog":
        return respond(getWarLog());

      case "refresh":
        return respondRaw(getWebAppData(true));

      case "log":
        const level = (e?.parameter?.level || "INFO").toUpperCase();
        const msg = e?.parameter?.message || "No message provided";
        const ctx = e?.parameter?.context || "";
        Logger.log(`[FE_${level}] ${msg} ${ctx}`);
        return respond({ logged: true });

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
    const actionParam = (e?.parameter?.action || "").toLowerCase().trim();
    
    const body = e?.postData?.contents;
    let payload: ApiRequestPayload = {};
    if (body) {
      try {
        payload = JSON.parse(body);
      } catch (parseErr: any) {
        return respond(null, "PARSE_ERROR", `Invalid JSON: ${parseErr.message}`);
      }
    }

    const action = (actionParam || payload.action || "").toLowerCase().trim();

    switch (action) {
      case "dismissrecruits":
        const dismissItems = payload.items || payload.ids; // Support both for transition
        if (!dismissItems || !Array.isArray(dismissItems)) {
          return respond(
            null,
            "INVALID_PARAMS",
            'dismissRecruits requires "items" or "ids" array',
          );
        }
        // Normalize: if it's an array of strings (legacy), map to objects with 0 score
        const normalizedItems = dismissItems.map(item => {
          if (typeof item === 'string') return { id: item, score: 0 };
          return item;
        });
        return respond(markRecruitsAsInvitedBulk(normalizedItems));

      case "undismissrecruits":
        const undoIds = payload.ids;
        if (!undoIds || !Array.isArray(undoIds)) {
          return respond(
            null,
            "INVALID_PARAMS",
            'undismissRecruits requires "ids" array',
          );
        }
        return respond(undismissRecruitsBulk(undoIds));

      case "triggerupdate":
        return respond(triggerAsyncUpdate(payload.target));

      case "ping":
      case "getleaderboard":
      case "getwebappdata":
      case "getrecruits":
      case "getmembers":
      case "getplayerprofile":
      case "getwarlog":
      case "refresh":
        // Delegation to handleRequest logic (which was based on doGet)
        // Merge URL parameters with the JSON payload to ensure all fields (like 'tag') are passed.
        const syntheticE = {
          ...e,
          parameter: { ...e.parameter, ...payload, action: action }
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
 * DATA FETCHERS
 */
function getMembers(): any[] {
  const remoteData = Registry.Services.Network.fetchPublicJson("members");
  if (remoteData) return remoteData as any[];

  console.info("API: getMembers: Using local GAS fallback (remote unavailable).");
  const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
  // OPTIMIZATION: Use same endpoint as Headhunter to hit shared cache
  const data = Registry.Services.Network.fetchRoyaleAPI([
    `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}`,
  ]);

  if (!data || !data[0] || !data[0].memberList) {
    console.warn("API: getMembers: No data returned from Clash Royale API.");
    return [];
  }

  return data[0].memberList.map((m: any) => ({
    tag: m.tag,
    name: m.name,
    role: formatRole(m.role),
    kingLevel: m.expLevel,
    donations: m.donations,
    donationsReceived: m.donationsReceived,
  }));
}

function getPlayerProfile(tag: string): any {
  const cleanTag = encodeURIComponent(tag.startsWith("#") ? tag : `#${tag}`);
  const data = Registry.Services.Network.fetchRoyaleAPI([
    `${CONFIG.SYSTEM.API_BASE}/players/${cleanTag}`,
  ]);

  if (!data || !data[0]) {
    throw new Error(`Player ${tag} not found`);
  }

  return data[0];
}

function getWarLog(): WarLogEntry[] {
  const remoteData = Registry.Services.Network.fetchPublicJson("warlog");
  if (remoteData) return remoteData as WarLogEntry[];

  console.info("API: getWarLog: Using local GAS fallback (remote unavailable).");
  const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
  const data = Registry.Services.Network.fetchRoyaleAPI([
    `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/riverracelog?limit=52&__t=${new Date().getTime()}`,
  ]);

  if (!data || !data[0] || !data[0].items) {
    console.warn("API: getWarLog: No data returned from Clash Royale API.");
    return [];
  }

  return data[0].items.map((r: any) => {
    let myStanding: any = null;
    let opponents: any[] = [];

    if (r.standings) {
      myStanding = r.standings.find(
        (s: any) => s.clan.tag === CONFIG.SYSTEM.CLAN_TAG,
      );
      opponents = r.standings.filter(
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
      endTime: parseCRDateISO(r.createdDate),
      opponent: bestRival ? bestRival.clan.name : "No Opponent",
      teamSize: 50,
      score: myFame,
      opponentScore: bestRival ? bestRival.clan.fame : 0,
    };
  });
}

const formatRole = (role: string): string =>
  (({ leader: "Leader", coLeader: "Co-Leader", elder: "Elder" }) as any)[
    role
  ] || "Member";

function parseCRDateISO(t: string): string {
  if (!t) return new Date().toISOString().split("T")[0];
  const d = new Date(
    t.replace(
      /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2}).*/,
      "$1-$2-$3T$4:$5:$6Z",
    ),
  );
  return Registry.Services.Time.formatDate(d);
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
        Registry.Actions["sync:database"]();
        Registry.Actions["sync:webapp"]();
      } else if (target === "leaderboard" || target === "roster") {
        Registry.Actions["sync:roster"]();
        Registry.Actions["sync:webapp"]();
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