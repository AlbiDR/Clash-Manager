
/**
 * ============================================================================
 * 🔭 MODULE: RECRUITER - TypeScript Edition
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Scans for un-clanned talent via Tournaments + Battle Logs.
 * 🏷️ VERSION: 11.0.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { IView } from "./View";
import type { ISchema } from "./Schema";
import type { IStore } from "./Store";
import type { ICore } from "./Core";
import type { INetwork } from "./Network";
import type { ITime } from "./Time";
import type { IScoringSystem } from "./ScoringSystem";
import type { ScoringWeights } from "./SharedTypes";

// Global Version Constant
// @ts-ignore
const VER_RECRUITER = "11.0.0";

declare var SpreadsheetApp: any;
declare var LockService: any;
declare var PropertiesService: any;
declare var UrlFetchApp: any;
declare var CacheService: any;
declare var ContentService: any;
declare var Utilities: any;
declare var ScriptApp: any;
declare var Logger: any;
declare var module: any;

declare namespace GoogleAppsScript {
  export namespace Events {
    export type DoGet = any;
    export type DoPost = any;
    export type AppsScriptEvent = any;
    export type SheetsOnEdit = any;
  }
  export namespace Spreadsheet {
    export type Sheet = any;
    export type Spreadsheet = any;
    export type Range = any;
  }
  export namespace Content {
    export type TextOutput = any;
  }
}

// Global Declarations for GAS Environment
declare const CONFIG: AppConfig;
declare const View: IView;
declare const Schema: ISchema;
declare const Store: IStore;
declare const Core: ICore;
declare const Network: INetwork;
declare const Time: ITime;
declare const ScoringSystem: IScoringSystem;

// External module functions
declare function refreshWebPayload(): void;
declare function getWebAppData(forceRefresh: boolean): string;

interface TournamentMember {
  tag: string;
  name: string;
  trophies: number;
  clan: { tag: string; name: string; badgeId: number };
}

interface TournamentResult {
  tag: string;
  type: string;
  status: string;
  creatorTag: string;
  name: string;
  description: string;
  capacity: number;
  maxCapacity: number;
  items?: TournamentResult[];
  membersList?: TournamentMember[];
}

/**
 * 🔭 RECRUITER INTERFACES
 */
export interface Recruit {
  tag: string;
  name: string;
  trophies: number;
  donations: number;
  cards: number;
  war: number;
  foundDate: Date;
  invited: boolean;
  rawScore: number;
  potentialScore?: number;
}

export interface BlacklistEntry {
  t: string; // tag
  e: number; // expiry timestamp
  s: number; // rawScore
}

/**
 * ⚡ MAIN ENTRY: Scout Recruits
 * Orchestrates the scouting pipeline.
 */
