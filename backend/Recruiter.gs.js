
/**
 * ============================================================================
 * 🔭 MODULE: RECRUITER
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Scans for un-clanned talent via Tournaments + Battle Logs.
 * ⚙️ LOGIC (V6.2.3): 
 *    1. Parallel Discovery: Fetches multiple tournament keywords simultaneously.
 *    2. Deduplication Engine: Consolidates results into unique Set.
 *    3. High Volume Ready: 
 *       - Blacklist uses O(1) Map lookup.
 *       - Self-Cleaning: Marked "Invited" rows are purged from sheet to maintain speed.
 *    4. Coherent Storage: Blacklist is sorted by SCORE (DESC) for benchmarking.
 *    5. Top-3 Benchmark: Anchors potential scores against the historical elite.
 * 🏷️ VERSION: 6.2.3
 * ============================================================================
 */

const VER_RECRUITER = '6.2.3';

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

  // 🚫 BLACKLIST & BENCHMARK UPDATE (Sorted & High Performance)
  const { ids: blacklistSet, highScore: discardedHighScore } = updateAndGetBlacklist(sheet);

  // 2. Load existing tracking data (Those NOT yet invited)
  const existing = loadRecruitDatabase(sheet);

  // ⚡ OPTIMIZATION: "Cheap" Clanless Check for survivors
  const tagsToCheck = Array.from(existing.keys());
  if (tagsToCheck.length > 0) {
    const profiles = Utils.fetchRoyaleAPI(tagsToCheck.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`));
    profiles.forEach(p => {
      if (p && p.clan && p.clan.tag) existing.delete(p.tag);
    });
  }

  const initialIds = new Set(existing.keys());
  let activePoolCount = existing.size;

  // 3. Dynamic Safety Cap
  const target = CONFIG.HEADHUNTER.TARGET;
  const minTrophies = Math.max(4000, Math.round(activePoolCount < target ? avgTrophies * 0.75 : avgTrophies));

  // 4. Run the optimized scan
  const scanned = scanTournaments(minTrophies, existing, blacklistSet);

  // 5. Merge
  scanned.forEach(c => {
    if (existing.has(c.tag)) {
      c.foundDate = existing.get(c.tag).foundDate;
    }
    existing.set(c.tag, c);
  });

  // 6. Final Pool Scoring
  const finalPool = Array.from(existing.values())
    .sort((a, b) => b.rawScore - a.rawScore)
    .slice(0, CONFIG.HEADHUNTER.TARGET);

  const currentHighRaw = finalPool.length > 0 ? finalPool[0].rawScore : 0;
  const benchmarkScore = Math.max(discardedHighScore, currentHighRaw);
  const finalBenchmark = benchmarkScore > 0 ? benchmarkScore : 1;
  
  finalPool.forEach(p => p.perfScore = Math.round((p.rawScore / finalBenchmark) * 100));

  // 🛡️ BACKUP
  Utils.backupSheet(ss, CONFIG.SHEETS.HH);

  // 7. RENDER (Self-Cleaning logic is handled in updateAndGetBlacklist)
  renderHeadhunterView(sheet, finalPool, avgTrophies);

  try { if (typeof refreshWebPayload === 'function') refreshWebPayload(); } catch (e) {}
}

/**
 * 🚫 BLACKLIST & HISTORY MANAGER
 * UPDATED V6.2.3: 
 * - Enforces DESCENDING SCORE ORDER for Benchmarking stability.
 * - SELF-CLEANING: Removes invited rows from the spreadsheet after archiving.
 */
function updateAndGetBlacklist(sheet) {
  const PROP_KEY = 'HH_BLACKLIST';
  let rawBlacklist = Utils.Props.getChunked(PROP_KEY, {});

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const expiryDuration = (CONFIG.HEADHUNTER.BLACKLIST_DAYS || 14) * dayMs;

  const validEntries = [];

  // 🧹 1. CLEANUP EXPIRED
  for (const tag in rawBlacklist) {
    let entry = rawBlacklist[tag];
    let expiry = Number(entry.e) || 0;
    let score = Number(entry.s) || 0;
    if (expiry > now) validEntries.push({ t: tag, e: expiry, s: score });
  }

  // 📥 2. INGEST NEW & MARK FOR CLEANUP
  const rowsToDelete = [];
  if (sheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    const H = CONFIG.SCHEMA.HH;
    const startRow = CONFIG.LAYOUT.DATA_START_ROW;
    const numRows = sheet.getLastRow() - (startRow - 1);
    const data = sheet.getRange(startRow, 2, numRows, 10).getValues();

    data.forEach((row, idx) => {
      const tag = String(row[H.TAG] || '').trim();
      const invited = row[H.INVITED];
      const raw = Number(row[H.RAW_SCORE]) || 0;

      if (tag && invited === true) {
        const existing = validEntries.find(v => v.t === tag);
        if (existing) { if (raw > existing.s) existing.s = raw; } 
        else { validEntries.push({ t: tag, e: now + expiryDuration, s: raw }); }
        
        // Track absolute row index for deletion
        rowsToDelete.push(startRow + idx);
      }
    });
  }

  // ⚓ 3. SORT BY SCORE (DESCENDING)
  validEntries.sort((a, b) => b.s - a.s);

  // 🎯 4. CALCULATE BENCHMARK (Top 3)
  const topN = validEntries.slice(0, 3);
  const benchmarkHigh = topN.length > 0 ? (topN.reduce((acc, cur) => acc + cur.s, 0) / topN.length) : 0;

  // 💾 5. PERSIST COHERENT OBJECT
  const sortedBlacklist = {};
  validEntries.forEach(entry => { sortedBlacklist[entry.t] = { e: entry.e, s: entry.s }; });

  if (Object.keys(sortedBlacklist).length > 0 || Object.keys(rawBlacklist).length > 0) {
    Utils.Props.setChunked(PROP_KEY, sortedBlacklist);
  }

  // 🧹 6. EXECUTE SELF-CLEANING (Delete invited rows from sheet)
  if (rowsToDelete.length > 0) {
    console.log(`🧹 Recruitment Clean-up: Moving ${rowsToDelete.length} invited recruits to the cooling pool.`);
    // Delete in reverse order to maintain index integrity
    rowsToDelete.sort((a, b) => b - a).forEach(rowIdx => sheet.deleteRow(rowIdx));
  }

  console.log(`🚫 Blacklist: ${validEntries.length} active. Benchmark Anchor: ${Math.round(benchmarkHigh)}.`);
  return { ids: new Set(validEntries.map(e => e.t)), highScore: benchmarkHigh };
}

function loadRecruitDatabase(sheet) {
  const map = new Map();
  if (sheet.getLastRow() < CONFIG.LAYOUT.DATA_START_ROW) return map;
  const H = CONFIG.SCHEMA.HH;
  const rows = sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2, sheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1), 10).getValues();
  rows.forEach(r => {
    if (r[H.TAG]) map.set(r[H.TAG], {
      tag: r[H.TAG], invited: false, name: r[H.NAME], trophies: r[H.TROPHIES],
      donations: r[H.DONATIONS], cards: r[H.CARDS], war: r[H.WAR_WINS],
      foundDate: r[H.FOUND_DATE] ? new Date(r[H.FOUND_DATE]) : new Date(),
      rawScore: Number(r[H.RAW_SCORE]), perfScore: Number(r[H.PERF_SCORE])
    });
  });
  return map;
}

function scanTournaments(minTrophies, existingRecruits, blacklistSet) {
  console.time('ScanTournaments');
  const START_TIME = Date.now();
  const W = CONFIG.HEADHUNTER.WEIGHTS;
  const keywords = CONFIG.HEADHUNTER.KEYWORDS;
  const searchUrls = keywords.map(k => `${CONFIG.SYSTEM.API_BASE}/tournaments?name=${k}`);

  const searchResults = Utils.fetchRoyaleAPI(searchUrls);
  const uniqueTourneys = new Map();
  searchResults.forEach(res => { if (res && res.items) res.items.forEach(t => uniqueTourneys.set(t.tag, t)); });

  const lotteryPool = Array.from(uniqueTourneys.values()).sort((a, b) => (b.capacity || 0) - (a.capacity || 0)).slice(0, 800); 
  Utils.shuffleArray(lotteryPool);
  const tourneyTags = lotteryPool.slice(0, 150).map(t => t.tag);

  if (tourneyTags.length === 0) return [];

  const details = Utils.fetchRoyaleAPI(tourneyTags.map(t => `${CONFIG.SYSTEM.API_BASE}/tournaments/${encodeURIComponent(t)}`));
  const candidates = []; 

  details.forEach(d => {
    if (d && d.membersList && d.membersList.length >= 10) {
      d.membersList.forEach(p => {
        if ((!p.clan || p.clan.tag === '') && (!blacklistSet || !blacklistSet.has(p.tag))) candidates.push(p);
      });
    }
  });

  const uniqueCandidates = new Map();
  candidates.forEach(c => { if (c.trophies >= minTrophies || c.trophies === undefined) uniqueCandidates.set(c.tag, c); });
  
  const candidatePool = Array.from(uniqueCandidates.values()).sort((a, b) => (b.trophies || 0) - (a.trophies || 0)).slice(0, 200);
  Utils.shuffleArray(candidatePool);
  const tagsToFetch = candidatePool.slice(0, 100).map(p => p.tag);

  if (tagsToFetch.length === 0) return [];
  const playersData = Utils.fetchRoyaleAPI(tagsToFetch.map(t => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`));

  const validCandidates = [];
  const playersNeedingWarLogsIndices = [];

  playersData.forEach((p, idx) => {
    if (p && p.trophies >= minTrophies) {
      validCandidates.push(p);
      playersNeedingWarLogsIndices.push(idx);
    }
  });

  if (validCandidates.length > 0) {
    const logUrls = validCandidates.map(p => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(p.tag)}/battlelog`);
    const logs = Utils.fetchRoyaleAPI(logUrls);

    validCandidates.forEach((p, idx) => {
      let warBonus = 0;
      if (logs[idx]) {
        const hasWar = logs[idx].some(b => b.type === 'riverRacePvP' || b.type === 'boatBattle' || b.type === 'riverRaceDuel');
        if (hasWar) warBonus = 500;
      }
      let totalWarScore = (p.warDayWins || 0) + warBonus;
      if (existingRecruits?.has(p.tag)) totalWarScore = Math.max(totalWarScore, existingRecruits.get(p.tag).war || 0);
      const rawScore = Math.round((p.trophies * W.TROPHY) + (p.totalDonations * W.DON) + (totalWarScore * W.WAR));
      p._computed = { tag: p.tag, name: p.name, trophies: p.trophies, donations: p.totalDonations, cards: p.challengeCardsWon, war: totalWarScore, foundDate: new Date(), invited: false, rawScore: rawScore };
    });
  }

  console.timeEnd('ScanTournaments');
  return validCandidates.map(p => p._computed).filter(Boolean);
}

function renderHeadhunterView(sheet, list, baseline) {
  sheet.clear();
  const HEADERS = ['Tag', 'Invited', 'Name', 'Trophies', 'Donations', 'Cards Won', 'War Wins', 'Found', 'Raw Score', 'Performance Score'];
  const rows = list.map(c => [c.tag, c.invited, `=HYPERLINK("clashroyale://playerInfo?id=${c.tag.replace('#', '')}", "${c.name}")`, c.trophies, c.donations, c.cards, c.war, new Date(c.foundDate), c.rawScore, c.perfScore]);
  sheet.getRange(2, 2, 1, HEADERS.length).setValues([HEADERS]).setFontWeight('bold').setWrap(true);
  if (rows.length > 0) {
    const dataRange = sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2, rows.length, rows[0].length);
    dataRange.setValues(rows);
    sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2 + CONFIG.SCHEMA.HH.INVITED, rows.length, 1).insertCheckboxes();
    sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2 + CONFIG.SCHEMA.HH.PERF_SCORE, rows.length, 1).setNumberFormat('0"%"');
    sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2 + CONFIG.SCHEMA.HH.FOUND_DATE, rows.length, 1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
    const rule = SpreadsheetApp.newConditionalFormatRule().setGradientMinpointWithValue('#ffffff', SpreadsheetApp.InterpolationType.NUMBER, "0").setGradientMidpointWithValue('#fff2cc', SpreadsheetApp.InterpolationType.NUMBER, "50").setGradientMaxpointWithValue('#6aa84f', SpreadsheetApp.InterpolationType.NUMBER, "100").setRanges([sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 2 + CONFIG.SCHEMA.HH.PERF_SCORE, rows.length, 1)]).build();
    sheet.setConditionalFormatRules([rule]);
  }
  sheet.getRange('B1').setValue(`HEADHUNTER • ${new Date().toLocaleString()}`);
  Utils.applyStandardLayout(sheet, Math.max(rows.length, CONFIG.HEADHUNTER.TARGET), HEADERS.length, HEADERS);
}

