
/**
 * ============================================================================
 * 📊 MODULE: LOGGER (DATABASE)
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Extracts API data and persists it to 'Clan Database'.
 * ⚙️ LOGIC: 
 *    - Captures Daily Snapshots of Donations, Roles, Trophies, AND War Fame.
 *    - SMART PRUNING: Deletes historical data of players who left > 7 days ago.
 *    - SMART MERGE: Updates existing rows for Today, appends new ones.
 *      (Preserves data for players who leave mid-day).
 * 🏷️ VERSION: 6.0.1
 * 
 * 🧠 REASONING:
 *    - "Snapshots": We need a history of performance (War + Donos).
 *    - "Smart Merge": If this runs twice in one day, it shouldn't create duplicate
 *      rows. It must find "Today's" row and update it.
 * ============================================================================
 */

const VER_LOGGER = '6.0.1';

function updateClanDatabase() {
  console.time('ETL');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  try {
    const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
    
    // ⚡ UPDATE: Fetching BOTH Members and War Race data to build a complete profile
    const urls = [
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/currentriverrace`
    ];
    
    const [membersData, raceData] = Utils.fetchRoyaleAPI(urls);
    
    // 🛑 CIRCUIT BREAKER: API FAILURE
    // If the API fails or returns empty data (Maintenance/Rate Limit), 
    // ABORT IMMEDIATELY to prevent wiping the database with zeros.
    if (!membersData || !membersData.items || membersData.items.length === 0) {
      console.error("⛔ ETL ABORTED: API returned empty or invalid member data. Database NOT updated.");
      return; 
    }

    const activeMembers = membersData.items;
    const activeTags = new Set(activeMembers.map(m => m.tag));
    
    // 🗺️ MAP WAR FAME: Tag -> Fame
    const warFameMap = new Map();
    if (raceData && raceData.clan && raceData.clan.participants) {
      raceData.clan.participants.forEach(p => {
        // Fallbacks for various API states (fame vs medals vs repairPoints)
        const val = p.fame || p.medals || p.repairPoints || 0;
        warFameMap.set(p.tag, val);
      });
    }
    
    let sheet = ss.getSheetByName(CONFIG.SHEETS.DB);
    if (!sheet) sheet = ss.insertSheet(CONFIG.SHEETS.DB);
    
    const HEADER = ['Date', 'Tag', 'Name', 'Role', 'Trophies', 'Donations Given', 'Donations Received', 'Last Seen', 'War Fame'];
    
    // Ensure Header exists
    if (sheet.getLastRow() < 1) {
       sheet.getRange(2, 2, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold').setWrap(true);
    }

    // 🛡️ SCHEMA MIGRATION: Ensure sheet has enough columns
    // This prevents "Out of Bounds" errors when we add the 'War Fame' column to an old sheet.
    // +2 accounts for Buffer Left (1) and Buffer Right (1) implicitly.
    const requiredCols = HEADER.length + 2; 
    if (sheet.getMaxColumns() < requiredCols) {
      sheet.insertColumnsAfter(sheet.getMaxColumns(), requiredCols - sheet.getMaxColumns());
    }

    // 🛡️ BACKUP: Perform backup right before we start modifying the sheet
    // This prevents creating backups if the API fetch failed earlier.
    Utils.backupSheet(ss, CONFIG.SHEETS.DB);

    // 🧹 STEP 1: PRUNE STALE DATA (Retroactive Cleaning)
    // Remove history for players who are NOT in the clan and haven't been seen in X days
    pruneStaleData(sheet, activeTags);

    // 📥 STEP 2: SMART MERGE TODAY'S DATA
    upsertDailySnapshots(sheet, activeMembers, warFameMap, HEADER);

    console.timeEnd('ETL');
  } catch (e) { console.error(`ETL Error: ${e.message} \n${e.stack}`); }
}

/**
 * Prunes rows for players who are NOT currently in the clan AND
 * whose most recent entry in the DB is older than CONFIG.DB_PURGE_DAYS.
 * This runs on the ENTIRE dataset, cleaning up years of history if necessary.
 * 
 * REASONING: Spreadsheet performance degrades exponentially with row count.
 * We must remove data for members who left long ago.
 */
function pruneStaleData(sheet, activeTags) {
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;
  const lastRow = sheet.getLastRow();
  
  if (lastRow < startRow) return;

  const S_DB = CONFIG.SCHEMA.DB;
  const numCols = Object.keys(S_DB).length;
  
  // Read entire DB into memory
  // ⚠️ Safety: Limit read to max columns to avoid bounds error during migration
  const safeCols = Math.min(numCols, sheet.getMaxColumns() - 1);
  const range = sheet.getRange(startRow, 2, lastRow - startRow + 1, safeCols);
  const data = range.getValues();
  
  // 1. Map every tag to its latest Date seen in the DB
  const tagLastSeenMap = new Map();
  const tagNameMap = new Map(); // Store the most recent name for logging purposes
  
  data.forEach(row => {
    const tag = row[S_DB.TAG];
    const dateVal = row[S_DB.DATE] ? new Date(row[S_DB.DATE]) : new Date(0);
    
    if (!tagLastSeenMap.has(tag) || dateVal > tagLastSeenMap.get(tag)) {
      tagLastSeenMap.set(tag, dateVal);
      tagNameMap.set(tag, row[S_DB.NAME]);
    }
  });

  // 2. Identify Tags to Purge
  // Criteria: Tag NOT in active list AND Latest Date < Cutoff
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CONFIG.SYSTEM.DB_PURGE_DAYS);
  
  const tagsToPurge = new Set();
  const purgedDetails = [];
  let purgeCount = 0;
  
  tagLastSeenMap.forEach((lastDate, tag) => {
    if (!activeTags.has(tag) && lastDate < cutoff) {
      tagsToPurge.add(tag);
      const name = tagNameMap.get(tag) || "Unknown";
      purgedDetails.push(`${name} (${tag})`);
    }
  });

  if (tagsToPurge.size === 0) {
    console.log("🧹 Pruning: No stale members found.");
    return;
  }

  // 3. Filter Data (Atomic Delete)
  console.log(`🧹 Pruning: Removing ${tagsToPurge.size} old members from history:\n${purgedDetails.join('\n')}`);
  
  const cleanData = data.filter(row => {
    const shouldPurge = tagsToPurge.has(row[S_DB.TAG]);
    if (shouldPurge) purgeCount++;
    return !shouldPurge;
  });
  
  // 4. Write Back (Atomic Replace)
  // Clear the entire data range
  range.clearContent();
  
  // Write the filtered data back starting from the top
  if (cleanData.length > 0) {
    sheet.getRange(startRow, 2, cleanData.length, safeCols).setValues(cleanData);
  }
  console.log(`🧹 Pruning Complete: Removed ${purgeCount} rows.`);
}

/**
 * MERGE STRATEGY:
 * 1. Find all rows belonging to "Today".
 * 2. Update existing players with latest stats.
 * 3. Append new players who aren't in the sheet yet.
 * 4. LEAVE players who are in the sheet but left the clan (preserve daily history).
 * 
 * REASONING: "Upsert" prevents duplicate rows if the script runs multiple times in one day.
 */
function upsertDailySnapshots(sheet, activeMembers, warFameMap, headerRow) {
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;
  const S_DB = CONFIG.SCHEMA.DB;
  const today = new Date();
  const todayStr = Utils.formatDate(today);
  const parseTime = (t) => t ? new Date(t.replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2}).*/, '$1-$2-$3T$4:$5:$6Z')) : new Date();

  // 🛡️ FAILSAFE: DB_ROW_LIMIT
  if (sheet.getLastRow() > CONFIG.SYSTEM.DB_ROW_LIMIT) {
    console.warn("⚠️ Database Row Limit Reached.");
    return; 
  }

  const lastRow = sheet.getLastRow();
  let todayDataRange = null;
  let todayValues = [];
  let firstRowIndex = -1;

  // 1. Sort & Locate "Today's" Block
  if (lastRow >= startRow) {
    // Sort by Date to ensure contiguous blocks
    sheet.getRange(startRow, 2, lastRow - startRow + 1, headerRow.length)
         .sort({column: 2 + S_DB.DATE, ascending: true});
         
    const dateValues = sheet.getRange(startRow, 2 + S_DB.DATE, lastRow - startRow + 1, 1).getValues();
    
    // Find start and end of "Today"
    let startIdx = -1;
    let count = 0;
    
    for (let i = 0; i < dateValues.length; i++) {
      const d = dateValues[i][0] ? new Date(dateValues[i][0]) : null;
      if (d && Utils.formatDate(d) === todayStr) {
        if (startIdx === -1) startIdx = i;
        count++;
      }
    }

    if (startIdx !== -1) {
      firstRowIndex = startRow + startIdx;
      // Get the actual data for today
      todayDataRange = sheet.getRange(firstRowIndex, 2, count, headerRow.length);
      todayValues = todayDataRange.getValues();
    }
  }

  // 2. Prepare Updates
  const processedTags = new Set();
  let updatesMade = false;

  // Map existing rows for O(1) lookup
  // Map: Tag -> { rowIndex (0-based relative to todayValues), rowData }
  const existingMap = new Map();
  todayValues.forEach((row, idx) => {
    existingMap.set(row[S_DB.TAG], idx);
  });

  // 3. Process API Data
  const newRowsToAppend = [];

  activeMembers.forEach(m => {
    const warFame = warFameMap.get(m.tag) || 0; // Get fame from race data

    if (existingMap.has(m.tag)) {
      // UPDATE EXISTING ROW
      const idx = existingMap.get(m.tag);
      const currentRow = todayValues[idx];
      
      // Update mutable stats
      currentRow[S_DB.NAME] = m.name;
      currentRow[S_DB.ROLE] = m.role;
      currentRow[S_DB.TROPHIES] = m.trophies;
      currentRow[S_DB.DON_GIVEN] = m.donations;
      currentRow[S_DB.DON_REC] = m.donationsReceived;
      currentRow[S_DB.LAST_SEEN] = parseTime(m.lastSeen);
      currentRow[S_DB.WAR_FAME] = warFame; // Update War Fame
      
      updatesMade = true;
      processedTags.add(m.tag);
    } else {
      // PREPARE NEW ROW
      newRowsToAppend.push([
        today, m.tag, m.name, m.role, m.trophies, 
        m.donations, m.donationsReceived, parseTime(m.lastSeen),
        warFame // Add War Fame
      ]);
    }
  });

  // 4. Commit Updates (Batch Write)
  if (updatesMade && todayDataRange) {
    console.log(`ETL: Updating ${processedTags.size} existing records for ${todayStr}.`);
    todayDataRange.setValues(todayValues);
  }

  // 5. Commit Appends (Batch Write)
  if (newRowsToAppend.length > 0) {
    console.log(`ETL: Appending ${newRowsToAppend.length} new records for ${todayStr}.`);
    const writeRow = sheet.getLastRow() + 1;
    const safeWriteRow = Math.max(writeRow, startRow);
    
    sheet.getRange(safeWriteRow, 2, newRowsToAppend.length, headerRow.length)
         .setValues(newRowsToAppend)
         .setHorizontalAlignment('center');
  }

  sheet.getRange('B1').setValue(`DATABASE • ${new Date().toLocaleString()}`);
  
  // 🧹 LAYOUT & CLEANUP
  // Pass HEADER (headerRow) to applyStandardLayout to enforce schema
  Utils.applyStandardLayout(sheet, sheet.getLastRow() - (startRow - 1), headerRow.length, headerRow);
  
  // 📏 COLUMN WIDTHS & FORMATTING
  const currentLastRow = sheet.getLastRow();
  const dataRowCount = currentLastRow - (startRow - 1);
  
  if (dataRowCount > 0) {
    const sRow = startRow;
    sheet.getRange(sRow, 2 + S_DB.DATE, dataRowCount, 1).setNumberFormat("yyyy-mm-dd");
    sheet.getRange(sRow, 2 + S_DB.TAG, dataRowCount, 3).setNumberFormat("@");
    sheet.getRange(sRow, 2 + S_DB.TROPHIES, dataRowCount, 3).setNumberFormat("0");
    sheet.getRange(sRow, 2 + S_DB.LAST_SEEN, dataRowCount, 1).setNumberFormat("yyyy-mm-dd hh:mm:ss");
    // Format new War Fame column
    sheet.getRange(sRow, 2 + S_DB.WAR_FAME, dataRowCount, 1).setNumberFormat("0"); 
  }
}
