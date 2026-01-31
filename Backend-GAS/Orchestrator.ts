
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
import type { IRegistry } from "./Registry";

// Global Version Constant
// @ts-ignore
const VER_ORCHESTRATOR = "11.0.4";

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

// External module functions
// External module functions (Legacy)
// routed via Registry in modern stack

// Module Version Constants for Health Check
declare const VER_CONFIGURATION: string;
declare const VER_REGISTRY: string;
declare var VER_DATABASE: string;
declare var VER_ROSTER: string;
declare var VER_SCORING: string;
declare var VER_SCORING_KERNEL: string;
declare var VER_HEADHUNTER: string;
declare var VER_API_PUBLIC: string;
declare const VER_CONTROLLER_WEBAPP: string;

/**
 * 🔒 MANAGED AUTOMATION KEYS
 * List of functions that this orchestrator is responsible for.
 * Setup Trigger will ONLY touch these, leaving other scripts' triggers intact.
 */
const MANAGED_TRIGGER_FUNCTIONS = [
  "taskUpdateDatabase",
  "taskUpdateRoster",
  "taskFastScout",
  "taskWarmUpWorker",
  "handleMobileEdit"
];

const PERMANENT_TRIGGER_KEY = "PERMANENT_TRIGGER_IDS";

/**
 * 🕹️ ORCHESTRATOR INTERFACES
 */
export interface ApiKeyVerificationResult {
  name: string;
  success: boolean;
  error?: string;
}

export interface IOrchestrator {
  createTriggers(): void;
  clearAllTriggers(): void;
  dispatchMaster(): void;
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
    .addItem(UI.MENU_ITEMS.DB, "triggerUpdateDatabase")
    .addItem("🏆 Update Roster", "triggerUpdateRoster")
    .addItem(UI.MENU_ITEMS.HH, "triggerScoutRecruits")
    .addSeparator()
    .addItem(UI.MENU_ITEMS.ALL, "dispatchMaster")
    .addSeparator()
    .addItem(ITEMS.KEYS, "triggerVerifyApiKeys")
    .addItem(ITEMS.HEALTH, "checkSystemHealth")
    .addSeparator()
    .addItem(ITEMS.TGR, "createTriggers")
    .addToUi();
}

/**
 * TASK A1: UPDATE DATABASE (Logger)
 * Recommended Trigger: Time-Based -> Every 1 Hour
 */
function taskUpdateDatabase(): void {
  console.info("⏰ [TASK] Clan Database Sync: Starting...");

  // 🩺 SELF-HEALING: Verify mobile infrastructure health silently every hour
  setupMobileTriggers(true);

  try {
    Registry.Services.Core.executeSafely("SYNC_DB", () => {
      Registry.Actions["sync:database"]();
      console.info("✅ [TASK] Clan Database Sync: Success.");
    });
  } catch (e: any) {
    if (e.message.indexOf("Lock timeout") > -1) {
      console.warn("⚠️ [TASK] Database Sync: Collision detected. Queuing retry in 2m...");
      queueRetry("taskUpdateDatabase");
      return; 
    }
    console.error(`❌ [TASK] Database Sync: FAILED - ${e.message}`);
  } finally {
    // 🧹 Always attempt to clean up any "ghost" triggers for this task
    cleanupTemporaryTriggers("taskUpdateDatabase");
  }
}

/**
 * TASK A2: UPDATE ROSTER (Leadership & Scopes)
 * Recommended Trigger: Time-Based -> Every 1 Hour
 */
function taskUpdateRoster(): void {
  console.info("⏰ [TASK] Roster Update: Starting...");

  try {
    Registry.Services.Core.executeSafely("SYNC_ROSTER", () => {
      Registry.Actions["sync:roster"]();
      Registry.Actions["sync:webapp"]();
      console.info("✅ [TASK] Roster Update: Success.");
    });
  } catch (e: any) {
    if (e.message.indexOf("Lock timeout") > -1) {
      console.warn("⚠️ [TASK] Roster Update: Collision detected. Queuing retry in 2m...");
      queueRetry("taskUpdateRoster");
      return;
    }
    console.error(`❌ [TASK] Roster Update: FAILED - ${e.message}`);
  } finally {
    // 🧹 Always attempt to clean up any "ghost" triggers for this task
    cleanupTemporaryTriggers("taskUpdateRoster");
  }
}

