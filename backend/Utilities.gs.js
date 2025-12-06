

/**
 * ============================================================================
 * 🛠️ MODULE: UTILITIES
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Centralized helper library for the entire project.
 * ⚙️ CAPABILITIES: 
 *    1. Smart API Engine: Caching, Deduplication, Key Rotation, Quota Safety.
 *    2. Date & WeekID Calculation (ISO-like Week Logic).
 *    3. Layout Engine (Standardized "Signature" look for all sheets).
 *    4. Data Parsing (War History String -> Map objects).
 *    5. Backup System (Rolling backups for sheet safety).
 *    6. Cache Engine: Handles 100KB+ payloads via chunking (Fixes GAS Limit).
 * 🏷️ VERSION: 5.0.1
 * ============================================================================
 */

const VER_UTILITIES = '5.0.1';

// 🧠 EXECUTION CACHE: Stores API responses for the duration of one script execution.
// REASONING: Functions often need the same data (e.g., Member List). 
// Storing it here prevents redundant API calls within the same execution flow.
const _EXECUTION_CACHE = new Map();

// 🛡️ API BUDGET: Prevents runaway execution from burning daily quotas.
let _FETCH_COUNT = 0;
// Safety limit: GAS allows ~6 mins. 400 fetches is safe (approx 60-90s execution).
// Increased from 200 -> 400 to support Aggressive Scanning (150 rooms).
const MAX_FETCH_PER_EXECUTION = 400; 

