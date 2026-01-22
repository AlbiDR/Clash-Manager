/**
 * ============================================================================
 * 🕹️ MODULE: ORCHESTRATOR & TRIGGERS - TypeScript Edition
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Manages Automation Triggers and the "Master Protocol".
 * ⚙️ WORKFLOW:
 *    - Creates a custom UI menu (`onOpen`) for manual control.
 *    - Exposes GRANULAR TASKS for Project Settings Triggers.
 * 🏷️ VERSION: 11.0.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { AppUtils } from "./Utilities";

// Global Version Constant
// @ts-ignore
const VER_ORCHESTRATOR = "11.0.0";

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
declare const Utils: AppUtils;

// External module functions
declare function updateClanDatabase(): void;
declare function updateLeaderboard(): void;
declare function scoutRecruits(): void;
declare function refreshWebPayload(): void;

// Module Version Constants for Health Check
declare const VER_CONFIGURATION: string;
declare const VER_UTILITIES: string;
declare const VER_LOGGER: string;
declare const VER_LEADERBOARD: string;
declare const VER_RECRUITER: string;

/**
 * 🕹️ ORCHESTRATOR INTERFACES
 */
export interface ApiKeyVerificationResult {
  name: string;
  success: boolean;
  error?: string;
}

export interface ModuleStatus {
  name: string;
  current: string;
  expected: string;
}

/**
 * Creates a custom menu in the spreadsheet UI when the document is opened.
 */
function onOpen(e: GoogleAppsScript.Events.AppsScriptEvent): void {
  const UI = CONFIG.UI;
  const ITEMS = UI.MENU_ITEMS;

  SpreadsheetApp.getUi()
    .createMenu(UI.MENU_NAME)
    .addItem(ITEMS.DB, "triggerUpdateDatabase")
    .addItem(ITEMS.LB, "triggerUpdateLeaderboard")
    .addItem(ITEMS.HH, "triggerScoutRecruits")
    .addSeparator()
    .addItem(ITEMS.MOBILE, "setupMobileTriggers")
    .addSeparator()
    .addItem(ITEMS.KEYS, "triggerVerifyApiKeys")
    .addItem(ITEMS.HEALTH, "checkSystemHealth")
    .addToUi();
}

/**
 * TASK A: UPDATE MEMBER STATS (Logger + Leaderboard)
 * Recommended Trigger: Time-Based -> Every 6 Hours
 */
function taskUpdateMemberStats(): void {
  console.log("⏰ TASK START: Update Member Stats (DB + LB)");

  Utils.executeSafely("TASK_MEMBER_STATS", () => {
    try {
      console.log("  >> Step 1: Updating Database...");
      updateClanDatabase();

      Utilities.sleep(10000);

      console.log("  >> Step 2: Updating Leaderboard...");
      updateLeaderboard();

      console.log("  >> Step 3: Refreshing PWA...");
      refreshWebPayload();

      console.log("⏰ TASK END: Member Stats Sync Complete.");
    } catch (e: any) {
      console.error(`❌ TASK FAILED (Member Stats): ${e.message}`);
    }
  });
}

/**
 * TASK B: FAST SCOUT (Headhunter)
 * Recommended Trigger: Time-Based -> Every 30 Minutes
 */
function taskFastScout(): void {
  console.log("⏰ TASK START: Fast Scout");
  Utils.executeSafely("TASK_HH", () => {
    try {
      scoutRecruits();
      console.log("⏰ TASK END: Scout complete.");
    } catch (e: any) {
      console.error(`❌ TASK FAILED (HH): ${e.message}`);
    }
  });
}

/**
 * Creates an INSTALLABLE trigger for the 'onEdit' event.
 */
function setupMobileTriggers(): void {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const triggerName = "handleMobileEdit";

  Utils.refreshMobileControls(ss);

  const triggers = ScriptApp.getProjectTriggers();
  let exists = false;
  for (const t of triggers) {
    if (t.getHandlerFunction() === triggerName) {
      exists = true;
      break;
    }
  }

  if (exists) {
    ui.alert(
      "✅ Mobile Controls Ready",
      "Checkboxes in cell A1 are active.",
      ui.ButtonSet.OK,
    );
    return;
  }

  ScriptApp.newTrigger(triggerName).forSpreadsheet(ss).onEdit().create();

  ui.alert(
    "📱 Mobile Controls Enabled!",
    "You can now use the A1 checkboxes.",
    ui.ButtonSet.OK,
  );
}

