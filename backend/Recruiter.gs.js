

/**
 * ============================================================================
 * 🔭 MODULE: RECRUITER
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Scans for un-clanned talent via Tournaments + Battle Logs.
 * ⚙️ LOGIC (V5.0.0): 
 *    1. Parallel Discovery: Fetches multiple tournament keywords simultaneously.
 *    2. Deduplication Engine: Consolidates results into unique Set.
 *    3. Stochastic Prioritization:
 *       - Sorts tournaments by Capacity (Descending).
 *       - Takes the Top 200 (Wider Net for diversity).
 *       - SHUFFLES them randomly.
 *       - Selects the first 75 to scan.
 *    4. Density Filter: Discards empty rooms (members < 10) after fetch.
 *    5. Mercenary Scoring: Massive bonus for recent war activity.
 *    6. Sticky Memory: Persists War Bonuses even if battles leave the 25-game log.
 *    7. Blacklist: Ignored "Invited" players for 7 days to prevent cycling.
 * 🏷️ VERSION: 5.0.0
 * ============================================================================
 */

const VER_RECRUITER = '5.0.0';

function scoutRecruits() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  let sheet = ss.getSheetByName(CONFIG.SHEETS.HH);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEETS.HH);

  const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);
  
  // 1. Establish Baseline (What constitutes a "good" player?)
  const baselineData = Utils.fetchRoyaleAPI([`${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`]);
  let avgTrophies = 4000; 
  if (baselineData && baselineData[0] && baselineData[0].items) {
    avgTrophies = baselineData[0].items.reduce((a,b)=>a+b.trophies,0) / baselineData[0].items.length;
  }
  
  // 🚫 BLACKLIST UPDATE
  // We must do this BEFORE loading existing map and deleting entries, 
  // because updateAndGetBlacklist reads the "Invited=TRUE" rows from the sheet itself.
  const blacklistSet = updateAndGetBlacklist(sheet);

  // 2. Load existing tracking data FIRST to check Pool Size
  const existing = loadRecruitDatabase(sheet);
  // 📸 SNAPSHOT: Capture the original IDs to determine who is truly "New" later
  const initialIds = new Set(existing.keys());
  
  // Count active recruits (Not Invited)
  let activePoolCount = 0;
  existing.forEach(p => { if(!p.invited) activePoolCount++; });
  
  // 3. FEATURE: Dynamic Safety Cap
  // If the pool is low (Filling Phase), we apply a Safety Cap (75% of Avg) to lower the barrier.
  // If the pool is full (Maintenance Phase), we remove the cap (100% of Avg) to find only elite upgrades.
  const target = CONFIG.HEADHUNTER.TARGET;
  const isFillingPhase = activePoolCount < target;
  
  let calculatedThreshold = avgTrophies;
  let logicNote = "Strict Average";

  if (isFillingPhase) {
    calculatedThreshold = avgTrophies * 0.75; // The Safety Cap
    logicNote = "Safety Cap (75%)";
  }
  
  // Always enforce absolute floor of 4000 (No beginners)
  const minTrophies = Math.max(4000, Math.round(calculatedThreshold));
  
  console.log(`🔭 Headhunter Context: Pool ${activePoolCount}/${target} (${isFillingPhase ? 'Filling' : 'Full'}).`);
  console.log(`🔭 Threshold Logic: ${logicNote} -> Searching for > ${minTrophies} trophies (Clan Avg: ${Math.round(avgTrophies)}).`);

  // 🧹 CLEANUP: Remove players who have already been invited
  // This ensures the list stays fresh and focused on pending candidates.
  // NOTE: These players were added to the blacklist in the step above, so they won't be re-scanned.
  for (const [tag, player] of existing) {
    if (player.invited) {
      existing.delete(tag);
    }
  }
  
  // 4. Run the optimized scan
  // Pass 'existing' map to enable Sticky Memory (War Bonus Persistence)
  // Pass 'blacklistSet' to ignore recently invited players
  const scanned = scanTournaments(minTrophies, existing, blacklistSet);
  
  // 5. Merge New Scans with Old Tracking
  scanned.forEach(c => {
    if (existing.has(c.tag)) {
      // Existing candidate: preserve history
      c.invited = existing.get(c.tag).invited;
      c.foundDate = existing.get(c.tag).foundDate;
    } 
    // We do NOT count new recruits here anymore. 
    // We wait until after the "Cut" to see if they actually survived.
    existing.set(c.tag, c);
  });
  
  // 6. Score and Sort
  // We keep top TARGET candidates, sorting by RAW SCORE.
  // REASONING: New recruits don't have a perfScore yet, so we must use rawScore to compare fairly against old recruits.
  const finalPool = Array.from(existing.values())
    .sort((a,b) => b.rawScore - a.rawScore)
    .slice(0, CONFIG.HEADHUNTER.TARGET);

  // Normalize Performance Score for UI (0-100 relative to best in pool)
  const maxScore = finalPool.length > 0 ? Math.max(...finalPool.map(p => p.rawScore)) : 1;
  finalPool.forEach(p => p.perfScore = Math.round((p.rawScore / maxScore) * 100));

  // 📊 LOGGING: The Honest Report
  // We compare the Final Pool against the Initial IDs.
  // If a player is in the Final Pool but WAS NOT in Initial IDs, they are a "Survivor" (New Add).
  const survivors = finalPool.filter(p => !initialIds.has(p.tag));
  
  if (survivors.length > 0) {
    const sample = survivors.slice(0, 3).map(p => p.name).join(', ');
    const moreTxt = survivors.length > 3 ? ` and ${survivors.length - 3} others` : '';
    console.log(`🔭 HEADHUNTER RESULT: Added ${survivors.length} new recruits to the FINAL list (${sample}${moreTxt}).`);
  } else {
    console.log(`🔭 HEADHUNTER RESULT: Scanned candidates, but none were better than the existing Top ${CONFIG.HEADHUNTER.TARGET}. List unchanged.`);
  }

  // 🛡️ BACKUP: Snapshot right before writing the new list
  Utils.backupSheet(ss, CONFIG.SHEETS.HH);

  console.log(`💾 Writing ${finalPool.length} active recruits to sheet...`);
  renderHeadhunterView(sheet, finalPool, avgTrophies);
}

