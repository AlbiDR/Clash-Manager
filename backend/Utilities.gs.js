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
 *    7. Safety Lock: Mutex locking to prevent Race Conditions.
 *    8. Properties Manager: Safe JSON handling for Script Properties.
 * 🏷️ VERSION: 5.1.0
 * ============================================================================
 */

const VER_UTILITIES = '5.1.0';

// 🧠 EXECUTION CACHE: Stores API responses for the duration of one script execution.
const _EXECUTION_CACHE = new Map();

// 🛡️ API BUDGET: Prevents runaway execution from burning daily quotas.
let _FETCH_COUNT = 0;
const MAX_FETCH_PER_EXECUTION = 400; 

const Utils = { 
  /**
   * 🔒 EXECUTE SAFELY (Mutex Lock)
   * Prevents race conditions by acquiring a Script Lock before running critical code.
   * Useful for ensuring only one update runs at a time.
   * 
   * @param {string} lockKey - Name of the process for logging (e.g. "UPDATE_DB")
   * @param {Function} callback - The code to run if lock is acquired
   * @return {any} The result of the callback
   */
  executeSafely: function(lockKey, callback) {
    const lock = LockService.getScriptLock();
    try {
      // Attempt to acquire lock for 30 seconds.
      // If locked by ANOTHER execution, it waits.
      const success = lock.tryLock(30000);
      
      if (!success) {
        console.warn(`🔒 RACE PREVENTED: Could not acquire lock for '${lockKey}'. System is busy.`);
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        try { ss.toast('System is busy. Please try again in 30s.', '⚠️ Locked'); } catch(e) {}
        throw new Error(`System Busy: Could not acquire lock for ${lockKey}`);
      }

      // Lock acquired, run critical section
      return callback();

    } catch (e) {
      // Re-throw to ensure caller knows it failed
      throw e;
    } finally {
      // Always release the lock, even if callback fails
      lock.releaseLock();
    }
  },

  /**
   * 💾 PROPS MANAGER (Script Properties Wrapper)
   * Centralizes access to persistent storage for Metadata and Config.
   * robust against JSON errors and handles type conversion.
   */
  Props: {
    _service: PropertiesService.getScriptProperties(),

    get: function(key, defaultVal = null) {
      const val = this._service.getProperty(key);
      return val !== null ? val : defaultVal;
    },

    set: function(key, val) {
      this._service.setProperty(key, String(val));
    },

    getJSON: function(key, defaultVal = {}) {
      const raw = this._service.getProperty(key);
      if (!raw) return defaultVal;
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.warn(`⚠️ Props: JSON Parse error for key '${key}'. Resetting to default.`);
        return defaultVal;
      }
    },

    setJSON: function(key, val) {
      try {
        const str = JSON.stringify(val);
        // Check size limit (9KB per value)
        if (str.length > 9000) {
          console.warn(`⚠️ Props: Value for '${key}' exceeds 9KB limit. Save aborted.`);
          return false;
        }
        this._service.setProperty(key, str);
        return true;
      } catch (e) {
        console.error(`⚠️ Props: JSON Stringify error for '${key}': ${e.message}`);
        return false;
      }
    },
    
    delete: function(key) {
      this._service.deleteProperty(key);
    }
  },

  /**
   * ⚡ ULTRA-OPTIMIZED FETCH ENGINE
   */
  fetchRoyaleAPI: function(urls) {
    if (!urls || urls.length === 0) return [];

    // 0. Safety Quota Check
    if (_FETCH_COUNT > MAX_FETCH_PER_EXECUTION) {
      console.error(`⚠️ API Budget Exceeded (${_FETCH_COUNT}/${MAX_FETCH_PER_EXECUTION}). Aborting further fetches.`);
      return new Array(urls.length).fill(null);
    }
    _FETCH_COUNT += urls.length;

    // 1. Initialize Key Pool
    let keyPool = [...CONFIG.SYSTEM.API_KEYS];
    if (!keyPool || keyPool.length === 0) {
      throw new Error("CRITICAL: No API Keys (CMV1-CMV10) found in Configuration.");
    }

    const finalResults = new Array(urls.length).fill(null);
    const urlsToFetch = [];
    const urlIndices = new Map(); 

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

    if (urlsToFetch.length === 0) return finalResults;

    // 3. Batch Processing
    const BATCH_SIZE = 10; 
    
    for (let c = 0; c < urlsToFetch.length; c += BATCH_SIZE) {
      const chunkUrls = urlsToFetch.slice(c, c + BATCH_SIZE);
      
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
   * 💾 CACHE HANDLER (Chunking for >100KB Payloads)
   */
  CacheHandler: {
    putLarge: function(key, value, expirationSec = 21600) {
      const cache = CacheService.getScriptCache();
      const CHUNK_SIZE = 90000; // 90KB safe limit

      if (value.length <= CHUNK_SIZE) {
        cache.put(key, value, expirationSec);
        cache.remove(key + "_meta");
        return;
      }

      const chunks = value.match(new RegExp('.{1,' + CHUNK_SIZE + '}', 'g'));
      chunks.forEach((chunk, i) => {
        cache.put(key + "_" + i, chunk, expirationSec);
      });

      cache.put(key + "_meta", JSON.stringify({ count: chunks.length }), expirationSec);
      cache.remove(key); 
    },

    getLarge: function(key) {
      const cache = CacheService.getScriptCache();
      const standard = cache.get(key);
      if (standard) return standard;

      const meta = cache.get(key + "_meta");
      if (meta) {
        try {
          const { count } = JSON.parse(meta);
          const keys = [];
          for (let i = 0; i < count; i++) keys.push(key + "_" + i);
          
          const chunks = cache.getAll(keys);
          let fullString = "";
          for (let i = 0; i < count; i++) {
            const part = chunks[key + "_" + i];
            if (!part) return null; 
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
  
  parseRoyaleApiDate: function(dateStr) {
    if (!dateStr) return new Date();
    if (dateStr instanceof Date) return dateStr;
    if (/^\d{8}T\d{6}/.test(dateStr)) {
      const y = parseInt(dateStr.substr(0,4), 10);
      const m = parseInt(dateStr.substr(4,2), 10) - 1;
      const d = parseInt(dateStr.substr(6,2), 10);
      const h = parseInt(dateStr.substr(9,2), 10);
      const min = parseInt(dateStr.substr(11,2), 10);
      const s = parseInt(dateStr.substr(13,2), 10);
      return new Date(Date.UTC(y, m, d, h, min, s));
    }
    return new Date(dateStr);
  },

  calculateWarWeekId: function(d) {
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
  
  shuffleArray: function(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  },

  backupSheet: function(ss, sheetName) {
    try {
      const sheet = ss.getSheetByName(sheetName);
      if (!sheet) return; 

      const MAX_BACKUPS = 5;
      const backup1Name = `Backup 1 ${sheetName}`;
      const existingBackup1 = ss.getSheetByName(backup1Name);

      if (existingBackup1) {
        const currentLastRow = sheet.getLastRow();
        const currentLastCol = sheet.getLastColumn();
        
        if (currentLastRow === existingBackup1.getLastRow() && 
            currentLastCol === existingBackup1.getLastColumn()) {
          
          const startRow = currentLastRow > 1 ? 2 : 1;
          const numRows = currentLastRow > 1 ? currentLastRow - startRow + 1 : 1;
          if (currentLastRow === 0) return;

          const currentData = sheet.getRange(startRow, 1, numRows, currentLastCol).getValues();
          const backupData = existingBackup1.getRange(startRow, 1, numRows, currentLastCol).getValues();
          
          if (JSON.stringify(currentData) === JSON.stringify(backupData)) {
            console.log(`🛡️ Pre-Modification Backup: Skipped (Matches Backup 1).`);
            return;
          }
        }
      }

      console.log(`🛡️ Creating new backup for '${sheetName}'...`);
      const oldestName = `Backup ${MAX_BACKUPS} ${sheetName}`;
      const oldest = ss.getSheetByName(oldestName);
      if (oldest) ss.deleteSheet(oldest);

      for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
        const currentName = `Backup ${i} ${sheetName}`;
        const nextName = `Backup ${i + 1} ${sheetName}`;
        const existing = ss.getSheetByName(currentName);
        if (existing) existing.setName(nextName);
      }

      const copy = sheet.copyTo(ss);
      copy.setName(backup1Name);
      copy.setTabColor(null); 
      
      const sourceIndex = sheet.getIndex(); 
      ss.moveActiveSheet(sourceIndex + 1);
      copy.hideSheet();
      sheet.activate();
      
    } catch (e) {
      console.warn(`⚠️ Backup Failed for '${sheetName}': ${e.message}`);
    }
  },

  drawMobileCheckbox: function(sheet) {
    if (!sheet) return;
    const mobileTrigger = sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL || 'A1');
    if (mobileTrigger.getDataValidation() == null || mobileTrigger.getDataValidation().getCriteriaType() != SpreadsheetApp.DataValidationCriteria.CHECKBOX) {
      mobileTrigger.insertCheckboxes();
    }
    mobileTrigger.setBackground(null) 
                 .setFontColor(null)
                 .setHorizontalAlignment("center")
                 .setVerticalAlignment("middle")
                 .setNote('⚡ QUICK UPDATE:\nClick/Tap this checkbox to run the update for this specific tab.\n(Requires "Enable Mobile Controls" setup once).');
  },

  refreshMobileControls: function(ss) {
    const sheets = [CONFIG.SHEETS.DB, CONFIG.SHEETS.LB, CONFIG.SHEETS.HH];
    sheets.forEach(name => {
      const sheet = ss.getSheetByName(name);
      if (sheet) {
        Utils.drawMobileCheckbox(sheet);
        sheet.getRange(CONFIG.UI.MOBILE_TRIGGER_CELL || 'A1').setValue(false);
      }
    });
  },

  applyStandardLayout: function(sheet, contentRows, contentCols, optHeaders = null) {
    if (!sheet) return;

    const L = CONFIG.LAYOUT;
    const DATA_START_ROW = L.DATA_START_ROW; 
    const HEADER_ROW = 2;
    const STATUS_ROW = 1;
    const COL_BUFFER_LEFT = 1; 
    const COL_DATA_START = 2;

    if (Array.isArray(optHeaders) && optHeaders.length > 0) {
      contentCols = optHeaders.length;
    }

    const lastDataRow = (DATA_START_ROW - 1) + Math.max(contentRows, 0); 
    const totalRows = Math.max(lastDataRow + 1, DATA_START_ROW + 1); 
    const lastDataCol = (COL_DATA_START - 1) + contentCols;
    const totalCols = lastDataCol + 1; 

    const currentRows = sheet.getMaxRows();
    const currentCols = sheet.getMaxColumns();

    if (currentRows < totalRows) sheet.insertRowsAfter(currentRows, totalRows - currentRows);
    if (currentCols < totalCols) sheet.insertColumnsAfter(currentCols, totalCols - currentCols);
    if (currentRows > totalRows) sheet.deleteRows(totalRows + 1, currentRows - totalRows);
    if (currentCols > totalCols) sheet.deleteColumns(totalCols + 1, currentCols - totalCols);

    try {
        sheet.setColumnWidth(COL_BUFFER_LEFT, L.BUFFER_SIZE); 
        sheet.setColumnWidth(totalCols, L.BUFFER_SIZE);       
        sheet.setRowHeight(totalRows, L.BUFFER_SIZE); 
    } catch(e) { console.warn("Layout: Resize buffer failed", e); }        

    const buffers = [];
    if (totalRows >= 2) buffers.push(sheet.getRange(2, COL_BUFFER_LEFT, totalRows - 1, 1));
    buffers.push(sheet.getRange(1, totalCols, totalRows, 1));
    buffers.push(sheet.getRange(totalRows, 1, 1, totalCols));

    buffers.forEach(rng => {
        rng.setBackground(null)
           .clearContent()
           .clearDataValidations() 
           .clearNote() 
           .setBorder(false, false, false, false, false, false); 
    });

    Utils.drawMobileCheckbox(sheet);

    if (contentCols > 0) {
      sheet.setColumnWidths(COL_DATA_START, contentCols, 100);

      sheet.getRange(STATUS_ROW, 1, 1, totalCols).breakApart();
      const statusRange = sheet.getRange(STATUS_ROW, COL_DATA_START, 1, contentCols);
      statusRange.merge()
           .setHorizontalAlignment("left").setVerticalAlignment("middle")
           .setFontWeight("bold").setFontColor("#888888");

      const tableRows = 1 + contentRows; 
      const tableRange = sheet.getRange(HEADER_ROW, COL_DATA_START, tableRows, contentCols);
      const existingBandings = sheet.getBandings();
      if (existingBandings) existingBandings.forEach(b => b.remove());
      tableRange.applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
      tableRange.setBorder(true, true, true, true, null, null); 

      const headerRange = sheet.getRange(HEADER_ROW, COL_DATA_START, 1, contentCols);
      if (Array.isArray(optHeaders) && optHeaders.length > 0) {
          headerRange.setValues([optHeaders]);
      }
      headerRange.setBorder(true, true, true, true, true, true) 
                 .setFontWeight("bold")
                 .setHorizontalAlignment("center")
                 .setVerticalAlignment("middle")
                 .setWrap(true);

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