/**
 * ⛓️ TRIGGER HELPER: Queue Retry
 * Creates a one-time trigger with a specific stagger.
 */
function queueRetry(functionName: string, minutes: number = 2): void {
  // Guard: Remove existing pending retries to prevent pile-up
  cleanupTemporaryTriggers(functionName);

  ScriptApp.newTrigger(functionName)
    .timeBased()
    .after(minutes * 60 * 1000) 
    .create();
}

// Obsolete: Replaced by queueRetry
// function queueLeaderboardUpdate() { ... }

/**
 * 🧹 TRIGGER HELPER: Cleanup Temporary Triggers
 * Removes one-time clock triggers for a specific function.
 */
function cleanupTemporaryTriggers(functionName: string): void {
  const triggers = ScriptApp.getProjectTriggers();
  const rawRegistry = Registry.Services.Store.props.get(PERMANENT_TRIGGER_KEY) || "[]";
  let permanentIds: string[] = [];
  try { permanentIds = JSON.parse(rawRegistry); } catch(e: any) {}

  triggers.forEach((t: any) => {
    // 🛡️ Guard: Never delete a trigger that is registered as "Permanent"
    if (permanentIds.indexOf(t.getUniqueId()) > -1) return;

    if (
      t.getHandlerFunction() === functionName &&
      t.getTriggerSource() === ScriptApp.TriggerSource.CLOCK
    ) {
      ScriptApp.deleteTrigger(t);
    }
  });
}

/**
 * TASK B: FAST SCOUT (Headhunter)
 * Recommended Trigger: Time-Based -> Every 30 Minutes
 */
function taskFastScout(): void {
  console.info("⏰ [TASK] Fast Scout (Headhunter): Starting...");
  Registry.Services.Core.executeSafely("SYNC_HH", () => {
    try {
      Registry.Actions["recruit:scout"]();
      console.info("✅ [TASK] Fast Scout: Success.");
    } catch (e: any) {
      console.error(`❌ [TASK] Fast Scout: FAILED - ${e.message}`);
    }
  });
}

/**
 * TASK C: WARM UP WORKER (Render Keep-Alive)
 * Recommended Trigger: Time-Based -> Every 10 Minutes
 * (Render sleeps after 15 mins of inactivity)
 */
function taskWarmUpWorker(): void {
  try {
    // ⚡ LIGHTWEIGHT PING: No locking, no overhead.
    Registry.Services.Network.remoteWorkerHealthy(true);
  } catch (e: any) {
    console.error(`❌ [WARMUP] Worker ping failed: ${e.message}`);
  }
}

/**
 * 🛠️ TRIGGER MANAGEMENT
 * Sets up the automated lifecycle of the project.
 */