/**
 * 🚫 BLACKLIST MANAGER
 * Stores "Invited" players in ScriptProperties with an expiry timestamp.
 * Returns a Set of Tags to ignore during the current scan.
 */
function updateAndGetBlacklist(sheet) {
  const PROP_KEY = 'HH_BLACKLIST';
  const prop = PropertiesService.getScriptProperties();
  const rawProp = prop.getProperty(PROP_KEY);
  let blacklist = {};
  
  try {
    if (rawProp) blacklist = JSON.parse(rawProp);
  } catch(e) { console.warn("Corrupted Blacklist, resetting."); }

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const expiryDuration = (CONFIG.HEADHUNTER.BLACKLIST_DAYS || 7) * dayMs;
  
  // 1. Prune Expired Entries
  const initialSize = Object.keys(blacklist).length;
  for (const tag in blacklist) {
    if (blacklist[tag] < now) {
      delete blacklist[tag];
    }
  }

  // 2. Ingest New Invites from Sheet
  // We scan the current sheet state. If a player is marked invited, we add them.
  // This logic runs BEFORE the rows are deleted by scoutRecruits.
  if (sheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    const H = CONFIG.SCHEMA.HH;
    const data = sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2, sheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1), Object.keys(H).length).getValues();
    
    data.forEach(row => {
      const tag = row[H.TAG];
      const invited = row[H.INVITED];
      
      if (tag && invited === true) {
        // Add or Update expiry to 7 days from NOW
        blacklist[tag] = now + expiryDuration;
      }
    });
  }
  
  // 3. Save & Return
  const finalSize = Object.keys(blacklist).length;
  if (finalSize !== initialSize || finalSize > 0) {
    // Only save if changed or not empty to save IO
    try {
      prop.setProperty(PROP_KEY, JSON.stringify(blacklist));
      console.log(`🚫 Blacklist Updated: ${finalSize} active entries (Pruned ${initialSize > finalSize ? initialSize - finalSize : 0}).`);
    } catch(e) {
      console.warn("Blacklist save failed (likely size limit): " + e.message);
    }
  }
  
  return new Set(Object.keys(blacklist));
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
    if(r[H.TAG]) map.set(r[H.TAG], { 
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
 * Optimization: Deduplicates tournaments BEFORE detailed fetching to prevent redundant API calls.
 */
function scanTournaments(minTrophies, existingRecruits, blacklistSet) {
  console.time('ScanTournaments');
  const START_TIME = Date.now();
  const TIME_LIMIT_MS = 240000; // 4 Minutes (Leave 2 mins for Orchestrator/Save)
  const W = CONFIG.HEADHUNTER.WEIGHTS;
  
  // A. Search Phase: Broad Keywords (Parallel Fetch)
  const keywords = CONFIG.HEADHUNTER.KEYWORDS;
  const searchUrls = keywords.map(k => `${CONFIG.SYSTEM.API_BASE}/tournaments?name=${k}`);
  
  console.log(`🔭 Phase A: Broadcasting search for ${keywords.length} keys: [ "${keywords.join('", "')}" ]`);
  
  const searchResults = Utils.fetchRoyaleAPI(searchUrls); 

  // B. Deduplication Phase: Map(Tag -> Tournament)
  // This solves the overlapping keyword issue (e.g. "abc" matches 'a', 'b', and 'c')
  const uniqueTourneys = new Map();
  let rawCount = 0;

  searchResults.forEach(res => {
    if (res && res.items) {
      res.items.forEach(t => {
        rawCount++;
        // RELAXED FILTER:
        // We accept ALL tournaments here. We cannot filter by 'currentPlayers' 
        // because the Search API often omits it. We filter by density LATER.
        uniqueTourneys.set(t.tag, t);
      });
    }
  });

  // STRATEGY: Stochastic Prioritization (The "Lottery" System)
  // 1. Sort by Capacity (Descending) to bring the "Big Fish" (1000/500/100) to the top.
  const sortedTournaments = Array.from(uniqueTourneys.values())
    .sort((a, b) => (b.capacity || 0) - (a.capacity || 0));

  // 2. Select a wider pool of candidates (Top 200).
  const lotteryPool = sortedTournaments.slice(0, 200);

  // 3. Shuffle this pool.
  // This ensures we don't just check the exact same empty 1000-cap tournaments every time.
  Utils.shuffleArray(lotteryPool);

  // 4. Moderate Scan (Top 75 of the Shuffled list)
  // 36 Search + 75 Details + 50 Profiles = ~161 calls. 
  const topTournaments = lotteryPool.slice(0, 75);
  const tourneyTags = topTournaments.map(t => t.tag);

  console.log(`🔭 Phase B: Deduplication & Selection complete. Reduced ${rawCount} raw hits to ${tourneyTags.length} target tournaments (Randomized Selection from Top 200).`);
  
  if (tourneyTags.length === 0) {
    if (rawCount > 0) {
      console.warn(`🔭 FILTER WARNING: Found ${rawCount} tournaments, but deduplication reduced to zero. Check logic.`);
    } else {
      console.warn("🔭 API WARNING: Zero tournaments returned. Check API Keys/Quota.");
    }
    return [];
  }

  // C. Detail Phase: Get members from unique tournaments
  console.log(`🔭 Phase C: Fetching details for ${tourneyTags.length} tournaments...`);
  const details = Utils.fetchRoyaleAPI(tourneyTags.map(t => `${CONFIG.SYSTEM.API_BASE}/tournaments/${encodeURIComponent(t)}`));

  const candidateTags = new Set();
  
  details.forEach(d => {
    // DENSITY FILTER (SAFE STATE):
    // Now that we have the full details, we check the ACTUAL player count.
    // We only recruit from active hives (>= 10 members).
    if (d && d.membersList && d.membersList.length >= 10) {
      d.membersList.forEach(p => {
        // Core Recruitment Rule: Must be clanless
        if (!p.clan || p.clan.tag === '') {
          // 🚫 BLACKLIST CHECK: Skip if recently invited
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

  // D. Profile Phase: Fetch Details for Candidates
  // Limit to 50 active lookups to keep execution safe
  const tagsToFetch = Array.from(candidateTags).slice(0, 50);
  console.log(`🔭 Phase D: Deep analyzing ${tagsToFetch.length} un-clanned players (from ${candidateTags.size} potential)...`);
  if (tagsToFetch.length === 0) return [];

  const playersData = Utils.fetchRoyaleAPI(tagsToFetch.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`));

  const validCandidates = [];
  const playersNeedingWarLogs = [];
  const playersNeedingWarLogsIndices = [];
  
  let rejectedStats = { lowTrophy: 0 };

  // E. Logic Phase: Filter Active Players
  playersData.forEach(p => {
    if (p) {
        if (p.trophies >= minTrophies) {
            // FILTER REMOVED: HoursSinceSeen logic is removed. 
            // If they are in the tournament list, they are deemed valid candidates.
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

  // F. Deep Dive Phase: Fetch Battle Logs
  if (playersNeedingWarLogs.length > 0) {
    console.log(`🔭 Phase F: Scanning battle logs for war activity...`);
    const logs = Utils.fetchRoyaleAPI(playersNeedingWarLogs.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}/battlelog`));

    validCandidates.forEach((p, idx) => {
      const logIdx = playersNeedingWarLogsIndices.indexOf(idx);
      let warBonus = 0;
      
      if (logIdx > -1 && logs[logIdx]) {
        // Check for ANY river race activity in last 25 battles
        const hasWarActivity = logs[logIdx].some(b => b.type === 'riverRacePvP' || b.type === 'boatBattle' || b.type === 'riverRaceDuel');
        if (hasWarActivity) warBonus = 500; // MASSIVE BONUS: 500 wins * 20 weight = 10,000 points. "The Mercenary God" bonus.
      }

      // STICKY MEMORY IMPLEMENTATION (V10.5.1)
      // Problem: Battle Log only holds 25 items (~2-6 hours of gameplay).
      // If a player played war yesterday, it falls off the log, causing their score to drop.
      // Solution: If the player is already in our spreadsheet with a high War Score (implying a bonus),
      // we PERSIST that bonus. "Once a mercenary, always a mercenary."
      
      let totalWarScore = (p.warDayWins || 0) + warBonus;
      
      if (existingRecruits && existingRecruits.has(p.tag)) {
        const storedRecruit = existingRecruits.get(p.tag);
        const storedWar = storedRecruit.war || 0;
        
        // If the stored score is higher than the currently calculated score,
        // it means they likely had a War Bonus in a previous scan that is now lost.
        // We restore it.
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
    `=HYPERLINK("${CONFIG.SYSTEM.WEB_APP_URL}?mode=pool&pin=${c.tag.replace('#','')}", "${c.name}")`,
    c.trophies, c.donations, c.cards, c.war, 
    new Date(c.foundDate), // ⚠️ FIXED: Passing raw Date object to preserve full timestamp info
    c.rawScore, c.perfScore  
  ]);

  const H = CONFIG.SCHEMA.HH;
  sheet.getRange(2, 2, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setWrap(true);

  if (rows.length > 0) {
    const dataRange = sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2, rows.length, rows[0].length);
    dataRange.setValues(rows);
    sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2 + H.INVITED, rows.length, 1).insertCheckboxes();
    sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2 + H.PERF_SCORE, rows.length, 1).setNumberFormat('0"%"');
    // ⚠️ FIXED: Explicit full-precision date format for visual debugging
    sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2 + H.FOUND_DATE, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    
    // Formatting: Highlight good scores
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
  
  // FIX: Force layout to Target size (50) to ensure empty slots are visible
  const layoutRows = Math.max(rows.length, CONFIG.HEADHUNTER.TARGET);
  
  // Explicitly clear buffer rows if we have fewer results than the target (e.g., 47 rows found vs 50 slots).
  // This removes any ghost checkboxes or artifacts from previous runs in the empty "buffer" slots.
  if (rows.length > 0 && rows.length < layoutRows) {
    const startRow = CONFIG.LAYOUT.DATA_START_ROW + rows.length;
    const numRows = layoutRows - rows.length;
    sheet.getRange(startRow, 2, numRows, HEADERS.length)
         .clearContent()
         .clearDataValidations();
  }
  
  // Centralized layout logic (Utilities.gs.js) now handles Column Widths (100) and Alignment.
  // Pass HEADERS for schema enforcement
  Utils.applyStandardLayout(sheet, layoutRows, HEADERS.length, HEADERS);
}