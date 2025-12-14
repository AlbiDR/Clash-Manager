/**
 * ============================================================================
 * 🕹️ MODULE: ORCHESTRATOR & TRIGGERS
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Manages Automation Triggers and the "Master Protocol".
 * ⚙️ WORKFLOW: 
 *    - Creates a custom UI menu (`onOpen`) for manual control.
 *    - Runs the master sequence (`sequenceFullUpdate`) to ensure data consistency.
 * 🏷️ VERSION: 5.0.2
 * 
 * 🧠 REASONING:
 *    - Central Command: Separates "When things happen" from "How things happen".
 *    - Sequence Ordering: Critical for reliability. We prioritize the Web App 
 *      payload refresh BEFORE the risky 'Recruiter' scan (which might timeout).
 * ============================================================================
 */

const VER_ORCHESTRATOR_TRIGGERS = '5.0.2';

/**
 * Creates a custom menu in the spreadsheet UI when the document is opened.
 * This function builds a simple, flat menu for direct access to key operations.
 *
 * @param {Object} e The event parameter for a simple trigger.
 */
function onOpen(e) {
  const UI = CONFIG.UI;
  const ITEMS = UI.MENU_ITEMS;

  SpreadsheetApp.getUi()
    .createMenu(UI.MENU_NAME)
    // ZONE 1: CORE ACTIONS (Data & Recruitment)
    .addItem(ITEMS.DB, 'triggerUpdateDatabase')
    .addItem(ITEMS.LB, 'triggerUpdateLeaderboard')
    .addItem(ITEMS.HH, 'triggerScoutRecruits')
    .addSeparator()
    // ZONE 2: AUTOMATION & MOBILE
    .addItem(ITEMS.ALL, 'sequenceFullUpdate')
    .addItem(ITEMS.MOBILE, 'setupMobileTriggers') // 📱 New Setup Button
    .addSeparator()
    // ZONE 3: MAINTENANCE
    .addItem(ITEMS.HEALTH, 'checkSystemHealth')
    .addToUi();
}

// ----------------------------------------------------------------------------
// 📱 MOBILE TRIGGER SYSTEM
// ----------------------------------------------------------------------------

/**
 * Creates an INSTALLABLE trigger for the 'onEdit' event.
 * REASONING: Simple triggers (function onEdit) cannot make external API calls (UrlFetchApp).
 * To run the update scripts from a phone (by checking a box), we need full permissions.
 * The user must click this ONCE from the desktop menu to authorize it.
 */
function setupMobileTriggers() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const triggerName = 'handleMobileEdit';

  // 1. REFRESH UI ELEMENTS
  // Force draw the checkboxes immediately so the user doesn't have to wait for an update loop.
  Utils.refreshMobileControls(ss);

  // 2. CHECK FOR EXISTING TRIGGER
  const triggers = ScriptApp.getProjectTriggers();
  let exists = false;
  for (const t of triggers) {
    if (t.getHandlerFunction() === triggerName) {
      exists = true;
      break;
    }
  }

  if (exists) {
    ui.alert('✅ Mobile Controls Refreshed',
      'The red checkboxes have been re-applied to cell A1 on the Dashboard, Leaderboard, and Headhunter tabs.\n\nThe system is ready.',
      ui.ButtonSet.OK);
    return;
  }

  // 3. CREATE TRIGGER
  ScriptApp.newTrigger(triggerName)
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  ui.alert('📱 Mobile Controls Enabled!',
    'You can now tap the red checkbox in cell A1 of any tab (on your phone) to run updates.\n\n' +
    'Note: It usually takes 2-5 seconds for the script to react to the checkbox.',
    ui.ButtonSet.OK);
}

/**
 * The logic handler for the Installable Trigger.
 * Runs whenever ANY cell is edited, but only acts if it is the specific MOBILE_TRIGGER_CELL.
 */
function handleMobileEdit(e) {
  // Guard clauses
  if (!e || !e.range || !e.value) return; // Only run on value changes (not format)

  const range = e.range;
  const sheet = range.getSheet();
  const sheetName = sheet.getName();

  // Check location: Must be the designated trigger cell (Default: A1)
  if (range.getA1Notation() !== CONFIG.UI.MOBILE_TRIGGER_CELL) return;

  // Check value: Must be checked (TRUE)
  if (e.value !== 'TRUE') return;

  // 1. Immediate UI Feedback
  // Uncheck the box immediately so it acts like a push button
  range.setValue(false);

  // Write status to the nearby Header area so the user knows something is happening.
  // This is critical on mobile where "Toast" notifications often don't appear.
  sheet.getRange('B1').setValue('⏳ Updating...');
  SpreadsheetApp.flush();

  // 2. Route to the correct function based on the Tab Name
  console.log(`📱 Mobile Trigger activated on: ${sheetName}`);

  // 🛡️ RACE CONDITION PREVENTION: Wrap logic in Mutex Lock
  Utils.executeSafely(`MOBILE_${sheetName.toUpperCase()}`, () => {
    try {
      if (sheetName === CONFIG.SHEETS.LB) {
        updateLeaderboard();
        // Refresh Cache Manually for Leaderboard (Recruiter does it internally)
        refreshWebPayload();
      }
      else if (sheetName === CONFIG.SHEETS.DB) {
        updateClanDatabase();
        refreshWebPayload();
      }
      else if (sheetName === CONFIG.SHEETS.HH) {
        scoutRecruits(); // Recruiter handles its own cache refresh now
      }

      // We update the timestamp in B1 usually, which serves as feedback that it finished.
      sheet.getRange('B1').setValue(`✅ Done ${new Date().toLocaleTimeString()}`);
    } catch (err) {
      console.error(`📱 Mobile Run Error: ${err.message}`);
      // Write error to cell B1 so user sees it
      sheet.getRange('B1').setValue(`ERROR: ${err.message}`);
    }
  });
}