/**
 * Logic handler for Mobile Checkboxes (A1)
 */
function handleMobileEdit(e: GoogleAppsScript.Events.SheetsOnEdit): void {
  if (!e || !e.range || !e.value) return;

  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = sheet.getName();

  if (range.getA1Notation() !== CONFIG.UI.MOBILE_TRIGGER_CELL) return;
  if (e.value !== "TRUE") return;

  range.setValue(false);
  sheet.getRange("B1").setValue("⏳ Updating...");
  SpreadsheetApp.flush();

  console.log(`📱 Mobile Trigger: ${sheetName}`);

  try {
    Utils.executeSafely(`MOBILE_${sheetName.toUpperCase()}`, () => {
      if (sheetName === CONFIG.SHEETS.LB) {
        updateLeaderboard();
        refreshWebPayload();
      } else if (sheetName === CONFIG.SHEETS.DB) {
        updateClanDatabase();
        refreshWebPayload();
      } else if (sheetName === CONFIG.SHEETS.HH) {
        scoutRecruits();
      }
      sheet
        .getRange("B1")
        .setValue(`✅ Done ${new Date().toLocaleTimeString()}`);
    });
  } catch (err: any) {
    console.error(`📱 Mobile Error: ${err.message}`);
    const msg =
      err.message.indexOf("System Busy") > -1
        ? "⚠️ System Busy (Retry in 60s)"
        : `ERROR: ${err.message}`;
    sheet.getRange("B1").setValue(msg);
  }
}

/**
 * 🟢 UI WRAPPERS
 */
function triggerUpdateDatabase(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Connecting to RoyaleAPI...", "Update Database", 5);
  Utils.executeSafely("MANUAL_DB", () => {
    try {
      updateClanDatabase();
      refreshWebPayload();
      ss.toast("Database updated successfully.", "Success", 3);
    } catch (e: any) {
      SpreadsheetApp.getUi().alert(`Error: ${e.message}`);
    }
  });
}

function triggerUpdateLeaderboard(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Calculating scores...", "Update Leaderboard", 5);
  Utils.executeSafely("MANUAL_LB", () => {
    try {
      updateLeaderboard();
      refreshWebPayload();
      ss.toast("Leaderboard refreshed.", "Success", 3);
    } catch (e: any) {
      SpreadsheetApp.getUi().alert(`Error: ${e.message}`);
    }
  });
}

function triggerScoutRecruits(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Scanning tournaments...", "Headhunter", 20);
  Utils.executeSafely("MANUAL_HH", () => {
    try {
      scoutRecruits();
      ss.toast("Scout Complete.", "Success", 5);
    } catch (e: any) {
      SpreadsheetApp.getUi().alert(`Error: ${e.message}`);
    }
  });
}

/**
 * 🔍 DIAGNOSTICS & ORCHESTRATION
 */
function checkSystemHealth(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Verifying System...", "Health Check", 5);

  const manifest = CONFIG.SYSTEM.MANIFEST;
  const keys = CONFIG.SYSTEM.API_KEYS;
  let keyStatusReport = "";
  let keysHealthy = true;

  if (keys.length === 0) {
    keysHealthy = false;
    keyStatusReport = "❌ No API Keys configured.\n";
  } else {
    const verificationResults = verifyApiKeysInternal(false, 1);
    const isConnectivityActive =
      verificationResults.length > 0 && verificationResults[0].success;

    if (isConnectivityActive) {
      keyStatusReport = `🔑 API CONNECTION: ✅ Active (Sampled 1/${keys.length} keys)\n`;
    } else {
      keysHealthy = false;
      const errorMsg =
        verificationResults.length > 0
          ? verificationResults[0].error
          : "Unknown Error";
      keyStatusReport = `❌ API CONNECTION FAILED: ${errorMsg}\n`;
    }
  }

  const modules: ModuleStatus[] = [
    {
      name: "Configuration",
      current:
        typeof VER_CONFIGURATION !== "undefined"
          ? VER_CONFIGURATION
          : "MISSING",
      expected: manifest.CONFIGURATION,
    },
    {
      name: "Utilities",
      current: typeof VER_UTILITIES !== "undefined" ? VER_UTILITIES : "MISSING",
      expected: manifest.UTILITIES,
    },
    {
      name: "Orchestrator",
      current:
        typeof VER_ORCHESTRATOR !== "undefined" ? VER_ORCHESTRATOR : "MISSING",
      expected: manifest.ORCHESTRATOR,
    },
    {
      name: "Recruiter",
      current: typeof VER_RECRUITER !== "undefined" ? VER_RECRUITER : "MISSING",
      expected: manifest.RECRUITER,
    },
  ];

  let report = `📂 FILE SYSTEM\n`;
  let healthy = true;

  if (!keysHealthy) healthy = false;
  report += keyStatusReport;

  modules.forEach((m) => {
    if (m.current === m.expected) report += `✅ ${m.name}: v${m.current}\n`;
    else {
      healthy = false;
      report += `❌ ${m.name}: Found v${m.current} (Expected v${m.expected})\n`;
    }
  });

  const ui = SpreadsheetApp.getUi();
  ui.alert(
    healthy ? "System Healthy" : "⚠️ System Issues Detected",
    report,
    ui.ButtonSet.OK,
  );
}