function scoutRecruits(): void {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.SHEETS.HH);
  if (!sheet) sheet = ss.insertSheet(CONFIG.SHEETS.HH);

  // ⚡ DYNAMIC SYNC: Resolve column indices from current sheet headers first
  Schema.bootDynamicSchema();

  // 🛡️ CONFIGURATION CHECK
  if (!CONFIG.SYSTEM.CLAN_TAG) {
    console.error(
      "❌ CRITICAL: 'ClanTag' is not set. Aborting Recruiter Scan.",
    );
    sheet.getRange("B1").setValue("⚠️ Error: Missing ClanTag");
    return;
  }

  const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);

  // 1. Establish Baseline
  const baselineData = Network.fetchRoyaleAPI([
    `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
  ]);
  let avgTrophies = 4000;

  if (
    baselineData &&
    baselineData[0] &&
    baselineData[0].items &&
    baselineData[0].items.length > 0
  ) {
    avgTrophies =
      baselineData[0].items.reduce(
        (a: number, b: any) => a + (b.trophies || 0),
        0,
      ) / baselineData[0].items.length;
  }

  // 🚫 BLACKLIST & BENCHMARK UPDATE
  const { ids: blacklistSet, entries: blacklistEntries } =
    updateAndGetBlacklist(sheet);

  // 2. Load existing tracking data
  const existing = loadRecruitDatabase(sheet);

  // ⚡ OPTIMIZATION: Clanless Check for survivors
  const tagsToCheck = Array.from(existing.keys());
  if (tagsToCheck.length > 0) {
    const profiles = Network.fetchRoyaleAPI(
      tagsToCheck.map(
        (t) => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`,
      ),
    );
    let joinedCount = 0;
    profiles.forEach((p: any) => {
      if (p && p.clan && p.clan.tag) {
        existing.delete(p.tag);
        joinedCount++;
      }
    });
    if (joinedCount > 0) {
      console.log(`[Recruiter] prune: ${joinedCount} recruits caused update.`);
    }
  }

  // 3. Dynamic Safety Cap
  const target = CONFIG.HEADHUNTER.TARGET;
  const minTrophies = Math.max(
    4000,
    Math.round(existing.size < target ? avgTrophies * 0.75 : avgTrophies),
  );

  // 4. Run the optimized scan
  const scanned = scanTournaments(minTrophies, existing, blacklistSet);

  // 5. Intelligent Merge
  let newArrivals = 0;
  let updatedExisting = 0;

  scanned.forEach((c) => {
    if (existing.has(c.tag)) {
      c.foundDate = existing.get(c.tag)!.foundDate;
      updatedExisting++;
    } else {
      newArrivals++;
    }
    existing.set(c.tag, c);
  });

  // 6. Final Pool Scoring & Capping
  const lbSheet = ss.getSheetByName(CONFIG.SHEETS.LB);
  const clanEliteData: Array<{ rawScore: number; perfScore: number }> = [];
  if (lbSheet && lbSheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    const L = CONFIG.SCHEMA.LB;
    const lbData = lbSheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        1,
        lbSheet.getLastRow() - CONFIG.LAYOUT.DATA_START_ROW + 1,
        20,
      )
      .getValues();

    lbData.forEach((row: any) => {
      const perf = Number(row[L.PERF_SCORE]) || 0;
      if (perf >= 50) {
        const histStr = String(row[L.HISTORY] || "");
        const currentWk = Time.calculateWarWeekId(new Date());
        const hasRecentWar = histStr.includes(currentWk);

        const raw = ScoringSystem.calculateRecruitRawScore(
          Number(row[L.TROPHIES]) || 0,
          Number(row[L.TOTAL_DON]) || 0,
          Number(row[L.WAR_DAY_WINS]) || 0,
          hasRecentWar,
          CONFIG.HEADHUNTER.WEIGHTS,
        );
        clanEliteData.push({ rawScore: raw, perfScore: perf });
      }
    });
  }

  const finalBenchmark = ScoringSystem.calculateHybridBenchmark(
    clanEliteData,
    blacklistEntries,
  );

  const rawPool = Array.from(existing.values()).sort(
    (a, b) => b.rawScore - a.rawScore,
  );
  const finalPool = rawPool.slice(0, CONFIG.HEADHUNTER.TARGET);

  if (finalPool.length === 0 && rawPool.length === 0 && existing.size > 0) {
    console.error("⛔ Recruiter ABORTED: Logic Error resulted in empty pool.");
    return;
  }

  finalPool.forEach(
    (p) =>
      (p.potentialScore = ScoringSystem.calculatePotentialScore(
        p.rawScore,
        finalBenchmark,
      )),
  );

  // 🛡️ BACKUP
  View.backupSheet(ss, CONFIG.SHEETS.HH);

  // 7. RENDER
  renderHeadhunterView(sheet, finalPool, avgTrophies);

  try {
    if (typeof refreshWebPayload === "function") refreshWebPayload();
  } catch (e) {}
}

/**
 * 🚫 BLACKLIST & HISTORY MANAGER
 */
