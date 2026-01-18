/**
 * ============================================================================
 * 🏆 MODULE: LEADERBOARD
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: The core ranking engine for the Clan.
 * ⚙️ ALGORITHM OVERVIEW:
 *    1. Hybrid Data Fetch: Combines Live API (Current stats) + DB (Tenure).
 *    2. War History: Merges 'currentriverrace' + 'riverracelog' for full context.
 *    3. ScoringSystem: Delegates logic to 'ScoringSystem.gs'.
 *    4. TREND ENGINE: Compares new scores vs old scores to show momentum.
 * 🏷️ VERSION: 10.0.1
 * ============================================================================
 */

const VER_LEADERBOARD = "10.0.1";

function updateLeaderboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let lbSheet = ss.getSheetByName(CONFIG.SHEETS.LB);
  if (!lbSheet) lbSheet = ss.insertSheet(CONFIG.SHEETS.LB);

  // ⚡ DYNAMIC SYNC: Resolve column indices from current sheet headers first
  Utils.bootDynamicSchema();
  const L = CONFIG.SCHEMA.LB;

  // 🛡️ CONFIGURATION CHECK
  if (!CONFIG.SYSTEM.CLAN_TAG) {
    console.error("❌ CRITICAL: 'ClanTag' is not set in Script Properties. Aborting Leaderboard Update.");
    lbSheet.getRange("B1").setValue("⚠️ Error: Missing ClanTag");
    return;
  }

  // 🛡️ SAFETY & HISTORY SNAPSHOT
  // We read the existing scores BEFORE we process new data.
  // UPDATE: Tracking RAW SCORE (Col 11) for precise momentum calc.
  const previousScores = new Map(); // Map<CleanTag, RawScore>
  Logger.log(
    "🔎 Starting updateLeaderboard - snapshot previousScores map initialized",
  );

  try {
    const lastRow = lbSheet.getLastRow();
    const maxCols = lbSheet.getMaxColumns();
    const startRow = CONFIG.LAYOUT.DATA_START_ROW;

    // Ensure we have enough data to read
    if (lastRow >= startRow && maxCols >= L.TAG) {
      const oldData = lbSheet
        .getRange(startRow, 1, lastRow - startRow + 1, maxCols)
        .getValues();

      const tagIdx = L.TAG;
      const scoreIdx = L.RAW_SCORE; // ✨ Tracking Raw Score (Absolute Index)

      oldData.forEach((row) => {
        // Safe read: check if column exists in this row data
        if (row.length > scoreIdx) {
          const rawTag = String(row[tagIdx]);
          const score = row[scoreIdx];

          if (rawTag && rawTag.startsWith("#")) {
            const cleanKey = rawTag.replace("#", "").trim().toLowerCase();
            const scoreVal = Number(score);

            if (!isNaN(scoreVal)) {
              previousScores.set(cleanKey, scoreVal);
            }
          }
        }
      });

      Logger.log(`📉 Snapshot: Loaded ${previousScores.size} previous scores.`);
    }
  } catch (e) {
    console.warn(
      "⚠️ Snapshot Warning (Trend data may be incomplete): " + e.message,
    );
  }

  const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
  Logger.log(`🔎 Requesting Data for Clan Tag: ${CONFIG.SYSTEM.CLAN_TAG} (Encoded: ${cleanTag})`);

  // ----------------------------------------------------------------------------
  // 1. DATA INGESTION
  // ----------------------------------------------------------------------------
  const urls = [
    `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
    `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/currentriverrace`,
    `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/riverracelog?limit=52&__t=${new Date().getTime()}`,
  ];

  const [membersData, raceData, logData] = Utils.fetchRoyaleAPI(urls);
  Logger.log(
    `📦 Fetched data: members=${membersData?.items?.length || 0}, raceParticipants=${raceData?.clan?.participants?.length || 0}, logItems=${logData?.items?.length || 0}`,
  );

  if (!membersData || !membersData.items) {
    console.error("Leaderboard: Failed to fetch members. Check API Key validity and Clan Tag.");
    return;
  }

  const now = new Date();
  const currentWeekId = Utils.calculateWarWeekId(now);
  const currentDayIndex = parseInt(
    Utilities.formatDate(now, CONFIG.SYSTEM.TIMEZONE, "u"),
  );

  // A. Build War History Map
  const warHistoryMap = new Map();
  Logger.log(`🛠️ warHistoryMap initialized`);
  const addWarEntry = (tag, weekId, fame) => {
    if (!warHistoryMap.has(tag)) warHistoryMap.set(tag, new Map());
    const userMap = warHistoryMap.get(tag);
    userMap.set(weekId, Math.max(userMap.get(weekId) || 0, fame));
  };

  // 1. REHYDRATE FROM ARCHIVE (Existing Sheet Data)
  if (lbSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    Logger.log("📜 Rehydrating leaderboard historic data");
    try {
      const histColIndex = 2 + CONFIG.SCHEMA.LB.HISTORY;
      const tagColIndex = 2 + CONFIG.SCHEMA.LB.TAG;
      const numRows = lbSheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1);

      // Safe check for range validity
      if (lbSheet.getMaxColumns() >= histColIndex) {
        const tagData = lbSheet
          .getRange(CONFIG.LAYOUT.DATA_START_ROW, tagColIndex, numRows, 1)
          .getValues();
        const histData = lbSheet
          .getRange(CONFIG.LAYOUT.DATA_START_ROW, histColIndex, numRows, 1)
          .getValues();

        tagData.forEach((row, i) => {
          const tag = row[0];
          const histStr = histData[i][0];
          if (
            tag &&
            histStr &&
            typeof histStr === "string" &&
            histStr.length > 0
          ) {
            const archivedMap = Utils.parseWarHistory(histStr);
            if (archivedMap.size > 0) {
              if (!warHistoryMap.has(tag)) warHistoryMap.set(tag, new Map());
              const userMap = warHistoryMap.get(tag);
              archivedMap.forEach((fame, wk) => {
                userMap.set(wk, fame);
              });
            }
          }
        });
      }
    } catch (e) {
      console.warn("Leaderboard: Failed to rehydrate history", e);
    }
  }

  // 2. MERGE FRESH API DATA
  if (logData && logData.items) {
    logData.items.forEach((log) => {
      const weekId = Utils.calculateWarWeekId(
        Utils.parseRoyaleApiDate(log.createdDate),
      );
      const myClan = log.standings.find(
        (s) => s.clan.tag === CONFIG.SYSTEM.CLAN_TAG,
      );
      if (myClan && myClan.clan.participants) {
        myClan.clan.participants.forEach((p) =>
          addWarEntry(p.tag, weekId, p.fame),
        );
      }
    });
  }

  if (raceData && raceData.clan && raceData.clan.participants) {
    raceData.clan.participants.forEach((p) => {
      const val = p.fame || p.medals || p.repairPoints || 0;
      addWarEntry(p.tag, currentWeekId, val);
    });
  }

  // B. Load Historical Data (Tenure & Donations)
  const dbSheet = ss.getSheetByName(CONFIG.SHEETS.DB);
  const memberDbData = new Map();

  if (dbSheet && dbSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    const dbValues = dbSheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        2,
        dbSheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1),
        8,
      )
      .getValues();
    const S_DB = CONFIG.SCHEMA.DB;

    dbValues.forEach((row) => {
      const tag = row[S_DB.TAG];
      const dateVal = row[S_DB.DATE];
      const date = dateVal ? new Date(dateVal) : new Date();
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
  // 2. LOGIC DELEGATION
  // ----------------------------------------------------------------------------
  const rows = [];

  // Sort helper to normalize scores first so trends are accurate to the final result
  const rawMemberResults = [];

  membersData.items.forEach((m) => {
    const trophies = m.trophies || 0;
    const weeklyDonations = m.donations || 0;
    const pWarHistory = warHistoryMap.get(m.tag) || new Map();
    const currentFame = pWarHistory.get(currentWeekId) || 0;
    const lastSeen = Utils.parseRoyaleApiDate(m.lastSeen);

    const dbRecord = memberDbData.get(m.tag);
    let daysTracked = 0;
    let totalDonations = 0;

    if (dbRecord) {
      const diffTime = Math.abs(now - dbRecord.firstSeen);
      daysTracked = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      const liveMax = Math.max(
        dbRecord.weeklyMax.get(currentWeekId) || 0,
        weeklyDonations,
      );
      dbRecord.weeklyMax.set(currentWeekId, liveMax);
      dbRecord.weeklyMax.forEach((val) => (totalDonations += val));
    } else {
      totalDonations = weeklyDonations;
      daysTracked = 0;
    }

    const avgDailyDonations =
      daysTracked > 0
        ? Math.round(totalDonations / daysTracked)
        : weeklyDonations;

    let totalHistoryFame = 0;
    pWarHistory.forEach((val) => (totalHistoryFame += val));
    const weeksInClan = Math.min(
      52,
      Math.max(1, Math.ceil(daysTracked / 7), pWarHistory.size),
    );
    const avgWarFame = Math.round(totalHistoryFame / weeksInClan);

    const warRateVal = ScoringSystem.calculateWarRate(
      pWarHistory,
      daysTracked,
      currentWeekId,
      currentDayIndex,
    );
    const scores = ScoringSystem.computeScores(
      currentFame,
      avgWarFame,
      avgDailyDonations,
      trophies,
      warRateVal,
      lastSeen,
      now,
    );

    const historyString = Array.from(pWarHistory.entries())
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([wk, f]) => `${f} ${wk}`)
      .join(" | ");

    rawMemberResults.push({
      member: m,
      trophies,
      daysTracked,
      avgDailyDonations,
      totalDonations,
      lastSeen,
      warRateVal,
      avgWarFame,
      historyString,
      scores,
      /**
       * WHY: Tracking lifetime War Day Wins is necessary for the "Deep Net v7"
       * hybrid benchmark, as it allows us to score clan members using the
       * same formula as recruits.
       */
      warDayWins: m.warDayWins || 0,
      cleanKey: m.tag.replace("#", "").trim().toLowerCase(),
    });
  });

  // Calculate Max Score first for Normalization (Specific Leaderboard Math)
  let maxPerfScore = 0;
  rawMemberResults.forEach((r) => {
    if (r.scores.perf > maxPerfScore) maxPerfScore = r.scores.perf;
  });

  // ----------------------------------------------------------------------------
  // 3. FINALIZE & CALCULATE TREND
  // ----------------------------------------------------------------------------

  rawMemberResults.forEach((r) => {
    // Normalize Performance Score (0-100) based on Clan Max
    const normalizedPerf =
      maxPerfScore > 0
        ? Math.min(100, Math.round((r.scores.perf / maxPerfScore) * 100))
        : 0;

    // 📈 CALCULATE TREND (RAW SCORE DELTA)
    let trend = 0;
    if (previousScores.has(r.cleanKey)) {
      const oldRaw = previousScores.get(r.cleanKey);
      trend = r.scores.raw - oldRaw;
    }

    const row = new Array(17).fill(""); // Unified 17-col Absolute Structure (0-16)
    row[L.TAG] = r.member.tag;
    row[L.NAME] =
      `=HYPERLINK("${CONFIG.SYSTEM.WEB_APP_URL}?mode=leaderboard&pin=${r.member.tag.replace("#", "")}", "${r.member.name}")`;
    row[L.ROLE] = r.member.role;
    row[L.TROPHIES] = r.trophies;
    row[L.DAYS] = r.daysTracked;
    row[L.WEEKLY_REQ] = r.member.donationsReceived;
    row[L.AVG_DAY] = r.avgDailyDonations;
    row[L.TOTAL_DON] = r.totalDonations;
    row[L.LAST_SEEN] = timeAgo(r.lastSeen);
    row[L.WAR_RATE] = `${r.warRateVal}%`;
    row[L.HISTORY] = r.historyString;
    row[L.RAW_SCORE] = r.scores.raw;
    row[L.PERF_SCORE] = normalizedPerf; // 0-100 Score (Hard Capped)
    row[L.TREND] = trend; // ✨ Raw Score Delta
    row[L.AVG_WAR_FAME] = r.avgWarFame;
    row[L.WAR_DAY_WINS] = r.warDayWins;

    rows.push(row);
  });

  // Sort
  rows.sort(ScoringSystem.comparator);

  // ----------------------------------------------------------------------------
  // 4. SAFETY LOCK & WRITING
  // ----------------------------------------------------------------------------

  Utils.backupSheet(ss, CONFIG.SHEETS.LB);

  const HEADERS_ARRAY = new Array(17).fill("");
  Object.keys(CONFIG.SCHEMA.LB_HEADERS).forEach((k) => {
    HEADERS_ARRAY[L[k]] = CONFIG.SCHEMA.LB_HEADERS[k];
  });

  lbSheet.clear();
  lbSheet
    .getRange(2, 1, 1, HEADERS_ARRAY.length)
    .setValues([HEADERS_ARRAY])
    .setFontWeight("bold");

  if (rows.length > 0) {
    lbSheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        1,
        rows.length,
        HEADERS_ARRAY.length,
      )
      .setValues(rows);

    const scoreColIndex = 1 + L.PERF_SCORE; // Absolute Col Number
    lbSheet
      .getRange(CONFIG.LAYOUT.DATA_START_ROW, scoreColIndex, rows.length, 1)
      .setFontWeight("bold")
      .setNumberFormat('0"%"');

    const rule = SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpointWithValue(
        "#ffffff",
        SpreadsheetApp.InterpolationType.NUMBER,
        "0",
      )
      .setGradientMaxpointWithValue(
        "#6aa84f",
        SpreadsheetApp.InterpolationType.NUMBER,
        "100",
      )
      .setRanges([
        lbSheet.getRange(
          CONFIG.LAYOUT.DATA_START_ROW,
          scoreColIndex,
          rows.length,
          1,
        ),
      ])
      .build();

    // Format Trend Column (Red/Green text in Sheet)
    const trendColIndex = 1 + L.TREND; // Absolute Col Number
    const trendRange = lbSheet.getRange(
      CONFIG.LAYOUT.DATA_START_ROW,
      trendColIndex,
      rows.length,
      1,
    );

    const trendPos = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberGreaterThan(0)
      .setFontColor("#2e7d32")
      .setBold(true)
      .setRanges([trendRange])
      .build();
    const trendNeg = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberLessThan(0)
      .setFontColor("#c62828")
      .setBold(true)
      .setRanges([trendRange])
      .build();
    const trendNeu = SpreadsheetApp.newConditionalFormatRule()
      .whenNumberEqualTo(0)
      .setFontColor("#cccccc")
      .setRanges([trendRange])
      .build();

    lbSheet.setConditionalFormatRules([rule, trendPos, trendNeg, trendNeu]);
  }

  lbSheet
      .getRange("B1")
      .setValue(`LEADERBOARD • ${new Date().toLocaleString()}`);
  ss.toast("Success: Leaderboard updated.", "Leaderboard Updated");

  // ⚡ FIX: Slice off the first empty element (Index 0) from HEADERS_ARRAY
  // because applyStandardLayout starts writing at Column 2 (B), assuming a dense array.
  // HEADERS_ARRAY is sparse (Index 0 is empty for Column A buffer).
  Utils.applyStandardLayout(lbSheet, rows.length, HEADERS_ARRAY.length - 1, HEADERS_ARRAY.slice(1));
  Logger.log('🏁 updateLeaderboard execution completed');
}

/**
 * Debug helper to invoke updateLeaderboard via clasp run.
 * This function is NOT used in production.
 */
function debugUpdateLeaderboard() {
  Logger.log('🔧 debugUpdateLeaderboard invoked');
  updateLeaderboard();
}

function timeAgo(date) {
  if (!date) return "-";
  const units = [
    { s: 31536000, t: "y" },
    { s: 2592000, t: "mo" },
    { s: 86400, t: "d" },
    { s: 3600, t: "h" },
    { s: 60, t: "m" },
  ];
  const sec = Math.floor((new Date() - date) / 1000);
  const match = units.find((u) => sec >= u.s);
  return match ? `${Math.floor(sec / match.s)}${match.t} ago` : "Just now";
}
