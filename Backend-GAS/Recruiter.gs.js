/**
 * ============================================================================
 * 🔭 MODULE: RECRUITER
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Scans for un-clanned talent via Tournaments + Battle Logs.
 * 🏷️ VERSION: 10.0.0
 * ============================================================================
 */

const VER_RECRUITER = "10.0.0";

function scoutRecruits() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName(CONFIG.SHEETS.HH);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEETS.HH);

  const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);

  // 1. Establish Baseline
  const baselineData = Utils.fetchRoyaleAPI([
    `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
  ]);
  let avgTrophies = 4000; // Default safe baseline

  if (
    baselineData &&
    baselineData[0] &&
    baselineData[0].items &&
    baselineData[0].items.length > 0
  ) {
    avgTrophies =
      baselineData[0].items.reduce((a, b) => a + b.trophies, 0) /
      baselineData[0].items.length;
  } else {
    console.warn(
      "⚠️ Recruiter: Could not fetch baseline clan data. Defaulting to 4000 trophies.",
    );
  }

  console.log(`📊 Baseline: Clan Avg Trophies is ${Math.round(avgTrophies)}.`);

  // 🚫 BLACKLIST & BENCHMARK UPDATE
  const { ids: blacklistSet, entries: blacklistEntries } =
    updateAndGetBlacklist(sheet);

  // 2. Load existing tracking data
  const existing = loadRecruitDatabase(sheet);
  console.log(
    `📂 Database: Loaded ${existing.size} existing candidates from sheet.`,
  );

  // ⚡ OPTIMIZATION: Clanless Check for survivors
  const tagsToCheck = Array.from(existing.keys());
  if (tagsToCheck.length > 0) {
    const profiles = Utils.fetchRoyaleAPI(
      tagsToCheck.map(
        (t) => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`,
      ),
    );
    let joinedCount = 0;
    profiles.forEach((p) => {
      if (p && p.clan && p.clan.tag) {
        existing.delete(p.tag);
        joinedCount++;
      }
    });
    if (joinedCount > 0)
      console.log(
        `🧹 Clean-up: Removed ${joinedCount} players who joined other clans.`,
      );
  }

  // 3. Dynamic Safety Cap
  const target = CONFIG.HEADHUNTER.TARGET;
  const minTrophies = Math.max(
    4000,
    Math.round(existing.size < target ? avgTrophies * 0.75 : avgTrophies),
  );
  console.log(
    `🎯 Strategy: Seeking players with >${minTrophies} Trophies to fill pool.`,
  );

  // 4. Run the optimized scan
  const scanned = scanTournaments(minTrophies, existing, blacklistSet);

  // 5. Intelligent Merge
  let newArrivals = 0;
  let updatedExisting = 0;

  scanned.forEach((c) => {
    if (existing.has(c.tag)) {
      c.foundDate = existing.get(c.tag).foundDate;
      updatedExisting++;
    } else {
      newArrivals++;
    }
    existing.set(c.tag, c);
  });

  console.log(
    `🔍 Scan Result: Merged ${newArrivals} new arrivals and ${updatedExisting} status updates.`,
  );

  // 6. Final Pool Scoring & Capping
  // ----------------------------------------------------------------------------
  /**
   * WHY: We use a Hybrid Benchmark (50% Clan / 50% Elite Recruits) to ensure
   * that a single "outlier" (like a pro player) doesn't hijack the scoring scale.
   * This keeps the "Potential Score" relevant to our clan's actual standard.
   */

  // A. Get Clan Baseline (Members with Performance Score >= 50)
  const lbSheet = ss.getSheetByName(CONFIG.SHEETS.LB);
  const clanEliteData = [];
  if (lbSheet && lbSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    const L = CONFIG.SCHEMA.LB;
    const lbData = lbSheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        2,
        lbSheet.getLastRow() - CONFIG.LAYOUT.DATA_START_ROW + 1,
        16,
      )
      .getValues();

    lbData.forEach((row) => {
      const perf = Number(row[L.PERF_SCORE]) || 0;
      if (perf >= 50) {
        // Calculate Recruit-Equivalent Raw Score
        // Formula: (T * 1.0) + (D * 0.07) + ((W + bonus) * 20.0)
        // For Clan members, we use 'currentFame > 0' as the bonus trigger
        const histStr = String(row[L.HISTORY] || "");
        const currentWk = Utils.calculateWarWeekId(new Date());
        const hasRecentWar = histStr.includes(currentWk);

        const raw = ScoringSystem.calculateRecruitRawScore(
          Number(row[L.TROPHIES]) || 0,
          Number(row[L.TOTAL_DON]) || 0,
          Number(row[L.WAR_DAY_WINS]) || 0,
          hasRecentWar,
        );
        clanEliteData.push({ rawScore: raw, perfScore: perf });
      }
    });
  }

  // B. Calculate Benchmark
  const finalBenchmark = ScoringSystem.calculateHybridBenchmark(
    clanEliteData,
    blacklistEntries,
  );

  const rawPool = Array.from(existing.values()).sort(
    (a, b) => b.rawScore - a.rawScore,
  );
  const finalPool = rawPool.slice(0, CONFIG.HEADHUNTER.TARGET);

  // 🛑 FAILSAFE: Don't render if pool is suspiciously empty and we expected results
  if (finalPool.length === 0 && rawPool.length === 0 && existing.size > 0) {
    console.error(
      "⛔ Recruiter ABORTED: Logic Error resulted in empty pool. Retaining old data.",
    );
    return;
  }

  finalPool.forEach(
    (p) =>
      (p.perfScore = ScoringSystem.calculatePotentialScore(
        p.rawScore,
        finalBenchmark,
      )),
  );

  // 🛡️ BACKUP
  Utils.backupSheet(ss, CONFIG.SHEETS.HH);

  // 7. RENDER
  renderHeadhunterView(sheet, finalPool, avgTrophies);

  try {
    if (typeof refreshWebPayload === "function") refreshWebPayload();
  } catch (e) {}
}