function updateAndGetBlacklist(sheet: GoogleAppsScript.Spreadsheet.Sheet): {
  ids: Set<string>;
  entries: Array<{ rawScore: number }>;
} {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const blSheet =
    ss.getSheetByName(CONFIG.SHEETS.BL) || ss.insertSheet(CONFIG.SHEETS.BL);
  const now = Date.now();
  const expiryDuration = (CONFIG.HEADHUNTER.BLACKLIST_DAYS || 30) * 86400000;

  const entryMap = new Map<string, BlacklistEntry>();

  if (blSheet.getLastRow() >= 1) {
    const rawData = blSheet.getDataRange().getValues();
    rawData.forEach((row: any) => {
      const tag = String(row[0]).trim();
      if (!tag) return;
      const expiry = Number(row[1]) || 0;
      const score = Number(row[2]) || 0;

      if (expiry > now) {
        if (entryMap.has(tag)) {
          const existing = entryMap.get(tag)!;
          existing.e = Math.max(existing.e, expiry);
          existing.s = Math.max(existing.s, score);
        } else {
          entryMap.set(tag, { t: tag, e: expiry, s: score });
        }
      }
    });
  }

  const rowsToDelete: number[] = [];
  if (sheet.getLastRow() >= CONFIG.LAYOUT.DATA_START_ROW) {
    const H = CONFIG.SCHEMA.HH;
    const startRow = CONFIG.LAYOUT.DATA_START_ROW;
    const lastRow = sheet.getLastRow();
    const numRows = lastRow - startRow + 1;

    // Correcting for absolute column indices (0-based for row access)
    const tagValues = sheet
      .getRange(startRow, H.TAG + 1, numRows, 1)
      .getValues();
    const invitedValues = sheet
      .getRange(startRow, H.INVITED + 1, numRows, 1)
      .getValues();
    const rawScoreValues = sheet
      .getRange(startRow, H.RAW_SCORE + 1, numRows, 1)
      .getValues();

    for (let i = 0; i < numRows; i++) {
      const tag = String(tagValues[i][0] || "").trim();
      const isInvited =
        invitedValues[i][0] === true ||
        String(invitedValues[i][0]).toUpperCase() === "TRUE";

      if (tag && isInvited) {
        const raw = Number(rawScoreValues[i][0]) || 0;
        if (entryMap.has(tag)) {
          const existing = entryMap.get(tag)!;
          existing.e = now + expiryDuration;
          existing.s = Math.max(existing.s, raw);
        } else {
          entryMap.set(tag, { t: tag, e: now + expiryDuration, s: raw });
        }
        rowsToDelete.push(startRow + i);
      }
    }
  }

  const validEntries = Array.from(entryMap.values());
  validEntries.sort((a, b) => b.s - a.s);

  blSheet.clear();
  if (validEntries.length > 0) {
    const output = validEntries.map((e) => [e.t, e.e, e.s]);
    blSheet.getRange(1, 1, output.length, 3).setValues(output);
  }

  if (rowsToDelete.length > 0) {
    rowsToDelete.sort((a, b) => b - a).forEach((idx) => sheet.deleteRow(idx));
    SpreadsheetApp.flush();
  }

  return {
    ids: new Set(validEntries.map((e) => e.t)),
    entries: validEntries.map((e) => ({ rawScore: e.s })),
  };
}

/**
 * Loads recruits from the spreadsheet database.
 */
function loadRecruitDatabase(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
): Map<string, Recruit> {
  if (sheet.getLastRow() < CONFIG.LAYOUT.DATA_START_ROW) return new Map();
  const H = CONFIG.SCHEMA.HH;
  const rows = sheet
    .getRange(
      CONFIG.LAYOUT.DATA_START_ROW,
      1,
      sheet.getLastRow() - (CONFIG.LAYOUT.DATA_START_ROW - 1),
      20,
    )
    .getValues();

  const recruitMap = new Map<string, Recruit>();
  rows.forEach((r: any) => {
    const tag = String(r[H.TAG]);
    if (tag) {
      recruitMap.set(tag, {
        tag,
        invited: false,
        name: String(r[H.NAME]),
        trophies: Number(r[H.TROPHIES]),
        donations: Number(r[H.DONATIONS]),
        cards: Number(r[H.CARDS]),
        war: Number(r[H.WAR_WINS]),
        foundDate:
          r[H.FOUND_DATE] instanceof Date ? r[H.FOUND_DATE] : new Date(),
        rawScore: Number(r[H.RAW_SCORE]),
        potentialScore: Number(r[H.POTENTIAL_SCORE]),
      });
    }
  });
  return recruitMap;
}

/**
 * Scans tournaments for potential candidates.
 */