function triggerVerifyApiKeys(): void {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Verifying API Keys...", "Security Audit", 10);

  const results = verifyApiKeysInternal(true, 0);

  let report = "🔑 API KEY SECURITY AUDIT\n---------------------------\n";
  let activeCount = 0;

  results.forEach((r) => {
    if (r.success) {
      activeCount++;
      report += `✅ ${r.name}: Active\n`;
    } else {
      report += `❌ ${r.name}: ${r.error}\n`;
    }
  });

  report += "---------------------------\n";
  report += `📊 SUMMARY: ${activeCount}/${results.length} Keys Operational`;

  ui.alert("API Key Verification", report, ui.ButtonSet.OK);
}

function verifyApiKeysInternal(
  isUserFacing: boolean,
  limit: number = 0,
): ApiKeyVerificationResult[] {
  const keys = CONFIG.SYSTEM.API_KEYS;
  const baseUrl = CONFIG.SYSTEM.API_BASE;
  const url = `${baseUrl}/cards`;
  const results: ApiKeyVerificationResult[] = [];

  let quotaExhausted = false;
  const keysToCheck = limit > 0 ? keys.slice(0, limit) : keys;

  if (CONFIG.SYSTEM.REMOTE_WORKER_URL) {
    const remoteResults = Utils.auditKeysRemote(keysToCheck);
    if (remoteResults) {
      console.log("✅ API Audit handled by Remote Worker.");
      return remoteResults;
    }
    console.warn("⚠️ Remote Audit failed. Falling back to local quota.");
  }

  for (const keyObj of keysToCheck) {
    if (quotaExhausted) {
      results.push({
        name: keyObj.name,
        success: false,
        error: "⚠️ Skipped (Quota Exceeded)",
      });
      continue;
    }

    try {
      const response = UrlFetchApp.fetch(url, {
        method: "get",
        headers: {
          Authorization: `Bearer ${keyObj.value}`,
          "User-Agent": "ClanManagerBot/11.0 (GAS)",
        },
        muteHttpExceptions: true,
      });

      const code = response.getResponseCode();
      if (code === 200) {
        results.push({ name: keyObj.name, success: true });
      } else {
        let errorMsg = `Error ${code}`;
        if (code === 403) errorMsg = "⛔ Access Denied (Invalid Key)";
        if (code === 429) errorMsg = "⚠️ Rate Limited (Throttled)";
        if (code === 503) errorMsg = "⚠️ Maintenance Mode";
        results.push({ name: keyObj.name, success: false, error: errorMsg });
      }
    } catch (e: any) {
      if (
        e.message &&
        e.message.indexOf("Service invoked too many times") > -1
      ) {
        quotaExhausted = true;
        results.push({
          name: keyObj.name,
          success: false,
          error: "⛔ DAILY QUOTA LIMIT REACHED",
        });
      } else {
        results.push({
          name: keyObj.name,
          success: false,
          error: `Ex: ${e.message}`,
        });
      }
    }

    if (keysToCheck.length > 1) {
      Utilities.sleep(200);
    }
  }

  return results;
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this, {
  onOpen,
  taskUpdateMemberStats,
  taskFastScout,
  setupMobileTriggers,
  handleMobileEdit,
  triggerUpdateDatabase,
  triggerUpdateLeaderboard,
  triggerScoutRecruits,
  checkSystemHealth,
  triggerVerifyApiKeys,
  VER_ORCHESTRATOR,
});
