/**
 * ============================================================================
 * 🕹️ MODULE: ORCHESTRATOR & TRIGGERS
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Manages Automation Triggers and the "Master Protocol".
 * ⚙️ WORKFLOW:
 *    - Creates a custom UI menu (`onOpen`) for manual control.
 *    - Exposes GRANULAR TASKS for Project Settings Triggers.
 * 🏷️ VERSION: 10.0.1
 *
 * 🧠 REASONING:
 *    - Granularity: Replaced the monolithic "dailymaster" with 2 optimized tasks.
 *    - Chaining: DB update enforces a subsequent LB update to keep data consistent.
 * ============================================================================
 */

const VER_ORCHESTRATOR = "10.0.1";

/**
 * Creates a custom menu in the spreadsheet UI when the document is opened.
 */
function onOpen(e) {
  const UI = CONFIG.UI;
  const ITEMS = UI.MENU_ITEMS;

  SpreadsheetApp.getUi()
    .createMenu(UI.MENU_NAME)
    // ZONE 1: CORE ACTIONS
    .addItem(ITEMS.DB, "triggerUpdateDatabase")
    .addItem(ITEMS.LB, "triggerUpdateLeaderboard")
    .addItem(ITEMS.HH, "triggerScoutRecruits")
    .addSeparator()
    // ZONE 2: MOBILE CONTROLS
    .addItem(ITEMS.MOBILE, "setupMobileTriggers")
    .addSeparator()
    // ZONE 3: MAINTENANCE
    .addItem(ITEMS.KEYS, "triggerVerifyApiKeys")
    .addItem(ITEMS.HEALTH, "checkSystemHealth")
    .addToUi();
}

// ----------------------------------------------------------------------------
// ⏰ TRIGGER TASKS (Bind these in Project Settings)
// ----------------------------------------------------------------------------

/**
 * TASK A: UPDATE MEMBER STATS (Logger + Leaderboard)
 * Recommended Trigger: Time-Based -> Every 6 Hours
 *
 * Description:
 * This is the "Heavy" cycle. It takes a snapshot of current member statistics
 * for the historical database, then immediately recalculates the leaderboard
 * to reflect these new stats.
 *
 * Sequence:
 * 1. Update Database (Slowest op).
 * 2. Wait 10s for data stability.
 * 3. Update Leaderboard (Depends on DB).
 * 4. Refresh Web App Cache.
 */
function taskUpdateMemberStats() {
  console.log("⏰ TASK START: Update Member Stats (DB + LB)");

  // We use a broader lock key to prevent any other updates during this heavy op
  Utils.executeSafely("TASK_MEMBER_STATS", () => {
    try {
      // Step 1: Database
      console.log("  >> Step 1: Updating Database...");
      updateClanDatabase();

      // Step 2: Stabilization Delay
      // Google Sheets sometimes lags between writing data and being able to read it back via API/Values.
      Utilities.sleep(10000);

      // Step 3: Leaderboard
      console.log("  >> Step 2: Updating Leaderboard...");
      updateLeaderboard();

      // Step 4: Cache
      console.log("  >> Step 3: Refreshing PWA...");
      refreshWebPayload();

      console.log("⏰ TASK END: Member Stats Sync Complete.");
    } catch (e) {
      console.error(`❌ TASK FAILED (Member Stats): ${e.message}`);
    }
  });
}

/**
 * TASK B: FAST SCOUT (Headhunter)
 * Recommended Trigger: Time-Based -> Every 30 Minutes
 *
 * Description:
 * This is the "Light" cycle. It runs frequently to catch new players entering
 * tournaments. It does NOT touch the database or leaderboard.
 *
 * Actions:
 * 1. Runs Headhunter (Optimized for 150 tournaments).
 * 2. Refreshes Web App Cache (handled internally by scoutRecruits).
 */
function taskFastScout() {
  console.log("⏰ TASK START: Fast Scout");
  Utils.executeSafely("TASK_HH", () => {
    try {
      scoutRecruits();
      console.log("⏰ TASK END: Scout complete.");
    } catch (e) {
      console.error(`❌ TASK FAILED (HH): ${e.message}`);
    }
  });
}

// ----------------------------------------------------------------------------
// 📱 MOBILE TRIGGER SYSTEM
// ----------------------------------------------------------------------------

/**
 * Creates an INSTALLABLE trigger for the 'onEdit' event.
 */
function setupMobileTriggers() {
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
function handleMobileEdit(e) {
  if (!e || !e.range || !e.value) return;

  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = sheet.getName();

  if (range.getA1Notation() !== CONFIG.UI.MOBILE_TRIGGER_CELL) return;
  if (e.value !== "TRUE") return;

  // Visual Feedback
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
  } catch (err) {
    console.error(`📱 Mobile Error: ${err.message}`);
    const msg =
      err.message.indexOf("System Busy") > -1
        ? "⚠️ System Busy (Retry in 60s)"
        : `ERROR: ${err.message}`;
    sheet.getRange("B1").setValue(msg);
  }
}