function scanTournaments(
  minTrophies: number,
  existingRecruits: Map<string, Recruit>,
  blacklistSet: Set<string>,
): Recruit[] {
  const W = CONFIG.HEADHUNTER.WEIGHTS;
  const keywords = CONFIG.HEADHUNTER.KEYWORDS;
  const searchUrls = keywords.map(
    (k) => `${CONFIG.SYSTEM.API_BASE}/tournaments?name=${k}`,
  );

  const searchResults = Network.fetchRoyaleAPI(searchUrls);
  const uniqueTourneys = new Map<string, TournamentResult>();
  searchResults.forEach((res: TournamentResult) => {
    if (res && res.items)
      res.items.forEach((t) => uniqueTourneys.set(t.tag, t));
  });

  const remoteAvailable = Network.remoteWorkerHealthy();
  const remoteExpandEnabled = Store.props.get("HH_REMOTE_EXPAND", "1") === "1";
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

  Core.shuffleArray(lotteryPool);
  const tourneyTags = lotteryPool
    .slice(0, scanCfg.TOURNEYS || 300)
    .map((t) => t.tag);

  if (tourneyTags.length === 0) return [];

  let candidates: any[] = [];
  let usedRemote = false;

  if (remoteAvailable && remoteExpandEnabled) {
    try {
      candidates = Network.scanTournamentsRemote(
        tourneyTags,
        minTrophies,
        blacklistSet,
        W,
      );
      usedRemote = true;
    } catch (e) {}
  }

  if (!usedRemote) {
    const details = Network.fetchRoyaleAPI(
      tourneyTags.map(
        (t) => `${CONFIG.SYSTEM.API_BASE}/tournaments/${encodeURIComponent(t)}`,
      ),
    );

    details.forEach((d: TournamentResult) => {
      if (d && d.membersList && d.membersList.length >= 10) {
        d.membersList.forEach((p) => {
          if (
            (!p.clan || p.clan.tag === "") &&
            (!blacklistSet || !blacklistSet.has(p.tag))
          ) {
            candidates.push(p);
          }
        });
      }
    });
  }

  const uniqueCandidates = new Map<string, any>();
  candidates.forEach((c) => {
    if (c.trophies >= minTrophies || c.trophies === undefined)
      uniqueCandidates.set(c.tag, c);
  });

  const playerLimit = Math.min(
    CONFIG.HEADHUNTER.DEEP_SCAN.MAX_PLAYERS || 2000,
    scanCfg.PLAYERS || 250,
  );
  const candidatePool = Array.from(uniqueCandidates.values())
    .sort((a, b) => (b.trophies || 0) - (a.trophies || 0))
    .slice(0, playerLimit);

  Core.shuffleArray(candidatePool);
  const tagsToFetch = candidatePool.slice(0, playerLimit).map((p) => p.tag);

  if (tagsToFetch.length === 0) return [];

  const validCandidates: Recruit[] = [];

  if (
    usedRemote &&
    candidates.length > 0 &&
    candidates[0].rawScore !== undefined
  ) {
    candidates.forEach((c) => {
      validCandidates.push({
        tag: c.tag,
        name: c.name,
        trophies: c.trophies,
        donations: c.donations,
        cards: c.cards,
        war: c.war,
        foundDate: new Date(),
        invited: false,
        rawScore: c.rawScore,
        potentialScore: c.potentialScore,
      });
    });
  } else {
    const playersData = Network.fetchRoyaleAPI(
      tagsToFetch.map(
        (t) => `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(t)}`,
      ),
      remoteAvailable ? W : null,
    );

    const logUrls: string[] = [];
    const candidatesToProfile: any[] = [];

    playersData.forEach((p: any) => {
      if (p && (p.rawScore !== undefined || p.trophies >= minTrophies)) {
        if (p.rawScore !== undefined) {
          validCandidates.push({
            tag: p.tag,
            name: p.name,
            trophies: p.trophies,
            donations: p.totalDonations,
            cards: p.challengeCardsWon,
            war: p.warDayWins,
            foundDate: new Date(),
            invited: false,
            rawScore: p.rawScore,
          });
        } else {
          candidatesToProfile.push(p);
          logUrls.push(
            `${CONFIG.SYSTEM.API_BASE}/players/${encodeURIComponent(p.tag)}/battlelog`,
          );
        }
      }
    });

    if (logUrls.length > 0) {
      const logs = Network.fetchRoyaleAPI(logUrls);
      candidatesToProfile.forEach((p, idx) => {
        let hasWar = false;
        if (logs[idx]) {
          hasWar = logs[idx].some((b: any) =>
            ["riverRacePvP", "boatBattle", "riverRaceDuel"].includes(b.type),
          );
        }
        let totalWarScore = (p.warDayWins || 0) + (hasWar ? 500 : 0);
        if (existingRecruits?.has(p.tag)) {
          totalWarScore = Math.max(
            totalWarScore,
            existingRecruits.get(p.tag)!.war,
          );
        }

        const rawScore = ScoringSystem.calculateRecruitRawScore(
          p.trophies || 0,
          p.totalDonations || 0,
          p.warDayWins || 0,
          hasWar,
          W,
        );

        validCandidates.push({
          tag: p.tag,
          name: p.name,
          trophies: p.trophies,
          donations: p.totalDonations,
          cards: p.challengeCardsWon,
          war: totalWarScore,
          foundDate: new Date(),
          invited: false,
          rawScore: rawScore,
        });
      });
    }
  }

  return validCandidates;
}

