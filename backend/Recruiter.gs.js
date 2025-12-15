

/**
 * ============================================================================
 * 🔭 MODULE: RECRUITER
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Scans for un-clanned talent via Tournaments + Battle Logs.
 * ⚙️ LOGIC (V5.1.2): 
 *    1. Parallel Discovery: Fetches multiple tournament keywords simultaneously.
 *    2. Deduplication Engine: Consolidates results into unique Set.
 *    3. Stochastic Prioritization: Top 200 Capacity -> Shuffle -> Top 75.
 *    4. Density Filter: Discards empty rooms (members < 10) after fetch.
 *    5. Mercenary Scoring: Massive bonus for recent war activity.
 *    6. Sticky Memory: Persists War Bonuses even if battles leave the 25-game log.
 *    7. Blacklist (Smart): Tracks scores of invited players for 7 days.
 * 🏷️ VERSION: 5.1.2
 * ============================================================================
 */

const VER_RECRUITER = '5.1.2';

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
  // Filter out any existing recruits that have joined a clan since the last run.
  // This prevents the pool from getting clogged with 50/50 stale players.

  const tagsToCheck = [];
  existing.forEach(p => {
    // Only check if not invited (invited players are tracked by blacklist anyway)
    // And limit to 50 to avoid massive fetches if database is huge (though target is 50)
    if (!p.invited) tagsToCheck.push(p.tag);
  });

  if (tagsToCheck.length > 0) {
    console.log(`🔭 Verifying clan status for ${tagsToCheck.length} existing recruits...`);
    const profiles = Utils.fetchRoyaleAPI(tagsToCheck.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`));

    let removedCount = 0;
    profiles.forEach(p => {
      if (p && p.clan && p.clan.tag) {
        // Player has a clan! Remove from pool immediately.
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
  console.log(`🔭 Threshold Logic: ${logicNote} -> Searching for > ${minTrophies} trophies (Clan Avg: ${Math.round(avgTrophies)}).`);

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

  // ⚓ ANCHOR: Global Benchmark Calculation
  const currentHighRaw = finalPool.length > 0 ? finalPool[0].rawScore : 0;
  const benchmarkScore = Math.max(discardedHighScore, currentHighRaw);

  console.log(`🔭 Scoring Benchmark: ${benchmarkScore} (Active High: ${currentHighRaw} | Discarded High: ${discardedHighScore})`);

  const finalBenchmark = benchmarkScore > 0 ? benchmarkScore : 1;
  finalPool.forEach(p => p.perfScore = Math.round((p.rawScore / finalBenchmark) * 100));

  // 📊 LOGGING
  const survivors = finalPool.filter(p => !initialIds.has(p.tag));

  if (survivors.length > 0) {
    const sample = survivors.slice(0, 3).map(p => p.name).join(', ');
    const moreTxt = survivors.length > 3 ? ` and ${survivors.length - 3} others` : '';
    console.log(`🔭 HEADHUNTER RESULT: Added ${survivors.length} new recruits to the FINAL list (${sample}${moreTxt}).`);
  } else {
    console.log(`🔭 HEADHUNTER RESULT: Scanned candidates, but none were better than the existing Top ${CONFIG.HEADHUNTER.TARGET}. List unchanged.`);
  }

  // 🛡️ BACKUP
  Utils.backupSheet(ss, CONFIG.SHEETS.HH);

  console.log(`💾 Writing ${finalPool.length} active recruits to sheet...`);
  renderHeadhunterView(sheet, finalPool, avgTrophies);

  // ⚡ PWA SYNC: FORCE CACHE UPDATE
  try {
    if (typeof refreshWebPayload === 'function') {
      refreshWebPayload();
      console.log("🔭 Headhunter: PWA Cache Refreshed Successfully.");
    } else {
      console.warn("🔭 Headhunter: refreshWebPayload function not found. PWA Cache not updated.");
    }
  } catch (e) {
    console.warn(`🔭 Headhunter: PWA Refresh Failed - ${e.message}`);
  }
}

/**
 * 🚫 BLACKLIST & HISTORY MANAGER
 * Uses Utils.Props for safe JSON storage of invited players.
 */
function updateAndGetBlacklist(sheet) {
  const PROP_KEY = 'HH_BLACKLIST';
  // Use safe JSON getter (Chunked aware)
  let blacklist = Utils.Props.getChunked(PROP_KEY, {});

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const expiryDuration = (CONFIG.HEADHUNTER.BLACKLIST_DAYS || 7) * dayMs;

  let maxScore = 0;

  // 1. Prune Expired Entries & Find Historical Max
  const tagsToDelete = [];
  for (const tag in blacklist) {
    let entry = blacklist[tag];
    let expiry, score;

    if (typeof entry === 'number') {
      expiry = entry;
      score = 0;
    } else {
      expiry = entry.e;
      score = entry.s || 0;
    }

    if (expiry < now) {
      tagsToDelete.push(tag);
    } else {
      if (score > maxScore) maxScore = score;
    }
  }

  tagsToDelete.forEach(t => delete blacklist[t]);

  // 2. Ingest New Invites from Sheet
  if (sheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    const H = CONFIG.SCHEMA.HH;
    const data = sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2, sheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1), Object.keys(H).length).getValues();

    data.forEach(row => {
      const tag = row[H.TAG];
      const invited = row[H.INVITED];
      const raw = Number(row[H.RAW_SCORE]) || 0;

      if (tag && invited === true) {
        blacklist[tag] = { e: now + expiryDuration, s: raw };
        if (raw > maxScore) maxScore = raw;
      }
    });
  }

  // 3. Save & Return
  const finalSize = Object.keys(blacklist).length;
  if (finalSize > 0) {
    // Use safe JSON setter (Chunked aware)
    const saved = Utils.Props.setChunked(PROP_KEY, blacklist);
    if (saved) {
      console.log(`🚫 Blacklist Updated: ${finalSize} active entries. Discarded High Score: ${maxScore}`);
    }
  }

  return { ids: new Set(Object.keys(blacklist)), highScore: maxScore };
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

  // A. Search Phase: Broad Keywords
  const keywords = CONFIG.HEADHUNTER.KEYWORDS;
  const searchUrls = keywords.map(k => `${CONFIG.SYSTEM.API_BASE}/tournaments?name=${k}`);

  console.log(`🔭 Phase A: Broadcasting search for ${keywords.length} keys: [ "${keywords.join('", "')}" ]`);

  const searchResults = Utils.fetchRoyaleAPI(searchUrls);

  // B. Deduplication Phase
  const uniqueTourneys = new Map();
  let rawCount = 0;

  searchResults.forEach(res => {
    if (res && res.items) {
      res.items.forEach(t => {
        rawCount++;
        uniqueTourneys.set(t.tag, t);
      });
    }
  });

  // C. Strategy: Stochastic Prioritization
  const sortedTournaments = Array.from(uniqueTourneys.values())
    .sort((a, b) => (b.capacity || 0) - (a.capacity || 0));

  const lotteryPool = sortedTournaments.slice(0, 300);
  Utils.shuffleArray(lotteryPool);
  const topTournaments = lotteryPool.slice(0, 150);
  const tourneyTags = topTournaments.map(t => t.tag);

  console.log(`🔭 Phase B: Deduplication & Selection complete. Reduced ${rawCount} raw hits to ${tourneyTags.length} target tournaments.`);

  if (tourneyTags.length === 0) {
    if (rawCount > 0) console.warn(`🔭 FILTER WARNING: Found ${rawCount} tournaments, but deduplication reduced to zero.`);
    else console.warn("🔭 API WARNING: Zero tournaments returned. Check API Keys/Quota.");
    return [];
  }

  // D. Detail Phase
  console.log(`🔭 Phase C: Fetching details for ${tourneyTags.length} tournaments...`);
  const details = Utils.fetchRoyaleAPI(tourneyTags.map(t => `${CONFIG.SYSTEM.API_BASE}/tournaments/${encodeURIComponent(t)}`));

  const candidateTags = new Set();

  details.forEach(d => {
    // DENSITY FILTER: >= 10 members
    if (d && d.membersList && d.membersList.length >= 10) {
      d.membersList.forEach(p => {
        // Must be clanless
        if (!p.clan || p.clan.tag === '') {
          // 🚫 BLACKLIST CHECK
          if (!blacklistSet || !blacklistSet.has(p.tag)) {
            candidateTags.add(p.tag);
          }
        }
      });
    }
  });

  // 🛑 TIME CHECK 1
  if (Date.now() - START_TIME > TIME_LIMIT_MS) {
    console.warn("⏳ Time Limit Reached (Phase C). Stopping scan early.");
    return [];
  }

  // E. Profile Phase
  const tagsToFetch = Array.from(candidateTags).slice(0, 50);
  console.log(`🔭 Phase D: Deep analyzing ${tagsToFetch.length} un-clanned players (from ${candidateTags.size} potential)...`);
  if (tagsToFetch.length === 0) return [];

  const playersData = Utils.fetchRoyaleAPI(tagsToFetch.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`));

  const validCandidates = [];
  const playersNeedingWarLogs = [];
  const playersNeedingWarLogsIndices = [];
  let rejectedStats = { lowTrophy: 0 };

  playersData.forEach(p => {
    if (p) {
      if (p.trophies >= minTrophies) {
        validCandidates.push(p);
        playersNeedingWarLogs.push(p.tag);
        playersNeedingWarLogsIndices.push(validCandidates.length - 1);
      } else {
        rejectedStats.lowTrophy++;
      }
    }
  });

  console.log(`🔭 Filter Stats: Accepted ${validCandidates.length}. Rejected ${rejectedStats.lowTrophy} (Low Trophies).`);

  // 🛑 TIME CHECK 2
  if (Date.now() - START_TIME > TIME_LIMIT_MS) {
    console.warn("⏳ Time Limit Reached (Phase E). Saving candidates without War Analysis.");
    return validCandidates.map(p => ({
      tag: p.tag, name: p.name, trophies: p.trophies, donations: p.totalDonations,
      cards: p.challengeCardsWon, war: 0, foundDate: new Date(), invited: false,
      rawScore: Math.round((p.trophies * W.TROPHY) + (p.totalDonations * W.DON))
    }));
  }

  // F. Deep Dive Phase (Battle Logs)
  if (playersNeedingWarLogs.length > 0) {
    console.log(`🔭 Phase F: Scanning battle logs for war activity...`);
    const logs = Utils.fetchRoyaleAPI(playersNeedingWarLogs.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}/battlelog`));

    validCandidates.forEach((p, idx) => {
      const logIdx = playersNeedingWarLogsIndices.indexOf(idx);
      let warBonus = 0;

      if (logIdx > -1 && logs[logIdx]) {
        // Check for ANY river race activity in last 25 battles
        const hasWarActivity = logs[logIdx].some(b => b.type === 'riverRacePvP' || b.type === 'boatBattle' || b.type === 'riverRaceDuel');
        if (hasWarActivity) warBonus = 500;
      }

      // STICKY MEMORY
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
  } else {
    sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2).setValue("Scan Complete: No suitable candidates found this run.");
  }

  sheet.getRange('B1').setValue(`HEADHUNTER • ${new Date().toLocaleString()}`);

  const layoutRows = Math.max(rows.length, CONFIG.HEADHUNTER.TARGET);
  if (rows.length > 0 && rows.length < layoutRows) {
    const startRow = CONFIG.LAYOUT.DATA_START_ROW + rows.length;
    const numRows = layoutRows - rows.length;
    sheet.getRange(startRow, 2, numRows, HEADERS.length)
      .clearContent()
      .clearDataValidations();
  }

  Utils.applyStandardLayout(sheet, layoutRows, HEADERS.length, HEADERS);
}