function createTriggers(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  console.info("🚀 [TRIGGERS] Verifying and repairing trigger suite (Surgical Sync)...");

  const permanentIds: string[] = [];
  const existingTriggers = ScriptApp.getProjectTriggers();

  /**
   * High-Precision verification: Checks both Handler and Source.
   */
  const ensure = (handler: string, source: any, createFn: () => any) => {
    const existing = existingTriggers.find((t: any) => 
      t.getHandlerFunction() === handler && 
      t.getTriggerSource() === source
    );

    if (existing) {
      console.info(`  ✓ [SKIP] ${handler} exists (Source: ${source}).`);
      permanentIds.push(existing.getUniqueId());
    } else {
      console.info(`  ✨ [NEW] Recreating ${handler}...`);
      const t = createFn();
      permanentIds.push(t.getUniqueId());
    }
  };

  // 1. Database Sync (Every 1 Hour)
  ensure("taskUpdateDatabase", ScriptApp.TriggerSource.CLOCK, () => 
    ScriptApp.newTrigger("taskUpdateDatabase").timeBased().everyHours(1).create()
  );

  // 2. Roster Update (Every 1 Hour)
  ensure("taskUpdateRoster", ScriptApp.TriggerSource.CLOCK, () => 
    ScriptApp.newTrigger("taskUpdateRoster").timeBased().everyHours(1).create()
  );

  // 3. Headhunter Fast Scout (Every 30 Minutes)
  ensure("taskFastScout", ScriptApp.TriggerSource.CLOCK, () => 
    ScriptApp.newTrigger("taskFastScout").timeBased().everyMinutes(30).create()
  );

  // 4. Render Worker Warm-up (Every 10 Minutes)
  ensure("taskWarmUpWorker", ScriptApp.TriggerSource.CLOCK, () => 
    ScriptApp.newTrigger("taskWarmUpWorker").timeBased().everyMinutes(10).create()
  );

  // 5. Integrated Mobile Setup (onEdit Trigger)
  setupMobileTriggers(true);
  
  const allTriggersNow = ScriptApp.getProjectTriggers();
  const mobileT = allTriggersNow.find((t: any) => t.getHandlerFunction() === "handleMobileEdit");
  if (mobileT) permanentIds.push(mobileT.getUniqueId());
  
  // 🛡️ REGISTER PERMANENT IDS
  Registry.Services.Store.props.set(PERMANENT_TRIGGER_KEY, JSON.stringify(permanentIds));

  ss.toast("Triggers synchronized successfully.", "⚙️ Trigger Engine", 3);
  console.info("✅ [TRIGGERS] Surgical sync complete.");
}


/**
 * 🚀 MASTER DISPATCHER
 * Sequential execution of the entire stack.
 */
function dispatchMaster(): void {
  const version = VER_ORCHESTRATOR;

  Registry.Services.Reporting.logReport(
    `🎭 MASTER PROTOCOL v${version}`,
    [`INITIALIZING ORCHESTRATION...`]
  );

  // 1. Warm up first
  taskWarmUpWorker();

  // 2. Full Data Ingestion
  taskUpdateDatabase();

  // 3. Score Calculation & Rendering
  taskUpdateRoster();

  // 4. Headhunter
  taskFastScout();

  // 5. Final Tab Hygiene (Visual Persistence)
  Registry.Services.View.enforceGlobalTabHygiene();

  Registry.Services.Reporting.logReport(
    `🎭 MASTER PROTOCOL v${version}`,
    [`MASTER DISPATCH: ALL OPERATIONS COMPLETE.`]
  );
}

/**
 * Creates an INSTALLABLE trigger for the 'onEdit' event.
 * @param silent If true, suppresses UI alerts (for self-healing)
 */
