/**
 * ============================================================================
 * 🔌 MODULE: API_PUBLIC - TypeScript Edition
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Pure JSON REST API for the Vue 3 PWA frontend.
 * 🏷️ VERSION: 11.0.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { AppUtils } from "./Utilities";

// Global Version Constant
// @ts-ignore
const VER_API_PUBLIC = "11.0.0";

// Global Declarations for GAS Environment
declare const CONFIG: AppConfig;
declare const Utils: AppUtils;

// External module functions
declare function getWebAppData(forceRefresh: boolean): string;
declare function markRecruitsAsInvitedBulk(ids: string[]): {
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
declare const VER_UTILITIES: string;
declare const VER_LEADERBOARD: string;
declare const VER_LOGGER: string;
declare const VER_RECRUITER: string;
declare const VER_SCORING_SYSTEM: string;
declare const VER_ORCHESTRATOR: string;

/**
 * 🔌 API INTERFACES
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
 * 🌐 GET Handler
 */
function doGet(
  e: GoogleAppsScript.Events.DoGet,
): GoogleAppsScript.Content.TextOutput {
  try {
    const action = (e?.parameter?.action || "").toLowerCase().trim();

    switch (action) {
      case "ping":
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheetsMap: Record<string, number> = {};
        ss.getSheets().forEach(
          (s) => (sheetsMap[s.getName()] = s.getSheetId()),
        );

        return respond({
          version: VER_API_PUBLIC,
          status: "online",
          scriptId: ScriptApp.getScriptId(),
          spreadsheetUrl: ss.getUrl(),
          sheets: sheetsMap,
          modules: getModuleVersions(),
        });

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

      case "getwarlog":
        return respond(getWarLog());

      case "refresh":
        return respondRaw(getWebAppData(true));

      case "":
        return respond(null, "NO_ACTION", "Missing ?action= parameter.");

      default:
        return respond(null, "INVALID_ACTION", `Unknown action: "${action}".`);
    }
  } catch (err: any) {
    console.error(`doGet ERROR: ${err.stack}`);
    return respond(null, "SERVER_ERROR", err.message);
  }
}

/**
 * 🌐 POST Handler
 */
function doPost(
  e: GoogleAppsScript.Events.DoPost,
): GoogleAppsScript.Content.TextOutput {
  try {
    const body = e?.postData?.contents;
    if (!body) {
      return respond(null, "EMPTY_BODY", "POST request requires JSON body");
    }

    let payload: ApiRequestPayload;
    try {
      payload = JSON.parse(body);
    } catch (parseErr: any) {
      return respond(null, "PARSE_ERROR", `Invalid JSON: ${parseErr.message}`);
    }

    const action = (payload.action || "").toLowerCase().trim();

    switch (action) {
      case "dismissrecruits":
        const ids = payload.ids;
        if (!ids || !Array.isArray(ids)) {
          return respond(
            null,
            "INVALID_PARAMS",
            'dismissRecruits requires "ids" array',
          );
        }
        return respond(markRecruitsAsInvitedBulk(ids));

      case "triggerupdate":
        return respond(triggerAsyncUpdate(payload.target));

      case "ping":
      case "getleaderboard":
      case "getwebappdata":
      case "getrecruits":
      case "getmembers":
      case "getwarlog":
      case "refresh":
        // Construction of a mock event for doGet delegation
        return doGet({ parameter: { action: action } } as any);

      case "":
        return respond(null, "NO_ACTION", 'Missing "action" in POST body');

      default:
        return respond(null, "INVALID_ACTION", `Unknown action: "${action}"`);
    }
  } catch (err: any) {
    console.error(`doPost ERROR: ${err.stack}`);
    return respond(null, "SERVER_ERROR", err.message);
  }
}

/**
 * 📦 RESPONSE UTILITIES
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
    "UTILITIES",
    "LEADERBOARD",
    "LOGGER",
    "RECRUITER",
    "SCORING_SYSTEM",
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
 * 📊 DATA FETCHERS
 */