// ----------------------------------------------------------------------------
// 🟢 WRAPPERS (UI FEEDBACK HANDLERS)
// ----------------------------------------------------------------------------

function triggerUpdateDatabase() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Connecting to RoyaleAPI...', 'Update Database', 5);

  // 🛡️ RACE CONDITION PREVENTION
  Utils.executeSafely('MANUAL_DB', () => {
    try {
      updateClanDatabase();
      // REFRESH CACHE: Ensure web app sees new database data
      refreshWebPayload();
      ss.toast('Database updated successfully.', 'Success', 3);
    } catch (e) {
      SpreadsheetApp.getUi().alert(`Error: ${e.message}`);
    }
  });
}

function triggerUpdateLeaderboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Calculating scores...', 'Update Leaderboard', 5);

  // 🛡️ RACE CONDITION PREVENTION
  Utils.executeSafely('MANUAL_LB', () => {
    try {
      updateLeaderboard();
      // REFRESH CACHE: Ensure web app sees new scores/ranks
      refreshWebPayload();
      ss.toast('Leaderboard refreshed.', 'Success', 3);
    } catch (e) {
      SpreadsheetApp.getUi().alert(`Error: ${e.message}`);
    }
  });
}

function triggerScoutRecruits() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Scanning tournaments (this takes ~30s)...', 'Headhunter', 20);

  // 🛡️ RACE CONDITION PREVENTION
  Utils.executeSafely('MANUAL_HH', () => {
    try {
      // Note: scoutRecruits now handles the PWA Cache Refresh internally.
      scoutRecruits();
      ss.toast('Scout Complete. Check Headhunter tab.', 'Success', 5);
    } catch (e) {
      SpreadsheetApp.getUi().alert(`Error: ${e.message}`);
    }
  });
}

// ----------------------------------------------------------------------------
// 🔍 DIAGNOSTICS & ORCHESTRATION
// ----------------------------------------------------------------------------

/**
 * Diagnostic tool to ensure all modules are loaded and match the Manifest versions.
 * ALSO performs a "Ping Test" on all API keys to verify they aren't banned (403).
 * 
 * REASONING: 
 * - GAS Manual Deployment is error-prone. This verifies file integrity.
 * - API Keys can be banned silently. We must test them against a real endpoint.
 */
