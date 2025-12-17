
/**
 * ============================================================================
 * 🔭 MODULE: RECRUITER
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Scans for un-clanned talent via Tournaments + Battle Logs.
 * ⚙️ LOGIC (V6.2.0): 
 *    1. Parallel Discovery: Fetches multiple tournament keywords simultaneously.
 *    2. Deduplication Engine: Consolidates results into unique Set.
 *    3. Stochastic Prioritization (DOUBLE SHUFFLE): 
 *       - Phase 1: Tournaments (Top 800 -> Shuffle -> Pick 150).
 *       - Phase 2: Candidates (Top 200 Trophies -> Shuffle -> Pick 100).
 *    4. Density Filter: Discards empty rooms (members < 10) after fetch.
 *    5. Mercenary Scoring: Massive bonus for recent war activity.
 *    6. Sticky Memory: Persists War Bonuses even if battles leave the 25-game log.
 *    7. Blacklist (Smart): Tracks scores of invited players for 14 days.
 *    8. Top-3 Benchmark: Anchors potential scores against the historical elite.
 * 🏷️ VERSION: 6.2.0
 * ============================================================================
 */

const VER_RECRUITER = '6.2.0';

function scoutRecruits() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheet = ss.getSheetByName(CONFIG.SHEETS.HH);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEETS.HH);

  const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);

  // 1. Establish Baseline
  const baselineData = Utils.fetchRoyaleAPI([`${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`]);
  let avgTrophies = 4000;
  if (baselineData && baselineData[0] && baselineData[0].items) {
    avgTrophies = baselineData[0].items.reduce((a, b) => a + b.trophies, 0) / baselineData[0].items.length;
  }

  // 🚫 BLACKLIST & BENCHMARK UPDATE
  const { ids: blacklistSet, highScore: discardedHighScore } = updateAndGetBlacklist(sheet);

  // 2. Load existing tracking data FIRST to check Pool Size
  const existing = loadRecruitDatabase(sheet);

  // ⚡ OPTIMIZATION: "Cheap" Clanless Check
  const tagsToCheck = [];
  existing.forEach(p => {
    if (!p.invited) tagsToCheck.push(p.tag);
  });

  if (tagsToCheck.length > 0) {
    console.log(`🔭 Verifying clan status for ${tagsToCheck.length} existing recruits...`);
    const profiles = Utils.fetchRoyaleAPI(tagsToCheck.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`));

    let removedCount = 0;
    profiles.forEach(p => {
      if (p && p.clan && p.clan.tag) {
        if (existing.has(p.tag)) {
          existing.delete(p.tag);
          removedCount++;
        }
      }
    });

    if (removedCount > 0) {
      console.log(`🔭 Cleanup: Removed ${removedCount} recruits who found a clan.`);
    }
  }

  const initialIds = new Set(existing.keys());

  // Count active recruits (Not Invited)
  let activePoolCount = 0;
  existing.forEach(p => { if (!p.invited) activePoolCount++; });

  // 3. Dynamic Safety Cap
  const target = CONFIG.HEADHUNTER.TARGET;
  const isFillingPhase = activePoolCount < target;

  let calculatedThreshold = avgTrophies;
  let logicNote = "Strict Average";

  if (isFillingPhase) {
    calculatedThreshold = avgTrophies * 0.75;
    logicNote = "Safety Cap (75%)";
  }

  const minTrophies = Math.max(4000, Math.round(calculatedThreshold));

  console.log(`🔭 Headhunter Context: Pool ${activePoolCount}/${target} (${isFillingPhase ? 'Filling' : 'Full'}).`);
  console.log(`🔭 Threshold Logic: ${logicNote} -> Searching for > ${minTrophies} trophies.`);

  // 🧹 CLEANUP: Remove players who have already been invited
  for (const [tag, player] of existing) {
    if (player.invited) {
      existing.delete(tag);
    }
  }

  // 4. Run the optimized scan
  const scanned = scanTournaments(minTrophies, existing, blacklistSet);

  // 5. Merge New Scans with Old Tracking
  scanned.forEach(c => {
    if (existing.has(c.tag)) {
      c.invited = existing.get(c.tag).invited;
      c.foundDate = existing.get(c.tag).foundDate;
    }
    existing.set(c.tag, c);
  });

  // 6. Score and Sort
  const finalPool = Array.from(existing.values())
    .sort((a, b) => b.rawScore - a.rawScore)
    .slice(0, CONFIG.HEADHUNTER.TARGET);

  // ⚓ ANCHOR: Global Benchmark Calculation (V6.2: Top-3 Average Anchor)
  const currentHighRaw = finalPool.length > 0 ? finalPool[0].rawScore : 0;
  
  // Use the historical benchmark or current pool high (if someone new broke the record)
  const benchmarkScore = Math.max(discardedHighScore, currentHighRaw);

  const finalBenchmark = benchmarkScore > 0 ? benchmarkScore : 1;
  finalPool.forEach(p => p.perfScore = Math.round((p.rawScore / finalBenchmark) * 100));

  // 🛡️ FINAL CONSISTENCY CHECK
  const finalInvitedTags = new Set();
  if (sheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    const numRows = sheet.getLastRow() - CONFIG.LAYOUT.DATA_START_ROW + 1;
    const invitedColData = sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2 + CONFIG.SCHEMA.HH.INVITED, numRows, 1).getValues();
    const tagColData = sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2 + CONFIG.SCHEMA.HH.TAG, numRows, 1).getValues();
    
    invitedColData.forEach((row, index) => {
      if (row[0] === true && tagColData[index][0]) {
        finalInvitedTags.add(tagColData[index][0]);
      }
    });
  }
  
  const trulyFinalPool = finalPool.filter(p => !finalInvitedTags.has(p.tag));
  
  // 📊 LOGGING
  const survivors = trulyFinalPool.filter(p => !initialIds.has(p.tag));
  if (survivors.length > 0) {
    console.log(`🔭 HEADHUNTER RESULT: Added ${survivors.length} new recruits.`);
  }

  // 🛡️ BACKUP
  Utils.backupSheet(ss, CONFIG.SHEETS.HH);

  renderHeadhunterView(sheet, trulyFinalPool, avgTrophies);

  // ⚡ PWA SYNC
  try {
    if (typeof refreshWebPayload === 'function') {
      refreshWebPayload();
    }
  } catch (e) {
    console.warn(`🔭 Headhunter: PWA Refresh Failed - ${e.message}`);
  }
}

/**
 * 🚫 BLACKLIST & HISTORY MANAGER
 * UPDATED V6.2.0:
 * 1. Implements 14-day history retention.
 * 2. Calculates Benchmark using the average of the TOP 3 historical scores.
 * 3. Prevents "Unicorn Outliers" from distorting percentages.
 */
function updateAndGetBlacklist(sheet) {
  const PROP_KEY = 'HH_BLACKLIST';
  let blacklist = Utils.Props.getChunked(PROP_KEY, {});

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const expiryDuration = (CONFIG.HEADHUNTER.BLACKLIST_DAYS || 14) * dayMs;

  const activeScores = [];
  const tagsToDelete = [];

  // 🧹 1. CLEANUP EXPIRED ENTRIES & COLLECT SCORES
  for (const tag in blacklist) {
    let entry = blacklist[tag];
    let expiry = entry.e || 0;
    let score = entry.s || 0;

    if (expiry < now) {
      tagsToDelete.push(tag);
    } else {
      activeScores.push(score);
    }
  }

  tagsToDelete.forEach(t => delete blacklist[t]);

  // 📥 2. INGEST NEW INVITES FROM SHEET
  if (sheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    const H = CONFIG.SCHEMA.HH;
    const numRows = sheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1);
    const data = sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2, numRows, Object.keys(H).length).getValues();

    data.forEach(row => {
      const tag = row[H.TAG];
      const invited = row[H.INVITED];
      const raw = Number(row[H.RAW_SCORE]) || 0;

      // Only track if successfully invited
      if (tag && invited === true) {
        // If not in blacklist or this instance has a higher score (rare), record it
        if (!blacklist[tag] || blacklist[tag].s < raw) {
          blacklist[tag] = { e: now + expiryDuration, s: raw };
          activeScores.push(raw);
        }
      }
    });
  }

  // ⚓ 3. CALCULATE ROBUST BENCHMARK (Top-3 Average)
  // This stabilizes the 100% mark across the 14-day window.
  activeScores.sort((a, b) => b - a);
  const topN = activeScores.slice(0, 3);
  const benchmarkHigh = topN.length > 0 ? (topN.reduce((a, b) => a + b, 0) / topN.length) : 0;

  // 💾 4. PERSIST
  if (Object.keys(blacklist).length > 0 || tagsToDelete.length > 0) {
    Utils.Props.setChunked(PROP_KEY, blacklist);
  }

  console.log(`🚫 Blacklist: ${Object.keys(blacklist).length} active. Benchmark anchor (Top-3 Avg): ${Math.round(benchmarkHigh)}.`);

  return { ids: new Set(Object.keys(blacklist)), highScore: benchmarkHigh };
}

function loadRecruitDatabase(sheet) {
  const map = new Map();
  if (sheet.getLastRow() < CONFIG.LAYOUT.DATA_START_ROW) return map;

  const H = CONFIG.SCHEMA.HH;
  const numRows = sheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1);
  const numCols = Object.keys(H).length;

  if (numRows < 1) return map;

  const rows = sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2, numRows, numCols).getValues();
  rows.forEach(r => {
    if (r[H.TAG]) map.set(r[H.TAG], {
      tag: r[H.TAG], invited: r[H.INVITED], name: r[H.NAME], trophies: r[H.TROPHIES],
      donations: r[H.DONATIONS], cards: r[H.CARDS], war: r[H.WAR_WINS],
      foundDate: r[H.FOUND_DATE] ? new Date(r[H.FOUND_DATE]) : new Date(),
      rawScore: Number(r[H.RAW_SCORE]), perfScore: Number(r[H.PERF_SCORE])
    });
  });
  return map;
}

/**
 * ⚡ CORE ALGORITHM: Deep Net Protocol
 */
function scanTournaments(minTrophies, existingRecruits, blacklistSet) {
  console.time('ScanTournaments');
  const START_TIME = Date.now();
  const TIME_LIMIT_MS = 240000; 
  const W = CONFIG.HEADHUNTER.WEIGHTS;

  const keywords = CONFIG.HEADHUNTER.KEYWORDS;
  const searchUrls = keywords.map(k => `${CONFIG.SYSTEM.API_BASE}/tournaments?name=${k}`);

  console.log(`🔭 Phase A: Broadcasting search for ${keywords.length} keys...`);
  const searchResults = Utils.fetchRoyaleAPI(searchUrls);

  const uniqueTourneys = new Map();
  searchResults.forEach(res => {
    if (res && res.items) {
      res.items.forEach(t => {
        uniqueTourneys.set(t.tag, t);
      });
    }
  });

  const sortedTournaments = Array.from(uniqueTourneys.values())
    .sort((a, b) => (b.capacity || 0) - (a.capacity || 0));

  const lotteryPool = sortedTournaments.slice(0, 800); 
  Utils.shuffleArray(lotteryPool);
  const topTournaments = lotteryPool.slice(0, 150); 
  const tourneyTags = topTournaments.map(t => t.tag);

  if (tourneyTags.length === 0) return [];

  const details = Utils.fetchRoyaleAPI(tourneyTags.map(t => `${CONFIG.SYSTEM.API_BASE}/tournaments/${encodeURIComponent(t)}`));
  const candidates = []; 

  details.forEach(d => {
    if (d && d.membersList && d.membersList.length >= 10) {
      d.membersList.forEach(p => {
        if (!p.clan || p.clan.tag === '') {
          if (!blacklistSet || !blacklistSet.has(p.tag)) {
            candidates.push(p);
          }
        }
      });
    }
  });

  if (Date.now() - START_TIME > TIME_LIMIT_MS) return [];

  const uniqueCandidates = new Map();
  candidates.forEach(c => uniqueCandidates.set(c.tag, c));
  
  const qualifiedCandidates = Array.from(uniqueCandidates.values())
                                   .filter(p => {
                                      if (p.trophies === undefined || p.trophies === null) return true;
                                      return p.trophies >= minTrophies;
                                   });

  qualifiedCandidates.sort((a, b) => (b.trophies || 0) - (a.trophies || 0));

  const candidatePool = qualifiedCandidates.slice(0, 200);
  Utils.shuffleArray(candidatePool);
  const tagsToFetch = candidatePool.slice(0, 100).map(p => p.tag);

  if (tagsToFetch.length === 0) return [];

  const playersData = Utils.fetchRoyaleAPI(tagsToFetch.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`));

  const validCandidates = [];
  const playersNeedingWarLogs = [];
  const playersNeedingWarLogsIndices = [];

  playersData.forEach(p => {
    if (p) {
      if (p.trophies >= minTrophies) {
        validCandidates.push(p);
        playersNeedingWarLogs.push(p.tag);
        playersNeedingWarLogsIndices.push(validCandidates.length - 1);
      }
    }
  });

  if (playersNeedingWarLogs.length > 0) {
    const logs = Utils.fetchRoyaleAPI(playersNeedingWarLogs.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}/battlelog`));

    validCandidates.forEach((p, idx) => {
      const logIdx = playersNeedingWarLogsIndices.indexOf(idx);
      let warBonus = 0;

      if (logIdx > -1 && logs[logIdx]) {
        const hasWarActivity = logs[logIdx].some(b => b.type === 'riverRacePvP' || b.type === 'boatBattle' || b.type === 'riverRaceDuel');
        if (hasWarActivity) warBonus = 500;
      }

      let totalWarScore = (p.warDayWins || 0) + warBonus;
      if (existingRecruits && existingRecruits.has(p.tag)) {
        const storedRecruit = existingRecruits.get(p.tag);
        const storedWar = storedRecruit.war || 0;
        if (storedWar > totalWarScore) {
          totalWarScore = storedWar;
        }
      }

      const rawScore = Math.round((p.trophies * W.TROPHY) + (p.totalDonations * W.DON) + (totalWarScore * W.WAR));

      p._computed = {
        tag: p.tag, name: p.name, trophies: p.trophies, donations: p.totalDonations,
        cards: p.challengeCardsWon, war: totalWarScore, foundDate: new Date(), invited: false,
        rawScore: rawScore
      };
    });
  }

  console.timeEnd('ScanTournaments');
  return validCandidates.map(p => p._computed).filter(Boolean);
}

function renderHeadhunterView(sheet, list, baseline) {
  sheet.clear();
  const HEADERS = ['Tag', 'Invited', 'Name', 'Trophies', 'Donations', 'Cards Won', 'War Wins', 'Found', 'Raw Score', 'Performance Score'];

  const rows = list.map(c => [
    c.tag, c.invited,
    `=HYPERLINK("clashroyale://playerInfo?id=${c.tag.replace('#', '')}", "${c.name}")`,
    c.trophies, c.donations, c.cards, c.war,
    new Date(c.foundDate),
    c.rawScore, c.perfScore
  ]);

  const H = CONFIG.SCHEMA.HH;
  sheet.getRange(2, 2, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setWrap(true);

  if (rows.length > 0) {
    const dataRange = sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2, rows.length, rows[0].length);
    dataRange.setValues(rows);
    sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2 + H.INVITED, rows.length, 1).insertCheckboxes();
    sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2 + H.PERF_SCORE, rows.length, 1).setNumberFormat('0"%"');
    sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2 + H.FOUND_DATE, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');

    const rule = SpreadsheetApp.newConditionalFormatRule()
      .setGradientMinpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.NUMBER, "0")
      .setGradientMidpointWithValue('#fff2cc', SpreadsheetApp.InterpolationType.NUMBER, "50")
      .setGradientMaxpointWithValue('#6aa84f', SpreadsheetApp.InterpolationType.NUMBER, "100")
      .setRanges([sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2 + H.PERF_SCORE, rows.length, 1)])
      .build();
    sheet.setConditionalFormatRules([rule]);
  }

  sheet.getRange('B1').setValue(`HEADHUNTER • ${new Date().toLocaleString()}`);

  const layoutRows = Math.max(rows.length, CONFIG.HEADHUNTER.TARGET);
  Utils.applyStandardLayout(sheet, layoutRows, HEADERS.length, HEADERS);
}