/**
 * Renders the headhunter view in the spreadsheet.
 */
function renderHeadhunterView(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  list: Recruit[],
  baseline: number,
): void {
  sheet.clear();

  const CANONICAL_KEYS: Array<keyof typeof CONFIG.SCHEMA.HH> = [
    "TAG",
    "INVITED",
    "NAME",
    "TROPHIES",
    "DONATIONS",
    "CARDS",
    "WAR_WINS",
    "FOUND_DATE",
    "RAW_SCORE",
    "POTENTIAL_SCORE",
  ];

  CANONICAL_KEYS.forEach((key, index) => {
    CONFIG.SCHEMA.HH[key] = index + 1;
  });

  const HEADERS = CANONICAL_KEYS.map(
    (key) =>
      CONFIG.SCHEMA.HH_HEADERS[key as keyof typeof CONFIG.SCHEMA.HH_HEADERS],
  );

  const rows = list.map((c) => [
    c.tag,
    c.invited,
    `=HYPERLINK("clashroyale://playerInfo?id=${c.tag.replace("#", "")}", "${c.name}")`,
    c.trophies,
    c.donations,
    c.cards,
    c.war,
    c.foundDate,
    c.rawScore,
    c.potentialScore,
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
        1 + CONFIG.SCHEMA.HH.INVITED,
        rows.length,
        1,
      )
      .insertCheckboxes();
    sheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        1 + CONFIG.SCHEMA.HH.POTENTIAL_SCORE,
        rows.length,
        1,
      )
      .setNumberFormat('0"%"');
    sheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        1 + CONFIG.SCHEMA.HH.RAW_SCORE,
        rows.length,
        1,
      )
      .setNumberFormat("@");
    sheet
      .getRange(
        CONFIG.LAYOUT.DATA_START_ROW,
        1 + CONFIG.SCHEMA.HH.FOUND_DATE,
        rows.length,
        1,
      )
      .setNumberFormat("yyyy-mm-dd HH:mm:ss");

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
          1 + CONFIG.SCHEMA.HH.POTENTIAL_SCORE,
          rows.length,
          1,
        ),
      ])
      .build();
    sheet.setConditionalFormatRules([rule]);
  }

  sheet.getRange("B1").setValue(`HEADHUNTER • ${new Date().toLocaleString()}`);
  View.applyStandardLayout(
    sheet,
    Math.max(rows.length, CONFIG.HEADHUNTER.TARGET),
    HEADERS.length,
    HEADERS,
  );
  
  // 🎨 CONDITIONAL FORMATTING
  applyHeadhunterFormatting(sheet, rows.length);

  console.log(`✅ Headhunter View Rendered: ${rows.length} candidates.`);
}

function applyHeadhunterFormatting(sheet: GoogleAppsScript.Spreadsheet.Sheet, numRows: number): void {
    if (numRows === 0) return;
    const rules = sheet.getConditionalFormatRules();
    
    // Highlight High Potential > 80 (Column 11 / K)
    // Note: Column match depends on schema. Hardcoded to K (11) for simplicity based on standard layout.
    const range = sheet.getRange(CONFIG.LAYOUT.DATA_START_ROW, 11, numRows, 1);
    
    const rule = SpreadsheetApp.newConditionalFormatRule()
        .whenNumberGreaterThan(80)
        .setBackground("#d9ead3") // Light Green
        .setBold(true)
        .setRanges([range])
        .build();
        
    rules.push(rule);
    sheet.setConditionalFormatRules(rules);
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, { scoutRecruits, VER_RECRUITER });