function getMembers(): any[] {
  const remoteData = Utils.fetchPublicJson("members");
  if (remoteData) return remoteData as any[];

  console.log("Members: Using local fallback");
  const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
  const data = Utils.fetchRoyaleAPI([
    `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
  ]);

  if (!data || !data[0] || !data[0].items) {
    console.warn("API: getMembers returned no data.");
    return [];
  }

  return data[0].items.map((m: any) => ({
    tag: m.tag,
    name: m.name,
    role: formatRole(m.role),
    kingLevel: m.expLevel,
    donations: m.donations,
    donationsReceived: m.donationsReceived,
  }));
}

function getWarLog(): WarLogEntry[] {
  const remoteData = Utils.fetchPublicJson("warlog");
  if (remoteData) return remoteData as WarLogEntry[];

  console.log("WarLog: Using local fallback");
  const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
  const data = Utils.fetchRoyaleAPI([
    `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/riverracelog?limit=52&__t=${new Date().getTime()}`,
  ]);

  if (!data || !data[0] || !data[0].items) {
    console.warn("API: getWarLog returned no data.");
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
  return Utils.formatDate(d);
}

/**
 * 🤖 ASYNC UPDATE DISPATCHER
 */
function triggerAsyncUpdate(target: string | undefined): any {
  const normTarget = (target || "").toLowerCase().trim();
  const validTargets = ["members", "leaderboard", "headhunters"];

  if (!validTargets.includes(normTarget)) {
    return {
      success: false,
      error: "INVALID_TARGET",
      message: `Unknown target: "${normTarget}"`,
    };
  }

  return Utils.executeSafely("ASYNC_TRIGGER_QUEUE", () => {
    try {
      const cache = CacheService.getScriptCache();
      if (cache.get("SYSTEM_STATUS") === "BUSY") {
        return {
          success: false,
          status: "BUSY",
          message: "System is already processing an update.",
        };
      }

      Utils.Props.set("PENDING_UPDATE_TARGET", normTarget);
      cache.put("SYSTEM_STATUS", "BUSY", 1200);

      ScriptApp.getProjectTriggers().forEach((t) => {
        if (t.getHandlerFunction() === "dispatchAsyncUpdate")
          ScriptApp.deleteTrigger(t);
      });

      ScriptApp.newTrigger("dispatchAsyncUpdate")
        .timeBased()
        .after(500)
        .create();

      console.log(`🚀 Async Trigger Queued: ${normTarget}`);
      return { success: true, status: "QUEUED", target: normTarget };
    } catch (e: any) {
      console.error(`triggerAsyncUpdate Failed: ${e.message}`);
      throw e;
    }
  });
}

function dispatchAsyncUpdate(): void {
  const target = Utils.Props.get("PENDING_UPDATE_TARGET");
  if (!target) {
    console.warn("⚠️ Async Dispatcher: No pending target found.");
    return;
  }

  Utils.Props.delete("PENDING_UPDATE_TARGET");

  Utils.executeSafely(`ASYNC_EXEC_${target.toUpperCase()}`, () => {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let sheetName = "";
      if (target === "members") sheetName = CONFIG.SHEETS.DB;
      else if (target === "leaderboard") sheetName = CONFIG.SHEETS.LB;
      else if (target === "headhunters") sheetName = CONFIG.SHEETS.HH;

      const sheet = ss.getSheetByName(sheetName);

      if (sheet) {
        sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL).setValue(true);
        SpreadsheetApp.flush();
      }

      if (target === "members") {
        updateClanDatabase();
        refreshWebPayload();
      } else if (target === "leaderboard") {
        updateLeaderboard();
        refreshWebPayload();
      } else if (target === "headhunters") {
        scoutRecruits();
      }

      if (sheet) sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL).setValue(false);

      console.log(`✅ Async Execution Perfect: ${target}`);
    } catch (e: any) {
      console.error(`❌ Async Execution Failed [${target}]: ${e.message}`);
    } finally {
      CacheService.getScriptCache().remove("SYSTEM_STATUS");
    }
  });
}