function setupMobileTriggers(silent: boolean = false): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const triggerName = "handleMobileEdit";

  // 🛠️ HEAL UI: Ensure checkboxes exist on all target tabs
  Registry.Services.View.refreshMobileControls(ss);

  const triggers = ScriptApp.getProjectTriggers();
  let exists = false;
  for (const t of triggers) {
    if (t.getHandlerFunction() === triggerName) {
      exists = true;
      break;
    }
  }

  if (exists) {
    if (!silent) {
      const ui = SpreadsheetApp.getUi();
      ui.alert(
        "✅ Mobile Controls Ready",
        "Checkboxes in cell A1 are active.",
        ui.ButtonSet.OK,
      );
    }
    return;
  }

  // 🛠️ HEAL SENSOR: Recreate the onEdit trigger
  ScriptApp.newTrigger(triggerName).forSpreadsheet(ss).onEdit().create();

  if (!silent) {
    const ui = SpreadsheetApp.getUi();
    ui.alert(
      "📱 Mobile Controls Enabled!",
      "You can now use the A1 checkboxes.",
      ui.ButtonSet.OK,
    );
  } else {
    console.info("🛠️ [MOBILE] Self-Healed: Mobile onEdit trigger recreated.");
  }
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
  Registry.Services.View.setStatusMessage(sheet, "⏳ Updating...");
  SpreadsheetApp.flush();

  console.info(`📱 [MOBILE] Trigger activated: ${sheetName}`);

  const lockMap: Record<string, string> = {
    [CONFIG.SHEETS.ROSTER]: "SYNC_ROSTER",
    [CONFIG.SHEETS.DB]: "SYNC_DB",
    [CONFIG.SHEETS.HH]: "SYNC_HH"
  };
  const lockKey = lockMap[sheetName] || `MOBILE_${sheetName.toUpperCase()}`;

  try {
    Registry.Services.Core.executeSafely(lockKey, () => {
      if (sheetName === CONFIG.SHEETS.ROSTER) {
        Registry.Actions["sync:roster"]();
        Registry.Actions["sync:webapp"]();
      } else if (sheetName === CONFIG.SHEETS.DB) {
        Registry.Actions["sync:database"]();
        Registry.Actions["sync:webapp"]();
      } else if (sheetName === CONFIG.SHEETS.HH) {
        Registry.Actions["recruit:scout"]();
      }
      Registry.Services.View.setStatusMessage(sheet, `✅ Done ${new Date().toLocaleTimeString()}`);
    });
  } catch (err: any) {
    console.error(`❌ [MOBILE] Error on ${sheetName}: ${err.message}`);
    const msg =
      err.message.indexOf("System Busy") > -1
        ? "⚠️ System Busy (Retry in 60s)"
        : `ERROR: ${err.message}`;
    Registry.Services.View.setStatusMessage(sheet, msg);
  }
}

/**
 * 🟢 UI WRAPPERS
 */
function triggerUpdateDatabase(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Connecting to Royale API...", "📊 Database Update", 5);
  Registry.Services.Core.executeSafely("SYNC_DB", () => {
    try {
      Registry.Actions["sync:database"]();
      Registry.Actions["sync:webapp"]();
      ss.toast("Database synchronized successfully.", "✅ Success", 3);
    } catch (e: any) {
      SpreadsheetApp.getUi().alert(`❌ Error: ${e.message}`);
    }
  });
}

function triggerUpdateRoster(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Calculating performance scores...", "🏆 Roster Update", 5);
  Registry.Services.Core.executeSafely("SYNC_ROSTER", () => {
    try {
      Registry.Actions["sync:roster"]();
      Registry.Actions["sync:webapp"]();
      ss.toast("Roster synchronized successfully.", "✅ Success", 3);
    } catch (e: any) {
      SpreadsheetApp.getUi().alert(`❌ Error: ${e.message}`);
    }
  });
}

function triggerScoutRecruits(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Scanning global tournaments...", "🔭 Headhunter Scout", 20);
  Registry.Services.Core.executeSafely("SYNC_HH", () => {
    try {
      Registry.Actions["recruit:scout"]();
      ss.toast("Scout operation completed.", "✅ Success", 5);
    } catch (e: any) {
      SpreadsheetApp.getUi().alert(`❌ Error: ${e.message}`);
    }
  });
}

/**
 * 🔍 DIAGNOSTICS & ORCHESTRATION
 */