/**
 * 🚫 BLACKLIST & HISTORY MANAGER
 */
function updateAndGetBlacklist(sheet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const blSheet =
    ss.getSheetByName(CONFIG.SHEETS.BL) || ss.insertSheet(CONFIG.SHEETS.BL);
  const now = Date.now();
  const expiryDuration = (CONFIG.HEADHUNTER.BLACKLIST_DAYS || 30) * 86400000;

  // 1. Read blacklist from sheet
  let validEntries = [];
  if (blSheet.getLastRow() >= 1) {
    const rawData = blSheet.getDataRange().getValues();
    validEntries = rawData
      .map((row) => ({
        t: String(row[0]),
        e: Number(row[1]) || 0,
        s: Number(row[2]) || 0,
      }))
      .filter((entry) => entry.e > now);
  }

  const rowsToDelete = [];
  if (sheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    const H = CONFIG.SCHEMA.HH;
    const startRow = CONFIG.LAYOUT.DATA_START_ROW;
    const lastRow = sheet.getLastRow();
    const numRows = lastRow - startRow + 1;

    // Fetch only the columns we need: Tag (B), Invited (C), Raw Score (J)
    // Map to relative indices for easier processing
    const tagValues = sheet.getRange(startRow, 2, numRows, 1).getValues();
    const invitedValues = sheet
      .getRange(startRow, 2 + H.INVITED, numRows, 1)
      .getValues();
    const rawScoreValues = sheet
      .getRange(startRow, 2 + H.RAW_SCORE, numRows, 1)
      .getValues();

    for (let i = 0; i < numRows; i++) {
      const tag = String(tagValues[i][0] || "").trim();
      const isInvited =
        invitedValues[i][0] === true ||
        String(invitedValues[i][0]).toUpperCase() === "TRUE";

      if (tag && isInvited) {
        const raw = Number(rawScoreValues[i][0]) || 0;
        const existing = validEntries.find((v) => v.t === tag);
        if (existing) existing.s = Math.max(existing.s, raw);
        else validEntries.push({ t: tag, e: now + expiryDuration, s: raw });
        rowsToDelete.push(startRow + i);
      }
    }
  }

  validEntries.sort((a, b) => b.s - a.s);

  // 2. DYNAMIC BENCHMARK (Decay + Percentile)
  // Calculate decayed scores for benchmark purposes (does not affect saved raw score)
  const scoredEntries = validEntries.map((e) => {
    const msSinceAdded = now - (e.e - expiryDuration); // e.e is expiry (future), so e.e - duration = added time
    // ^ Wait, e.e is set to now + duration when added/updated.
    // If we want age, we need (ExpiryTimestamp - CurrentTimestamp) inverted?
    // No, existing logic sets `e: now + expiryDuration`.
    // So `e - now` is remaining time.
    // `expiryDuration - (e - now)` is elapsed time (age).
    const remainingMs = e.e - now;
    const ageMs = expiryDuration - remainingMs;
    const ageDays = Math.max(0, ageMs / 86400000);
    const decayFactor = Math.pow(
      1 - CONFIG.HEADHUNTER.BENCHMARK_DECAY,
      ageDays,
    );
    return { ...e, decayed: e.s * decayFactor };
  });

  // Sort by DECAYED score to find the current effective top tier
  scoredEntries.sort((a, b) => b.decayed - a.decayed);

  // Determine Pool Size (Top 5%, Minimum 3)
  const poolSize = Math.max(
    CONFIG.HEADHUNTER.BENCHMARK_MIN_POOL,
    Math.ceil(scoredEntries.length * CONFIG.HEADHUNTER.BENCHMARK_PERCENTILE),
  );

  const pool = scoredEntries.slice(0, poolSize);
  const benchmarkHigh =
    pool.length > 0
      ? pool.reduce((acc, c) => acc + c.decayed, 0) / pool.length
      : 0;

  console.log(
    `🚫 Blacklist: ${validEntries.length} active. Benchmark Pool: Top ${poolSize} (Avg: ${Math.round(benchmarkHigh)}).`,
  );

  // 3. Write back to sheet (Overwrite) - We save Raw Score 's', not decayed
  blSheet.clear();
  if (validEntries.length > 0) {
    const output = validEntries.map((e) => [e.t, e.e, e.s]);
    blSheet.getRange(1, 1, output.length, 3).setValues(output);
  }

  if (rowsToDelete.length > 0) {
    console.log(`🧹 Purging ${rowsToDelete.length} invited rows.`);
    rowsToDelete.sort((a, b) => b - a).forEach((idx) => sheet.deleteRow(idx));
    SpreadsheetApp.flush();
  }

  return {
    ids: new Set(validEntries.map((e) => e.t)),
    entries: validEntries.map((e) => ({ rawScore: e.s })), // Return full valid entries for benchmarking
  };
}

