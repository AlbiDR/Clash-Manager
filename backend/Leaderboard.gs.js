  /**
   * ============================================================================
   * 🏆 MODULE: LEADERBOARD
   * ----------------------------------------------------------------------------
   * 📝 DESCRIPTION: The core ranking engine for the Clan.
   * ⚙️ ALGORITHM OVERVIEW:
   *    1. Hybrid Data Fetch: Combines Live API (Current stats) + DB (Tenure).
   *    2. War History: Merges 'currentriverrace' + 'riverracelog' for full context.
   *    3. ScoringSystem: Delegates logic to 'ScoringSystem.gs' (Protected Engine).
   *    4. SAFETY LOCK: Automatically aborts if new data deviates significantly.
   * 🏷️ VERSION: 5.0.3
   * ============================================================================
   */

  const VER_LEADERBOARD = '5.0.3';

  function updateLeaderboard() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    let lbSheet = ss.getSheetByName(CONFIG.SHEETS.LB);
    if (!lbSheet) lbSheet = ss.insertSheet(CONFIG.SHEETS.LB);
    
    const L = CONFIG.SCHEMA.LB;

    // 🛡️ SAFETY 1: SNAPSHOT EXISTING STATE
    let oldStats = { count: 0, totalDonations: 0 };
    try {
      const lastRow = lbSheet.getLastRow();
      if (lastRow >= CONFIG.LAYOUT.DATA_START_ROW) {
        const numCols = Object.keys(L).length;
        const oldData = lbSheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2, lastRow - (CONFIG.LAYOUT.DATA_START_ROW - 1), numCols).getValues();
        oldStats.count = oldData.length;
        oldStats.totalDonations = oldData.reduce((sum, row) => sum + (Number(row[L.TOTAL_DON]) || 0), 0);
      }
    } catch(e) { console.warn("⚠️ Safety Check Warning", e); }

    const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
    
    // ----------------------------------------------------------------------------
    // 1. DATA INGESTION
    // ----------------------------------------------------------------------------
    const urls = [
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/currentriverrace`,
      // ⚠️ CRITICAL: Set limit to 52 for 1 year history (User Requested Limit)
      // Added unique timestamp to bypass proxy caching
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/riverracelog?limit=52&__t=${new Date().getTime()}`
    ];
    
    const [membersData, raceData, logData] = Utils.fetchRoyaleAPI(urls);

    if (!membersData || !membersData.items) {
      console.error("Leaderboard: Failed to fetch members.");
      return;
    }

    const now = new Date();
    const currentWeekId = Utils.calculateWarWeekId(now);
    
    // 🕒 TIMEZONE SAFEGUARD (Hybrid War Rate Logic)
    // We determine the Day of Week (1=Mon ... 7=Sun) based on the CLAN'S Timezone,
    // NOT the Google Server's timezone. This prevents "Fake Data" caused by server location.
    // 'u' returns ISO-8601 day number: 1 = Monday, 7 = Sunday.
    const currentDayIndex = parseInt(Utilities.formatDate(now, CONFIG.SYSTEM.TIMEZONE, 'u'));

    // A. Build War History Map
    const warHistoryMap = new Map();
    const addWarEntry = (tag, weekId, fame) => {
      if (!warHistoryMap.has(tag)) warHistoryMap.set(tag, new Map());
      const userMap = warHistoryMap.get(tag);
      userMap.set(weekId, Math.max(userMap.get(weekId) || 0, fame));
    };

    if (logData && logData.items) {
      console.log(`Leaderboard: Fetched ${logData.items.length} war logs.`); // Debug Log
      logData.items.forEach(log => {
        const weekId = Utils.calculateWarWeekId(Utils.parseRoyaleApiDate(log.createdDate));
        const myClan = log.standings.find(s => s.clan.tag === CONFIG.SYSTEM.CLAN_TAG);
        if (myClan && myClan.clan.participants) {
          myClan.clan.participants.forEach(p => addWarEntry(p.tag, weekId, p.fame));
        }
      });
    }

    if (raceData && raceData.clan && raceData.clan.participants) {
      raceData.clan.participants.forEach(p => {
        const val = p.fame || p.medals || p.repairPoints || 0;
        addWarEntry(p.tag, currentWeekId, val);
      });
    }

    // B. Load Historical Data
    const dbSheet = ss.getSheetByName(CONFIG.SHEETS.DB);
    const memberDbData = new Map();

    if (dbSheet && dbSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
      const dbValues = dbSheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2, dbSheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1), 8).getValues();
      const S_DB = CONFIG.SCHEMA.DB;

      dbValues.forEach(row => {
        const tag = row[S_DB.TAG];
        const date = row[S_DB.DATE] ? new Date(row[S_DB.DATE]) : new Date();
        const donGiven = Number(row[S_DB.DON_GIVEN]) || 0;
        const weekId = Utils.calculateWarWeekId(date);

        if (!memberDbData.has(tag)) {
          memberDbData.set(tag, { firstSeen: date, weeklyMax: new Map() });
        }

        const h = memberDbData.get(tag);
        if (date < h.firstSeen) h.firstSeen = date;
        const currentMax = h.weeklyMax.get(weekId) || 0;
        if (donGiven > currentMax) h.weeklyMax.set(weekId, donGiven);
      });
    }

    // ----------------------------------------------------------------------------
    // 2. LOGIC DELEGATION (Using External ScoringSystem Module)
    // ----------------------------------------------------------------------------
    const rows = [];

    membersData.items.forEach(m => {
      // Stats
      const trophies = m.trophies || 0;
      const weeklyDonations = m.donations || 0;
      const pWarHistory = warHistoryMap.get(m.tag) || new Map();
      const currentFame = pWarHistory.get(currentWeekId) || 0;
      const lastSeen = Utils.parseRoyaleApiDate(m.lastSeen);

      // Database History
      const dbRecord = memberDbData.get(m.tag);
      let daysTracked = 0;
      let totalDonations = 0;
      
      if (dbRecord) {
        const diffTime = Math.abs(now - dbRecord.firstSeen);
        daysTracked = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        
        const liveMax = Math.max(dbRecord.weeklyMax.get(currentWeekId) || 0, weeklyDonations);
        dbRecord.weeklyMax.set(currentWeekId, liveMax);
        
        dbRecord.weeklyMax.forEach(val => totalDonations += val);
      } else {
        totalDonations = weeklyDonations;
        daysTracked = 0;
      }

      const avgDailyDonations = daysTracked > 0 ? Math.round(totalDonations / daysTracked) : weeklyDonations;

      // --- 🔒 EXTERNAL CALL 🔒 ---
      // Calls the protected logic in ScoringSystem.gs
      // UPDATED: Passing 'currentDayIndex' to enable Hybrid Time-Boxed logic.
      const warRateVal = ScoringSystem.calculateWarRate(pWarHistory, daysTracked, currentWeekId, currentDayIndex);
      const scores = ScoringSystem.computeScores(currentFame, weeklyDonations, trophies, warRateVal, lastSeen, now);
      // ----------------------------

      const historyString = Array.from(pWarHistory.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([wk, f]) => `${f} ${wk}`)
        .join(' | ');

      const row = [];
      row[L.TAG] = m.tag;
      row[L.NAME] = `=HYPERLINK("${CONFIG.SYSTEM.WEB_APP_URL}?mode=leaderboard&pin=${m.tag.replace('#','')}", "${m.name}")`;
      row[L.ROLE] = m.role;
      row[L.TROPHIES] = trophies;
      row[L.DAYS] = daysTracked;
      row[L.WEEKLY_REQ] = m.donationsReceived; 
      row[L.AVG_DAY] = avgDailyDonations;
      row[L.TOTAL_DON] = totalDonations;
      row[L.LAST_SEEN] = timeAgo(lastSeen);
      row[L.WAR_RATE] = `${warRateVal}%`;
      row[L.HISTORY] = historyString;
      row[L.RAW_SCORE] = scores.raw;
      row[L.PERF_SCORE] = scores.perf; 
      
      rows.push(row);
    });

    // ----------------------------------------------------------------------------
    // 3. SORTING & NORMALIZATION (Using External ScoringSystem Module)
    // ----------------------------------------------------------------------------
    
    // --- 🔒 EXTERNAL CALL 🔒 ---
    rows.sort(ScoringSystem.comparator);
    // ----------------------------

    if (rows.length > 0) {
      const maxScore = rows[0][L.PERF_SCORE];
      rows.forEach(r => {
        const decayedVal = r[L.PERF_SCORE];
        r[L.RAW_SCORE] = Math.round(decayedVal);
        r[L.PERF_SCORE] = maxScore > 0 ? Math.round((decayedVal / maxScore) * 100) : 0;
      });
    }

    // ----------------------------------------------------------------------------
    // 4. SAFETY LOCK & WRITING
    // ----------------------------------------------------------------------------
    const newStats = {
      count: rows.length,
      totalDonations: rows.reduce((sum, row) => sum + (Number(row[L.TOTAL_DON]) || 0), 0)
    };

    if (oldStats.count > 10) {
      const countDrop = newStats.count < (oldStats.count * 0.7); 
      const donDrop = newStats.totalDonations < (oldStats.totalDonations * 0.7);
      
      if (countDrop || donDrop) {
        throw new Error(`⛔ LEADERBOARD SAFETY LOCK: Data deviation detected. Aborting.`);
      }
    }

    // 🛡️ SAFETY 2: BACKUP NOW
    Utils.backupSheet(ss, CONFIG.SHEETS.LB);

    const HEADERS = ['Tag', 'Name', 'Role', 'Trophies', 'Days Tracked', 'Received Weekly', 'Average Daily Donations', 'Total Donations', 'Last Seen', 'War Rate', 'War History', 'Raw Score', 'Performance Score'];
    
    lbSheet.clear();
    // We still write headers here for data alignment before Utils call, though Utils will enforce them again.
    lbSheet.getRange(2, 2, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold');
    
    if (rows.length > 0) {
      lbSheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2, rows.length, HEADERS.length).setValues(rows);
      
      const scoreColIndex = 2 + L.PERF_SCORE;
      lbSheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, scoreColIndex, rows.length, 1).setFontWeight('bold');
      
      const rule = SpreadsheetApp.newConditionalFormatRule()
        .setGradientMinpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.NUMBER, "0")
        .setGradientMaxpointWithValue('#6aa84f', SpreadsheetApp.InterpolationType.NUMBER, "100")
        .setRanges([lbSheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, scoreColIndex, rows.length, 1)])
        .build();
      lbSheet.setConditionalFormatRules([rule]);
    }

    lbSheet.getRange('B1').setValue(`LEADERBOARD • ${new Date().toLocaleString()}`);
    ss.toast('Success: Fetched 52 weeks of war history.', 'Leaderboard Updated');

    // Pass HEADERS for schema enforcement
    Utils.applyStandardLayout(lbSheet, rows.length, HEADERS.length, HEADERS);
  }

  /**
   * Helper: Formats a date into "4h ago" or "2d ago" style.
   */
  function timeAgo(date) {
    if (!date) return "-";
    const seconds = Math.floor((new Date() - date) / 1000);
    
    let interval = seconds / 31536000;
    if (interval > 1) return Math.floor(interval) + "y ago";
    
    interval = seconds / 2592000;
    if (interval > 1) return Math.floor(interval) + "mo ago";
    
    interval = seconds / 86400;
    if (interval > 1) return Math.floor(interval) + "d ago";
    
    interval = seconds / 3600;
    if (interval > 1) return Math.floor(interval) + "h ago";
    
    interval = seconds / 60;
    if (interval > 1) return Math.floor(interval) + "m ago";
    
    return "Just now";
  }