function checkSystemHealth(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Running system diagnostics...", "🔍 Health Check", 5);

  const manifest = CONFIG.SYSTEM.MANIFEST;
  const keys = CONFIG.SYSTEM.API_KEYS;
  let keyStatusReport = "";
  let keysHealthy = true;

  if (keys.length === 0) {
    keysHealthy = false;
    keyStatusReport = "❌ No API Keys configured in CONFIG.SYSTEM.API_KEYS.\n";
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
      name: "Registry",
      current: typeof VER_REGISTRY !== "undefined" ? VER_REGISTRY : "MISSING",
      expected: manifest.REGISTRY || "1.0.0",
    },
    {
      name: "Orchestrator",
      current: typeof VER_ORCHESTRATOR !== "undefined" ? VER_ORCHESTRATOR : "MISSING",
      expected: manifest.ORCHESTRATOR,
    },
    {
      name: "Roster",
      current: typeof VER_ROSTER !== "undefined" ? VER_ROSTER : "MISSING",
      expected: manifest.ROSTER || "1.0.0",
    },
    {
      name: "Scoring",
      current: typeof VER_SCORING !== "undefined" ? VER_SCORING : "MISSING",
      expected: manifest.SCORING,
    },
    {
      name: "Database",
      current: typeof VER_DATABASE !== "undefined" ? VER_DATABASE : "MISSING",
      expected: manifest.DATABASE || "13.0.0",
    },
    {
      name: "Headhunter",
      current: typeof VER_HEADHUNTER !== "undefined" ? VER_HEADHUNTER : "MISSING",
      expected: manifest.HEADHUNTER,
    },
    {
      name: "Scoring Kernel",
      current: typeof VER_SCORING_KERNEL !== "undefined" ? VER_SCORING_KERNEL : "MISSING",
      expected: manifest.SCORING_KERNEL,
    },
    {
      name: "API Public",
      current: typeof VER_API_PUBLIC !== "undefined" ? VER_API_PUBLIC : "MISSING",
      expected: manifest.API_PUBLIC,
    },
    {
      name: "Webapp Controller",
      current: typeof VER_CONTROLLER_WEBAPP !== "undefined" ? VER_CONTROLLER_WEBAPP : "MISSING",
      expected: manifest.CONTROLLER_WEBAPP,
    }
  ];

  let report = `📂 FILE SYSTEM\n`;
  let healthy = true;

  if (!keysHealthy) healthy = false;
  report += keyStatusReport;

  modules.forEach((m: any) => {
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
  ss.toast("Testing API key connectivity...", "🔑 Security Audit", 10);

  const results = verifyApiKeysInternal(true, 0);

  let report = "🔑 API KEY SECURITY AUDIT\n---------------------------\n";
  let activeCount = 0;

  results.forEach((r: any) => {
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
    const remoteResults = Registry.Services.Network.auditKeysRemote(keysToCheck);
    if (remoteResults) {
      console.info("✅ [AUDIT] API key verification handled by remote worker.");
      return remoteResults;
    }
    console.warn("⚠️ [AUDIT] Remote audit unavailable. Falling back to local quota.");
  }

  for (const keyObj of keysToCheck) {
    if (quotaExhausted) {
      results.push({ name: keyObj.name, success: false, error: "⚠️ Skipped (Quota Exceeded)" });
      continue;
    }

    try {
      const response = Registry.Services.Network.fetchRoyaleAPI([url]);
      if (response && response[0]) {
        results.push({ name: keyObj.name, success: true });
      } else {
        results.push({ name: keyObj.name, success: false, error: "Invalid Key or Maintenance" });
      }
    } catch (e: any) {
      if (e.message && e.message.indexOf("Service invoked too many times") > -1) {
        quotaExhausted = true;
        results.push({ name: keyObj.name, success: false, error: "⛔ DAILY QUOTA LIMIT REACHED" });
      } else {
        results.push({ name: keyObj.name, success: false, error: `Ex: ${e.message}` });
      }
    }
  }

  return results;
}

/**
 * 🌍 GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, {
    onOpen,
    taskUpdateDatabase,
    taskUpdateRoster,
    queueRetry,
    cleanupTemporaryTriggers,
    taskFastScout,
    setupMobileTriggers,
    handleMobileEdit,
    triggerUpdateDatabase,
    triggerUpdateRoster,
    triggerScoutRecruits,
    checkSystemHealth,
    triggerVerifyApiKeys,
    createTriggers,
    dispatchMaster,
    taskWarmUpWorker,
    VER_ORCHESTRATOR,
  });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

function clearAllTriggers(): void {
  const triggers = ScriptApp.getProjectTriggers();
  let deletedCount = 0;

  triggers.forEach((t: any) => {
    const handler = t.getHandlerFunction();
    if (MANAGED_TRIGGER_FUNCTIONS.indexOf(handler) > -1) {
      ScriptApp.deleteTrigger(t);
      deletedCount++;
    }
  });

  console.info(`🧹 [TRIGGERS] Surgical cleanup: Deleted ${deletedCount} managed trigger${deletedCount !== 1 ? 's' : ''}.`);
}