const Utils = { 
  /**
   * ⚡ ULTRA-OPTIMIZED FETCH ENGINE
   * 
   * REASONING:
   * 1. UrlFetchApp.fetchAll is significantly faster than sequential fetches.
   * 2. We manage a pool of keys to avoid hitting Rate Limits on a single key.
   * 3. We auto-remove "Bad Keys" (403/429) during execution to prevent cascade failures.
   */
  fetchRoyaleAPI: function(urls) {
    if (!urls || urls.length === 0) return [];

    // 0. Safety Quota Check
    if (_FETCH_COUNT > MAX_FETCH_PER_EXECUTION) {
      console.error(`⚠️ API Budget Exceeded (${_FETCH_COUNT}/${MAX_FETCH_PER_EXECUTION}). Aborting further fetches to save execution.`);
      // Return nulls to prevent destructuring errors in calling functions
      return new Array(urls.length).fill(null);
    }
    _FETCH_COUNT += urls.length;

    // 1. Initialize Key Pool (Clone objects to local array)
    let keyPool = [...CONFIG.SYSTEM.API_KEYS];
    if (!keyPool || keyPool.length === 0) {
      console.error("CRITICAL: No API Keys (CMV1-CMV10) found in Configuration.");
      throw new Error("Missing API Keys");
    }

    const finalResults = new Array(urls.length).fill(null);
    const urlsToFetch = [];
    const urlIndices = new Map(); // Maps URL string -> [Index 0, Index 5...]

    // 2. Cache Check & Deduplication
    urls.forEach((url, index) => {
      if (_EXECUTION_CACHE.has(url)) {
        finalResults[index] = _EXECUTION_CACHE.get(url);
      } else {
        if (!urlIndices.has(url)) {
          urlIndices.set(url, []);
          urlsToFetch.push(url);
        }
        urlIndices.get(url).push(index);
      }
    });

    if (urlsToFetch.length === 0) return finalResults; // All satisfied by cache

    // 3. Batch Processing
    const BATCH_SIZE = 10; 
    
    for (let c = 0; c < urlsToFetch.length; c += BATCH_SIZE) {
      const chunkUrls = urlsToFetch.slice(c, c + BATCH_SIZE);
      
      // Retry Loop
      for (let attempt = 0; attempt < CONFIG.SYSTEM.RETRY_MAX; attempt++) {
        if (keyPool.length === 0) throw new Error("CRITICAL: All API Keys exhausted.");

        const requests = chunkUrls.map(u => {
          const keyObj = keyPool[Math.floor(Math.random() * keyPool.length)];
          return {
            url: u,
            method: 'get',
            headers: { 
              'Authorization': `Bearer ${keyObj.value}`,
              'User-Agent': 'ClanManagerBot/5.8 (GAS)',
              'Accept-Encoding': 'gzip'
            },
            muteHttpExceptions: true
          };
        });

        try {
          const responses = UrlFetchApp.fetchAll(requests);
          let retryChunk = false;
          
          responses.forEach((r, i) => {
            const code = r.getResponseCode();
            const url = chunkUrls[i];
            
            if (code === 200) {
              try {
                const json = JSON.parse(r.getContentText());
                _EXECUTION_CACHE.set(url, json);
                urlIndices.get(url).forEach(idx => finalResults[idx] = json);
              } catch (e) { console.warn(`JSON Parse Error: ${url}`); }
            } 
            else if (code === 404) {
               _EXECUTION_CACHE.set(url, null); 
               urlIndices.get(url).forEach(idx => finalResults[idx] = null);
            }
            else if (code === 403 || code === 429) {
               // Key exhaustion or rate limit
               const badKeyVal = requests[i].headers['Authorization'].replace('Bearer ', '');
               const keyObj = keyPool.find(k => k.value === badKeyVal);
               const keyName = keyObj ? keyObj.name : 'Unknown Key';
               console.warn(`⚠️ API ${code} on key ${keyName}. Removing.`);
               keyPool = keyPool.filter(k => k.value !== badKeyVal);
               const gIdx = CONFIG.SYSTEM.API_KEYS.findIndex(k => k.value === badKeyVal);
               if (gIdx > -1) CONFIG.SYSTEM.API_KEYS.splice(gIdx, 1);
               retryChunk = true;
            } 
            else {
               if (code >= 500) retryChunk = true;
               console.warn(`API ${code} for ${url}`);
            }
          });

          if (!retryChunk) break; 
          if (retryChunk && attempt < CONFIG.SYSTEM.RETRY_MAX - 1) {
            Utilities.sleep(1000 * (attempt + 1));
          }

        } catch (e) {
          console.error(`Fetch Network Error (Attempt ${attempt + 1}): ${e.message}`);
          if (attempt < CONFIG.SYSTEM.RETRY_MAX - 1) Utilities.sleep(2000);
        }
      } 
      Utilities.sleep(200); 
    }

    return finalResults;
  },

  /**
   * 💾 CACHE HANDLER
   * REASONING: Google Apps Script CacheService has a strict 100KB limit per key.
   * Our full member/headhunter JSON often exceeds this. 
   * We split the data into chunks (key_0, key_1...) and reassemble on retrieval.
   */
  CacheHandler: {
    putLarge: function(key, value, expirationSec = 21600) {
      const cache = CacheService.getScriptCache();
      const CHUNK_SIZE = 90000; // 90KB safe limit

      if (value.length <= CHUNK_SIZE) {
        cache.put(key, value, expirationSec);
        cache.remove(key + "_meta"); // Clear old chunks if any
        return;
      }

      // Chunking required
      const chunks = value.match(new RegExp('.{1,' + CHUNK_SIZE + '}', 'g'));
      chunks.forEach((chunk, i) => {
        cache.put(key + "_" + i, chunk, expirationSec);
      });

      // Save Metadata
      cache.put(key + "_meta", JSON.stringify({ count: chunks.length }), expirationSec);
      cache.remove(key); // Remove standard key to avoid confusion
      console.log(`💾 Cache: Split ${Math.round(value.length/1024)}KB into ${chunks.length} chunks.`);
    },

    getLarge: function(key) {
      const cache = CacheService.getScriptCache();
      
      // 1. Try standard get (migration path)
      const standard = cache.get(key);
      if (standard) return standard;

      // 2. Try chunked get
      const meta = cache.get(key + "_meta");
      if (meta) {
        try {
          const { count } = JSON.parse(meta);
          const keys = [];
          for (let i = 0; i < count; i++) keys.push(key + "_" + i);
          
          const chunks = cache.getAll(keys);
          let fullString = "";
          // Reassemble in order
          for (let i = 0; i < count; i++) {
            const part = chunks[key + "_" + i];
            if (!part) return null; // Corrupted cache (missing part)
            fullString += part;
          }
          return fullString;
        } catch (e) {
          console.warn("Cache reassembly failed: " + e.message);
          return null;
        }
      }
      return null;
    }
  },

  formatDate: function(date) { 
    if (!date || isNaN(date.getTime())) return ""; 
    return Utilities.formatDate(date, CONFIG.SYSTEM.TIMEZONE, 'yyyy-MM-dd'); 
  },
  
  /**
   * Robust parser for RoyaleAPI's compact ISO format: 20231105T100000.000Z
   * Standard JS new Date() fails on this in GAS V8.
   */
  parseRoyaleApiDate: function(dateStr) {
    if (!dateStr) return new Date();
    if (dateStr instanceof Date) return dateStr;
    
    // Check if it matches the Compact ISO format
    // regex: YYYYMMDDThhmmss
    if (/^\d{8}T\d{6}/.test(dateStr)) {
      const y = parseInt(dateStr.substr(0,4), 10);
      const m = parseInt(dateStr.substr(4,2), 10) - 1; // Months are 0-based
      const d = parseInt(dateStr.substr(6,2), 10);
      const h = parseInt(dateStr.substr(9,2), 10);
      const min = parseInt(dateStr.substr(11,2), 10);
      const s = parseInt(dateStr.substr(13,2), 10);
      return new Date(Date.UTC(y, m, d, h, min, s));
    }
    
    // Fallback to standard parser
    return new Date(dateStr);
  },

  calculateWarWeekId: function(d) {
    // Ensure we have a valid date object
    if (!d || isNaN(d.getTime())) return "Unknown";
    
    const date = new Date(d.getTime());
    date.setHours(0,0,0,0);
    date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
    const week1 = new Date(date.getFullYear(), 0, 4);
    const weekNum = 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
    const yearShort = date.getFullYear().toString().slice(-2);
    return `${yearShort}W${weekNum.toString().padStart(2, '0')}`;
  },

  parseWarHistory: function(histStr) {
    const historyMap = new Map();
    if (!histStr || histStr === "-" || typeof histStr !== 'string') return historyMap;
    histStr.split(' | ').forEach(entry => {
      const parts = entry.trim().split(' '); 
      if (parts.length === 2) historyMap.set(parts[1], Number(parts[0]));
    });
    return historyMap;
  },
  
  /**
   * 🔀 FISHER-YATES SHUFFLE
   * Randomizes an array in-place. Used for stochastic tournament selection.
   */
  shuffleArray: function(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  // 🛡️ SMART BACKUP SYSTEM
  // REASONING: 
  // 1. Prevents Data Loss during failures.
  // 2. Checks for duplicates to avoid filling backup history with identical sheets.
  // 3. ROLLING WINDOW + ORDERING: Keeps backups explicitly ordered next to source.
  backupSheet: function(ss, sheetName) {
    try {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return; 

      const MAX_BACKUPS = 5;
      const backup1Name = `Backup 1 ${sheetName}`;
      const existingBackup1 = ss.getSheetByName(backup1Name);

      // 1. SMART REDUNDANCY CHECK
      if (existingBackup1) {
        const currentLastRow = sheet.getLastRow();
        const currentLastCol = sheet.getLastColumn();
        
        // Fast Fail: Dimension Mismatch
        if (currentLastRow === existingBackup1.getLastRow() && 
            currentLastCol === existingBackup1.getLastColumn()) {
          
          // Deep Check: Content Hash
          // CHANGE: Ignore Row 1 (Timestamp/Status) to avoid spamming backups when only time updates.
          const startRow = currentLastRow > 1 ? 2 : 1;
          const numRows = currentLastRow > 1 ? currentLastRow - startRow + 1 : 1;
          
          // Guard for empty sheets
          if (currentLastRow === 0) return;

          const currentData = sheet.getRange(startRow, 1, numRows, currentLastCol).getValues();
          const backupData = existingBackup1.getRange(startRow, 1, numRows, currentLastCol).getValues();
          
          if (JSON.stringify(currentData) === JSON.stringify(backupData)) {
            console.log(`🛡️ Pre-Modification Backup: Skipped (Current sheet matches Backup 1).`);
            return;
          } else {
            // Debug Log for Users
            console.log(`🛡️ Pre-Modification Backup: Proceeding (Content changed since last run).`);
          }
        } else {
           console.log(`🛡️ Pre-Modification Backup: Proceeding (Dimensions changed).`);
        }
      }

      console.log(`🛡️ Creating new backup for '${sheetName}'...`);

      // 2. ROTATE OLD BACKUPS
      // Delete the oldest
      const oldestName = `Backup ${MAX_BACKUPS} ${sheetName}`;
      const oldest = ss.getSheetByName(oldestName);
      if (oldest) ss.deleteSheet(oldest);

      // Shift others up (Backup 4 -> Backup 5)
      for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
        const currentName = `Backup ${i} ${sheetName}`;
        const nextName = `Backup ${i + 1} ${sheetName}`;
        const existing = ss.getSheetByName(currentName);
        if (existing) existing.setName(nextName);
      }

      // 3. CREATE NEW SNAPSHOT
      // copyTo creates the sheet at the end of the spreadsheet by default.
      const copy = sheet.copyTo(ss);
      copy.setName(backup1Name);
      copy.setTabColor(null); // Clean visual
      
      // 4. REORDERING LOGIC
      // Move the new Backup 1 to be immediately after the Source Sheet.
      // e.g. Source (Index 1) -> Backup 1 (Index 2) -> Backup 2 (Index 3)
      const sourceIndex = sheet.getIndex(); // 1-based index
      copy.activate(); // Required for moveActiveSheet
      ss.moveActiveSheet(sourceIndex + 1);
      
      // 5. HIDE AFTER MOVING
      // Hiding before moving can sometimes cause issues with activate()
      copy.hideSheet();

      // Return focus to the original sheet so the user doesn't get disoriented
      sheet.activate();
      
    } catch (e) {
      console.warn(`⚠️ Backup Failed for '${sheetName}': ${e.message}`);
      // Non-blocking error
    }
  },

  // Helper: Draws the Mobile Checkbox in A1 with specific styling
  drawMobileCheckbox: function(sheet) {
    if (!sheet) return;
    const mobileTrigger = sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL || 'A1');
    if (mobileTrigger.getDataValidation() == null || mobileTrigger.getDataValidation().getCriteriaType() != SpreadsheetApp.DataValidationCriteria.CHECKBOX) {
      mobileTrigger.insertCheckboxes();
    }
    // Updated: Removed Red background for cleaner look
    mobileTrigger.setBackground(null) 
                 .setFontColor(null)
                 .setHorizontalAlignment("center")
                 .setVerticalAlignment("middle")
                 .setNote('⚡ QUICK UPDATE:\nClick/Tap this checkbox to run the update for this specific tab.\n(Requires "Enable Mobile Controls" setup once).');
  },

  // Helper: Iterates through all key sheets and forces the mobile checkbox to appear.
  // Useful when enabling controls for the first time, so user doesn't have to wait for a layout update.
  refreshMobileControls: function(ss) {
    const sheets = [CONFIG.SHEETS.DB, CONFIG.SHEETS.LB, CONFIG.SHEETS.HH];
    sheets.forEach(name => {
      const sheet = ss.getSheetByName(name);
      if (sheet) {
        Utils.drawMobileCheckbox(sheet);
        // Ensure it starts unchecked
        sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL || 'A1').setValue(false);
      }
    });
  },

  // REASONING: Ensures consistent UI across all tabs (buffers, hidden gridlines) without manual formatting.
  // RULES: 
  // 1. Column Width: Fixed 100
  // 2. Alignment: Center/Middle
  // 3. Headers: Wrap
  // 4. Data: Overflow (Clip)
  // 5. Borders: Outer Table + Header All
  // 6. Banding: Include Header
  // 7. Mobile Trigger: Ensure A1 is a red checkbox.
  // 8. Auto-Schema: If headers are provided, they are enforced on Row 2.
  applyStandardLayout: function(sheet, contentRows, contentCols, optHeaders = null) {
    if (!sheet) return;

    const L = CONFIG.LAYOUT;
    const DATA_START_ROW = L.DATA_START_ROW; // 3
    const HEADER_ROW = 2;
    const STATUS_ROW = 1;
    const COL_BUFFER_LEFT = 1; 
    const COL_DATA_START = 2;

    // 🧠 SCHEMA ADAPTATION:
    // If headers are provided, they dictate the column structure.
    if (Array.isArray(optHeaders) && optHeaders.length > 0) {
      contentCols = optHeaders.length;
    }

    const lastDataRow = (DATA_START_ROW - 1) + Math.max(contentRows, 0); 
    const totalRows = Math.max(lastDataRow + 1, DATA_START_ROW + 1); // Ensure minimal buffer
    const lastDataCol = (COL_DATA_START - 1) + contentCols;
    const totalCols = lastDataCol + 1; // Right buffer

    const currentRows = sheet.getMaxRows();
    const currentCols = sheet.getMaxColumns();

    // 1. DIMENSION CONTROL (Smart Resize)
    if (currentRows < totalRows) sheet.insertRowsAfter(currentRows, totalRows - currentRows);
    if (currentCols < totalCols) sheet.insertColumnsAfter(currentCols, totalCols - currentCols);
    
    // Safety: Only delete if we are strictly formatting a known controlled sheet.
    // Given this is an internal tool, clean borders are preferred.
    if (currentRows > totalRows) sheet.deleteRows(totalRows + 1, currentRows - totalRows);
    if (currentCols > totalCols) sheet.deleteColumns(totalCols + 1, currentCols - totalCols);

    // 2. BUFFER SETUP
    try {
        sheet.setColumnWidth(COL_BUFFER_LEFT, L.BUFFER_SIZE); 
        sheet.setColumnWidth(totalCols, L.BUFFER_SIZE);       
        sheet.setRowHeight(totalRows, L.BUFFER_SIZE); 
    } catch(e) { console.warn("Layout: Resize buffer failed", e); }        

    // Clear Buffers (Preserving A1)
    // We explicitly clear borders and formatting to ensure no artifacts remain if schema shrunk.
    const buffers = [];
    
    // Left Buffer (Below A1)
    if (totalRows >= 2) buffers.push(sheet.getRange(2, COL_BUFFER_LEFT, totalRows - 1, 1));
    // Right Buffer (Entire col)
    buffers.push(sheet.getRange(1, totalCols, totalRows, 1));
    // Bottom Buffer (Entire row)
    buffers.push(sheet.getRange(totalRows, 1, 1, totalCols));

    buffers.forEach(rng => {
        rng.setBackground(null)
           .clearContent()
           .clearDataValidations() // Ensure no leftover checkboxes/dropdowns
           .clearNote() // Clear notes
           .setBorder(false, false, false, false, false, false); // Explicitly remove borders
    });

    // 3. MOBILE TRIGGER (A1)
    Utils.drawMobileCheckbox(sheet);

    if (contentCols > 0) {
      // Column Widths
      sheet.setColumnWidths(COL_DATA_START, contentCols, 100);

      // Status Row (Merged)
      // Break merges first to avoid overlap errors if schema changed
      sheet.getRange(STATUS_ROW, 1, 1, totalCols).breakApart();
      
      const statusRange = sheet.getRange(STATUS_ROW, COL_DATA_START, 1, contentCols);
      statusRange.merge()
           .setHorizontalAlignment("left").setVerticalAlignment("middle")
           .setFontWeight("bold").setFontColor("#888888");

      // Table Range (Header + Data)
      const tableRows = 1 + contentRows; 
      const tableRange = sheet.getRange(HEADER_ROW, COL_DATA_START, tableRows, contentCols);

      // Clear existing bandings to prevent corruption/overlap
      const existingBandings = sheet.getBandings();
      if (existingBandings) existingBandings.forEach(b => b.remove());
      
      // Apply Banding
      tableRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
      
      // Borders: Outer Border for Table
      tableRange.setBorder(true, true, true, true, null, null); 

      // Header Formatting
      const headerRange = sheet.getRange(HEADER_ROW, COL_DATA_START, 1, contentCols);
      
      // If headers provided, write them now
      if (Array.isArray(optHeaders) && optHeaders.length > 0) {
          headerRange.setValues([optHeaders]);
      }

      headerRange.setBorder(true, true, true, true, true, true) 
                 .setFontWeight("bold")
                 .setHorizontalAlignment("center")
                 .setVerticalAlignment("middle")
                 .setWrap(true);

      // Data Formatting
      if (contentRows > 0) {
        const dataRange = sheet.getRange(DATA_START_ROW, COL_DATA_START, contentRows, contentCols);
        dataRange.setHorizontalAlignment("center")
                 .setVerticalAlignment("middle")
                 .setWrap(false);
      }
    }
    sheet.setHiddenGridlines(true);
  }
};