// ----------------------------------------------------------------------------
// 🟢 WRAPPERS (UI FEEDBACK HANDLERS)
// ----------------------------------------------------------------------------

function triggerUpdateDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Connecting to RoyaleAPI...", "Update Database", 5);
  Utils.executeSafely("MANUAL_DB", () => {
    try {
      updateClanDatabase();
      refreshWebPayload();
      ss.toast("Database updated successfully.", "Success", 3);
    } catch (e) {
      SpreadsheetApp.getUi().alert(`Error: ${e.message}`);
    }
  });
}

function triggerUpdateLeaderboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Calculating scores...", "Update Leaderboard", 5);
  Utils.executeSafely("MANUAL_LB", () => {
    try {
      updateLeaderboard();
      refreshWebPayload();
      ss.toast("Leaderboard refreshed.", "Success", 3);
    } catch (e) {
      SpreadsheetApp.getUi().alert(`Error: ${e.message}`);
    }
  });
}

function triggerScoutRecruits() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Scanning tournaments...", "Headhunter", 20);
  Utils.executeSafely("MANUAL_HH", () => {
    try {
      scoutRecruits();
      ss.toast("Scout Complete.", "Success", 5);
    } catch (e) {
      SpreadsheetApp.getUi().alert(`Error: ${e.message}`);
    }
  });
}

// ----------------------------------------------------------------------------
// 🔍 DIAGNOSTICS & ORCHESTRATION
// ----------------------------------------------------------------------------

function checkSystemHealth() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Verifying System...", "Health Check", 5);

  const manifest = CONFIG.SYSTEM.MANIFEST;

  // 🛡️ API KEY CHECK
  const keys = CONFIG.SYSTEM.API_KEYS;
  let keyStatusReport = "";
  let keysHealthy = true;

  if (keys.length === 0) {
    keysHealthy = false;
    keyStatusReport = "❌ No API Keys configured.\n";
  } else {
    // Perform a quick verification of keys using the first found clan (cache-friendly)
    const verificationResults = verifyApiKeysInternal(false); // Silent mode
    const activeCount = verificationResults.filter((r) => r.success).length;
    keysHealthy = activeCount > 0;
    keyStatusReport = `🔑 API KEYS: ${activeCount}/${keys.length} Active${
      activeCount === keys.length ? " (Perfect)" : ""
    }\n`;
  }

  // Module Check
  const modules = [
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
        typeof VER_ORCHESTRATOR !== "undefined"
          ? VER_ORCHESTRATOR
          : "MISSING",
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

/**
 * Trigger for the manual API Key Verification from the menu.
 */
function triggerVerifyApiKeys() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast("Verifying API Keys...", "Security Audit", 10);

  const results = verifyApiKeysInternal(true); // User-facing mode

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

/**
 * Core logic for verifying API keys.
 * Performs a simple request (/cards) to verify validity.
 * We use /cards because it is a static endpoint that always exists,
 * preventing false negatives if the Clan Tag is incorrect.
 */
function verifyApiKeysInternal(isUserFacing) {
  const keys = CONFIG.SYSTEM.API_KEYS;
  const baseUrl = CONFIG.SYSTEM.API_BASE;

  // Use a stable endpoint that doesn't depend on user configuration
  const url = `${baseUrl}/cards`;

  return keys.map((keyObj) => {
    try {
      const response = UrlFetchApp.fetch(url, {
        method: "get",
        headers: {
          Authorization: `Bearer ${keyObj.value}`,
          "User-Agent": "ClanManagerBot/6.0 (GAS)",
        },
        muteHttpExceptions: true,
      });

      const code = response.getResponseCode();
      if (code === 200) {
        return { name: keyObj.name, success: true };
      } else {
        let errorMsg = `Error ${code}`;
        if (code === 403) errorMsg = "⛔ Access Denied (Invalid Key)";
        if (code === 429) errorMsg = "⚠️ Rate Limited (Throttled)";
        if (code === 503) errorMsg = "⚠️ Maintenance Mode";
        return { name: keyObj.name, success: false, error: errorMsg };
      }
    } catch (e) {
      return { name: keyObj.name, success: false, error: "Network/CORS Error" };
    }
  });
}

// DEPRECATED: Legacy Monolith (Preserved for compatibility)
function sequenceFullUpdate() {
  taskUpdateMemberStats(); // Replaces taskMajorSync
  taskFastScout();
}