function loadRecruitDatabase(sheet) {
  if (sheet.getLastRow() < CONFIG.LAYOUT.DATA_START_ROW) return new Map();
  const H = CONFIG.SCHEMA.HH;
  const rows = sheet
    .getRange(
      CONFIG.LAYOUT.DATA_START_ROW,
      2,
      sheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1),
      10,
    )
    .getValues();
  return new Map(
    rows
      .filter((r) => r[H.TAG])
      .map((r) => [
        r[H.TAG],
        {
          tag: r[H.TAG],
          invited: false,
          name: r[H.NAME],
          trophies: r[H.TROPHIES],
          donations: r[H.DONATIONS],
          cards: r[H.CARDS],
          war: r[H.WAR_WINS],
          foundDate: r[H.FOUND_DATE] ? new Date(r[H.FOUND_DATE]) : new Date(),
          rawScore: Number(r[H.RAW_SCORE]),
          perfScore: Number(r[H.PERF_SCORE]),
        },
      ]),
  );
}

function scanTournaments(minTrophies, existingRecruits, blacklistSet) {
  console.time("ScanTournaments");
  const W = CONFIG.HEADHUNTER.WEIGHTS;
  const keywords = CONFIG.HEADHUNTER.KEYWORDS;
  const searchUrls = keywords.map(
    (k) => `${CONFIG.SYSTEM.API_BASE}/tournaments?name=${k}`,
  );

  console.log(
    `📡 Discovery: Broadcasting search for ${keywords.length} keywords...`,
  );
  const searchResults = Utils.fetchRoyaleAPI(searchUrls);
  const uniqueTourneys = new Map();
  searchResults.forEach((res) => {
    if (res && res.items)
      res.items.forEach((t) => uniqueTourneys.set(t.tag, t));
  });

  console.log(`📡 Discovery: Found ${uniqueTourneys.size} open tournaments.`);

  // Decide scan depth based on remote worker availability and a user toggle
  const remoteAvailable = Utils.remoteWorkerHealthy();
  const remoteExpandEnabled = Utils.Props.get("HH_REMOTE_EXPAND", "1") === "1";
  const scanCfg =
    remoteAvailable && remoteExpandEnabled
      ? CONFIG.HEADHUNTER.DEEP_SCAN.REMOTE
      : CONFIG.HEADHUNTER.DEEP_SCAN.LOCAL;

  const lotteryPool = Array.from(uniqueTourneys.values())
    .sort((a, b) => (b.capacity || 0) - (a.capacity || 0))
    .slice(
      0,
      Math.min(
        scanCfg.TOURNEYS || 300,
        CONFIG.HEADHUNTER.DEEP_SCAN.MAX_TOURNEYS || 2000,
      ),
    );
  Utils.shuffleArray(lotteryPool);
  const tourneyTags = lotteryPool
    .slice(0, scanCfg.TOURNEYS || 300)
    .map((t) => t.tag);

  console.log(
    `📡 Discovery: Deep-scanning ${tourneyTags.length} selected tournaments... (remote=${remoteAvailable}, expand=${remoteExpandEnabled})`,
  );

  if (tourneyTags.length === 0) return [];

  const details = Utils.fetchRoyaleAPI(
    tourneyTags.map(
      (t) => `${CONFIG.SYSTEM.API_BASE}/tournaments/${encodeURIComponent(t)}`,
    ),
  );
  const candidates = [];

  details.forEach((d) => {
    if (d && d.membersList && d.membersList.length >= 10) {
      d.membersList.forEach((p) => {
        if (
          (!p.clan || p.clan.tag === "") &&
          (!blacklistSet || !blacklistSet.has(p.tag))
        )
          candidates.push(p);
      });
    }
  });

  const uniqueCandidates = new Map();
  candidates.forEach((c) => {
    if (c.trophies >= minTrophies || c.trophies === undefined)
      uniqueCandidates.set(c.tag, c);
  });

  console.log(
    `👥 Filtering: Extracted ${candidates.length} clanless players. ${uniqueCandidates.size} unique above trophy threshold.`,
  );

  const playerLimit = Math.min(
    CONFIG.HEADHUNTER.DEEP_SCAN.MAX_PLAYERS || 2000,
    scanCfg.PLAYERS || 250,
  );
  const candidatePool = Array.from(uniqueCandidates.values())
    .sort((a, b) => (b.trophies || 0) - (a.trophies || 0))
    .slice(0, playerLimit);
  Utils.shuffleArray(candidatePool);
  const tagsToFetch = candidatePool.slice(0, playerLimit).map((p) => p.tag);

  if (tagsToFetch.length === 0) return [];
  console.log(
    `👥 Filtering: Retrieving full profiles${remoteAvailable ? " (Scoring-as-a-Service)" : ""} for ${tagsToFetch.length} candidates...`,
  );

  const playersData = Utils.fetchRoyaleAPI(
    tagsToFetch.map(
      (t) => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`,
    ),
    remoteAvailable ? W : null,
  );

  const validCandidates = [];
  playersData.forEach((p) => {
    if (p && (p.rawScore !== undefined || p.trophies >= minTrophies)) {
      if (p.rawScore !== undefined) {
        // Data already scored by worker
        validCandidates.push(p);
      } else {
        // Local fallback scoring needed
        validCandidates.push(p);
      }
    }
  });

  if (validCandidates.length > 0) {
    // Determine which candidates need logs (only if not already scored by remote)
    const candidatesToScoreLocally = validCandidates.filter(
      (c) => c.rawScore === undefined,
    );

    if (candidatesToScoreLocally.length > 0) {
      console.log(
        `📡 Local Scoring: Fetching battle logs for ${candidatesToScoreLocally.length} players...`,
      );
      const logUrls = candidatesToScoreLocally.map(
        (p) =>
          `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(p.tag)}/battlelog`,
      );
      const logs = Utils.fetchRoyaleAPI(logUrls);

      candidatesToScoreLocally.forEach((p, idx) => {
        let warBonus = 0;
        if (logs[idx]) {
          const hasWar = logs[idx].some(
            (b) =>
              b.type === "riverRacePvP" ||
              b.type === "boatBattle" ||
              b.type === "riverRaceDuel",
          );
          if (hasWar) warBonus = 500;
        }
        let totalWarScore = (p.warDayWins || 0) + warBonus;
        if (existingRecruits?.has(p.tag))
          totalWarScore = Math.max(
            totalWarScore,
            existingRecruits.get(p.tag).war || 0,
          );
        const rawScore = Math.round(
          p.trophies * W.TROPHY +
            p.totalDonations * W.DON +
            totalWarScore * W.WAR,
        );
        p._computed = {
          tag: p.tag,
          name: p.name,
          trophies: p.trophies,
          donations: p.totalDonations,
          cards: p.challengeCardsWon,
          war: totalWarScore,
          foundDate: new Date(), // Always fresh Date
          invited: false,
          rawScore: rawScore,
        };
      });
    }

    // Map scored data
    validCandidates.forEach((p) => {
      if (p.rawScore !== undefined) {
        p._computed = {
          ...p,
          foundDate: new Date(), // Always fresh Date
          invited: false,
        };
      }
    });
  }

  console.timeEnd("ScanTournaments");
  return validCandidates.map((p) => p._computed).filter(Boolean);
}

function renderHeadhunterView(sheet, list, baseline) {
  sheet.clear();
  const HEADERS = [
    "Tag",
    "Invited",
    "Name",
    "Trophies",
    "Donations",
    "Cards Won",
    "War Wins",
    "Found",
    "Raw Score",
    "Performance Score",
  ];
  const rows = list.map((c) => [
    c.tag,
    c.invited,
    `=HYPERLINK("clashroyale://playerInfo?id=${c.tag.replace("#", "")}", "${c.name}")`,
    c.trophies,
    c.donations,
    c.cards,
    c.war,
    c.foundDate instanceof Date ? c.foundDate : new Date(c.foundDate),
    c.rawScore,
    c.perfScore,
  ]);
  sheet
    .getRange(2, 2, 1, HEADERS.length)
    .setValues([HEADERS])
    .setFontWeight("bold")
    .setWrap(true);
  if (rows.length > 0) {
    const dataRange = sheet.getRange(
      CONFIG.LAYOUT.DATA_START_ROW,
      2,
      rows.length,
      rows[0].length,
    );
    dataRange.setValues(rows);
    sheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        2 + CONFIG.SCHEMA.HH.INVITED,
        rows.length,
        1,
      )
      .insertCheckboxes();
    sheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        2 + CONFIG.SCHEMA.HH.PERF_SCORE,
        rows.length,
        1,
      )
      .setNumberFormat('0"%"');
    sheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        2 + CONFIG.SCHEMA.HH.FOUND_DATE,
        rows.length,
        1,
      )
      .setNumberFormat("yyyy-mm-dd HH:mm:ss"); // 24h format HH instead of hh
    const rule = SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpointWithValue(
        "#ffffff",
        SpreadsheetApp.InterpolationType.NUMBER,
        "0",
      )
      .setGradientMidpointWithValue(
        "#fff2cc",
        SpreadsheetApp.InterpolationType.NUMBER,
        "50",
      )
      .setGradientMaxpointWithValue(
        "#6aa84f",
        SpreadsheetApp.InterpolationType.NUMBER,
        "100",
      )
      .setRanges([
        sheet.getRange(
          CONFIG.LAYOUT.DATA_START_ROW,
          2 + CONFIG.SCHEMA.HH.PERF_SCORE,
          rows.length,
          1,
        ),
      ])
      .build();
    sheet.setConditionalFormatRules([rule]);
  }
  sheet.getRange("B1").setValue(`HEADHUNTER • ${new Date().toLocaleString()}`);
  Utils.applyStandardLayout(
    sheet,
    Math.max(rows.length, CONFIG.HEADHUNTER.TARGET),
    HEADERS.length,
    HEADERS,
  );
}