function checkSystemHealth() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  ss.toast('Verifying System & Testing API Keys...', 'Health Check', 10);

  const manifest = CONFIG.SYSTEM.MANIFEST;

  // 1. Module Version Check
  const modules = [
    { name: 'Configuration', current: typeof VER_CONFIGURATION !== 'undefined' ? VER_CONFIGURATION : 'MISSING', expected: manifest.CONFIGURATION },
    { name: 'Utilities', current: typeof VER_UTILITIES !== 'undefined' ? VER_UTILITIES : 'MISSING', expected: manifest.UTILITIES },
    { name: 'Orchestrator & Triggers', current: typeof VER_ORCHESTRATOR_TRIGGERS !== 'undefined' ? VER_ORCHESTRATOR_TRIGGERS : 'MISSING', expected: manifest.ORCHESTRATOR_TRIGGERS },
    { name: 'Logger', current: typeof VER_LOGGER !== 'undefined' ? VER_LOGGER : 'MISSING', expected: manifest.LOGGER },
    { name: 'Leaderboard', current: typeof VER_LEADERBOARD !== 'undefined' ? VER_LEADERBOARD : 'MISSING', expected: manifest.LEADERBOARD },
    // 🏆 SCORING SYSTEM CHECK
    { name: 'ScoringSystem', current: typeof VER_SCORING_SYSTEM !== 'undefined' ? VER_SCORING_SYSTEM : 'MISSING', expected: manifest.SCORING_SYSTEM },
    { name: 'Recruiter', current: typeof VER_RECRUITER !== 'undefined' ? VER_RECRUITER : 'MISSING', expected: manifest.RECRUITER },
    { name: 'Controller_Webapp', current: typeof VER_CONTROLLER_WEBAPP !== 'undefined' ? VER_CONTROLLER_WEBAPP : 'MISSING', expected: manifest.CONTROLLER_WEBAPP },
    { name: 'API_Public', current: typeof VER_API_PUBLIC !== 'undefined' ? VER_API_PUBLIC : 'MISSING', expected: manifest.API_PUBLIC }
  ];

  let report = `📂 FILE SYSTEM\n`;
  let healthyFiles = true;

  modules.forEach(m => {
    if (m.current === m.expected) {
      report += `✅ ${m.name}: v${m.current}\n`;
    } else {
      healthyFiles = false;
      report += `❌ ${m.name}: Found v${m.current} (Expected v${m.expected})\n`;
    }
  });

  // 2. Deep API Key Connectivity Check
  report += `\n🔑 API KEY DIAGNOSTICS\n`;
  const keys = CONFIG.SYSTEM.API_KEYS;
  let healthyKeys = true;

  if (!keys || keys.length === 0) {
    report += `❌ No API Keys Configured!\n`;
    healthyKeys = false;
  } else {
    // We use a lightweight endpoint to test the keys: Clan Info
    const testUrl = `${CONFIG.SYSTEM.API_BASE}/clans/${encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG)}`;

    keys.forEach(k => {
      try {
        const response = UrlFetchApp.fetch(testUrl, {
          'method': 'get',
          'headers': {
            'Authorization': `Bearer ${k.value}`,
            'User-Agent': 'ClanManagerHealthCheck/1.0'
          },
          'muteHttpExceptions': true // Prevent crash on 403/404
        });

        const code = response.getResponseCode();

        if (code === 200) {
          report += `✅ ${k.name}: Active (200 OK)\n`;
        } else if (code === 403) {
          report += `❌ ${k.name}: INVALID/BANNED (403)\n`;
          healthyKeys = false;
        } else if (code === 429) {
          report += `⚠️ ${k.name}: Rate Limited (429)\n`;
          // Not technically "broken", just busy
        } else {
          report += `❓ ${k.name}: Error (${code})\n`;
          healthyKeys = false;
        }
      } catch (e) {
        report += `❌ ${k.name}: Network Fail (${e.message})\n`;
        healthyKeys = false;
      }
    });
  }

  const ui = SpreadsheetApp.getUi();
  const overallHealth = healthyFiles && healthyKeys;
  const title = overallHealth ? "System Healthy" : "⚠️ System Issues Detected";

  // Use specific width for the alert to display the full report nicely
  ui.alert(title, report, ui.ButtonSet.OK);
}

/**
 * The primary orchestration function that runs all modules in the correct order.
 * CRITICAL UPDATE: Reordered to ensure Web App payload generates BEFORE Scout.
 * RECOMMENDED TRIGGER: Daily (e.g., 2 AM - 4 AM)
 */
function sequenceFullUpdate() {
  console.log(`👑 MASTER: Initiating Full Sequence (Orchestrator v${VER_ORCHESTRATOR_TRIGGERS})...`);

  // 🛡️ RACE CONDITION PREVENTION
  Utils.executeSafely('MASTER_SEQUENCE', () => {
    try {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      ss.toast('Starting Update Sequence...', CONFIG.UI.MENU_NAME, 5);

      // 1. Critical Data Updates
      const cache = CacheService.getScriptCache();

      console.log("  Step 1: Logging daily data...");
      updateClanDatabase();

      console.log("  Step 2: Updating Leaderboard view...");
      updateLeaderboard();

      // 2. Refresh Web App (Priority: High)
      // We run this BEFORE Recruiter. If Recruiter times out/crashes, 
      // the Clan members still get their updated Leaderboard.
      console.log("  Step 3: Refreshing web app payload (Early Priority)...");
      refreshWebPayload();

      // 3. Optional/Heavy Operations (Priority: Low)
      console.log("  Step 4: Running Headhunter scout (Heavy Operation)...");
      try {
        // scoutRecruits handles its own cache refresh, so we don't need to call it again.
        scoutRecruits();
      } catch (e) {
        // Soft Fail: Log error but don't crash the whole sequence history
        console.warn(`⚠️ Scout Failed (Soft Fail): ${e.message}`);
      }

      console.log("👑 MASTER: Sequence Complete ✅");
      ss.toast('Update Sequence finished successfully!', CONFIG.UI.MENU_NAME, 10);
    } catch (e) {
      console.error(`👑 MASTER FAILED: ${e.stack}`);
      // No email alerts
    }
  });
}

/**
 * Specialized sequence for frequent Headhunter updates.
 * Updates the recruits sheet and immediately refreshes the Web App cache.
 * RECOMMENDED TRIGGER: Time-Driven (Every 6 or 8 Hours)
 */
function sequenceHeadhunterUpdate() {
  console.log(`🔭 HEADHUNTER: Initiating Frequent Scan (Orchestrator v${VER_ORCHESTRATOR_TRIGGERS})...`);

  // 🛡️ RACE CONDITION PREVENTION
  Utils.executeSafely('HH_SEQUENCE', () => {
    try {
      // Note: scoutRecruits now handles the PWA Cache Refresh internally.
      scoutRecruits();

      console.log("🔭 HEADHUNTER: Scan & Cache Refresh Complete ✅");
    } catch (e) {
      console.error(`🔭 HEADHUNTER FAILED: ${e.stack}`);
    }
  });
}
