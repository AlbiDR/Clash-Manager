
/**
 * ============================================================================
 * 📊 MODULE: LOGGER (DATABASE) - TypeScript Edition
 * ----------------------------------------------------------------------------
 * 📝 DESCRIPTION: Extracts API data and persists it to 'Clan Database'.
 * ⚙️ LOGIC:
 *    - Captures Daily Snapshots of Donations, Roles, Trophies, AND War Fame.
 *    - SMART PRUNING: Deletes historical data of players who left > 7 days ago.
 *    - SMART MERGE: Updates existing rows for Today, appends new ones.
 *    - ⚔️ WAR AWARE: Logs "N/A" for Fame during Training Days.
 * 🏷️ VERSION: 12.0.0
 * ============================================================================
 */

import type { AppConfig } from "./Configuration";
import type { IView } from "./View";
import type { INetwork } from "./Network";
import type { ITime } from "./Time";
import type { IScoringSystem } from "./ScoringSystem";
import type { WarSnapshot } from "./Service_WarIntelligence";

// Global Version Constant
// @ts-ignore
const VER_LOGGER = "12.0.0";

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
declare const Network: INetwork;
declare const Time: ITime;
declare const ScoringSystem: IScoringSystem;
declare function getWarSnapshot(): WarSnapshot;

/**
 * 📊 ETL INTERFACE
 */
export interface ClanMemberSnapshot {
  tag: string;
  name: string;
  role: string;
  trophies: number;
  donations: number;
  donationsReceived: number;
  lastSeen: string;
}

/**
 * ⚡ MAIN ENTRY: Update Clan Database
 * Fetches latest clan data and persists snapshots.
 */
function updateClanDatabase(): void {
  console.time("ETL");
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // 🛡️ CONFIGURATION CHECK
  if (!CONFIG.SYSTEM.CLAN_TAG) {
    console.error(
      "❌ CRITICAL: 'ClanTag' is not set. Aborting Database Update.",
    );
    const sheet = ss.getSheetByName(CONFIG.SHEETS.DB);
    if (sheet) sheet.getRange("B1").setValue("⚠️ Error: Missing ClanTag");
    return;
  }

  try {
    const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);

    // ⚡ Fetch Members and War Race data
    const urls = [
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
      `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/currentriverrace`,
    ];

    const [membersData, raceData] = Network.fetchRoyaleAPI(urls);

    // 🛑 CIRCUIT BREAKER: API FAILURE
    if (!membersData || !membersData.items || membersData.items.length === 0) {
      console.error("⛔ ETL ABORTED: API returned invalid data.");
      return;
    }

    // ⚔️ WAR INTELLIGENCE CHECK
    let isWarDay = false;
    try {
        const warSnap = getWarSnapshot();
        // Log "N/A" if we are in TRIAL phase (Training Days)
        // Log Numeric Fame if we are in ENGAGEMENT or COLOSSEUM (Battle Days)
        isWarDay = (warSnap.protocol.phase === "ENGAGEMENT" || warSnap.protocol.phase === "COLOSSEUM");
        Logger.log(`[ETL] War Phase: ${warSnap.protocol.phase} | Logging Fame: ${isWarDay}`);
    } catch (e) {
        console.warn("Could not fetch War Snapshot, defaulting to Numeric Logging.");
        isWarDay = true; // Fallback to safe behavior
    }

    const activeMembers = membersData.items as ClanMemberSnapshot[];
    const activeTags = new Set(activeMembers.map((m) => m.tag));

    // 🗺️ MAP WAR FAME: Tag -> Fame
    const warFameMap = new Map<string, number>();
    if (raceData && raceData.clan && raceData.clan.participants) {
      raceData.clan.participants.forEach((p: any) => {
        warFameMap.set(p.tag, ScoringSystem.resolveWarFame(p));
      });
    }

    let sheet = ss.getSheetByName(CONFIG.SHEETS.DB);
    if (!sheet) sheet = ss.insertSheet(CONFIG.SHEETS.DB);

    const HEADER = [
      "Date",
      "Tag",
      "Name",
      "Role",
      "Trophies",
      "Donations Given",
      "Donations Received",
      "Last Seen",
      "War Fame",
      "Battle Credits",
    ];

    // Ensure Header exists
    if (sheet.getLastRow() < 1) {
      sheet
        .getRange(2, 2, 1, HEADER.length)
        .setValues([HEADER])
        .setFontWeight("bold")
        .setWrap(true);
    }

    // 🛡️ SCHEMA MIGRATION: Ensure enough columns
    const requiredCols = HEADER.length + 2;
    if (sheet.getMaxColumns() < requiredCols) {
      sheet.insertColumnsAfter(
        sheet.getMaxColumns(),
        requiredCols - sheet.getMaxColumns(),
      );
    }

    // 🛡️ BACKUP
    View.backupSheet(ss, CONFIG.SHEETS.DB);

    // 🧹 STEP 1: PRUNE STALE DATA
    pruneStaleData(sheet, activeTags);

    // 📥 STEP 2: SMART MERGE TODAY'S DATA
    upsertDailySnapshots(sheet, activeMembers, warFameMap, HEADER, isWarDay);

    console.timeEnd("ETL");
  } catch (e: any) {
    console.error(`ETL Error: ${e.message} \n${e.stack}`);
  }
}

/**
 * Prunes rows for players who are NOT currently in the clan AND
 * whose most recent entry in the DB is older than CONFIG.SYSTEM.DB_PURGE_DAYS.
 */
function pruneStaleData(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  activeTags: Set<string>,
): void {
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;
  const lastRow = sheet.getLastRow();

  if (lastRow < startRow) return;

  const S_DB = CONFIG.SCHEMA.DB;
  const numCols = Object.keys(CONFIG.SCHEMA.DB).length;
  const safeCols = Math.min(numCols, sheet.getMaxColumns() - 1);
  const range = sheet.getRange(startRow, 2, lastRow - startRow + 1, safeCols);
  const data = range.getValues();

  // 1. Build maps of latest dates and names per tag
  const tagSeenData = data.reduce(
    (acc: { lastSeen: Map<string, Date>; names: Map<string, string> }, row: any) => {
      const tag = String(row[S_DB.TAG]);
      const dateVal = row[S_DB.DATE] ? new Date(row[S_DB.DATE]) : new Date(0);
      if (
        !acc.lastSeen.has(tag) ||
        dateVal > (acc.lastSeen.get(tag) || new Date(0))
      ) {
        acc.lastSeen.set(tag, dateVal);
        acc.names.set(tag, String(row[S_DB.NAME]));
      }
      return acc;
    },
    { lastSeen: new Map(), names: new Map() },
  );

  // 2. Identify tags to purge
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CONFIG.SYSTEM.DB_PURGE_DAYS);

  const tagsToPurge = new Set<string>();
  const purgedDetails: string[] = [];

  tagSeenData.lastSeen.forEach((lastDate: Date, tag: string) => {
    if (!activeTags.has(tag) && lastDate < cutoff) {
      tagsToPurge.add(tag);
      purgedDetails.push(`${tagSeenData.names.get(tag) || "Unknown"} (${tag})`);
    }
  });

  if (tagsToPurge.size === 0) {
    console.log("🧹 Pruning: No stale members found.");
    return;
  }

  // 3. Filter and count
  console.log(`🧹 Pruning: Removing ${tagsToPurge.size} old members.`);

  const cleanData = data.filter(
    (row: any) => !tagsToPurge.has(String(row[S_DB.TAG])),
  );
  const purgeCount = data.length - cleanData.length;

  // 4. Write Back (Atomic Replace)
  range.clearContent();
  if (cleanData.length > 0) {
    sheet
      .getRange(startRow, 2, cleanData.length, safeCols)
      .setValues(cleanData);
  }
  console.log(`🧹 Pruning Complete: Removed ${purgeCount} rows.`);
}

/**
 * Upserts daily performance snapshots into the database.
 */
function upsertDailySnapshots(
  sheet: GoogleAppsScript.Spreadsheet.Sheet,
  activeMembers: ClanMemberSnapshot[],
  warFameMap: Map<string, number>,
  headerRow: string[],
  isWarDay: boolean,
): void {
  const startRow = CONFIG.LAYOUT.DATA_START_ROW;
  const S_DB = CONFIG.SCHEMA.DB;
  const today = new Date();
  const todayStr = Time.formatDate(today);

  const parseTime = (t: string | undefined): Date => {
    if (!t) return new Date();
    try {
      return new Date(
        t.replace(
          /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2}).*/,
          "$1-$2-$3T$4:$5:$6Z",
        ),
      );
    } catch {
      return new Date();
    }
  };

  const lastRow = sheet.getLastRow();
  let todayDataRange: GoogleAppsScript.Spreadsheet.Range | null = null;
  let todayValues: any[][] = [];
  let firstRowIndex = -1;

  // 1. Sort & Locate "Today's" Block
  if (lastRow >= startRow) {
    sheet
      .getRange(startRow, 2, lastRow - startRow + 1, headerRow.length)
      .sort({ column: 2 + S_DB.DATE, ascending: true });

    const dateValues = sheet
      .getRange(startRow, 2 + S_DB.DATE, lastRow - startRow + 1, 1)
      .getValues();

    let startIdx = -1;
    let count = 0;

    for (let i = 0; i < dateValues.length; i++) {
      const d = dateValues[i][0] ? new Date(dateValues[i][0]) : null;
      if (d && Time.formatDate(d) === todayStr) {
        if (startIdx === -1) startIdx = i;
        count++;
      }
    }

    if (startIdx !== -1) {
      firstRowIndex = startRow + startIdx;
      todayDataRange = sheet.getRange(
        firstRowIndex,
        2,
        count,
        headerRow.length,
      );
      todayValues = todayDataRange.getValues();
    }
  }

  // 2. Prepare Updates
  const processedTags = new Set<string>();
  let updatesMade = false;

  const existingMap = new Map<string, number>();
  todayValues.forEach((row, idx) => {
    existingMap.set(String(row[S_DB.TAG]), idx);
  });

  // 3. Process API Data
  const newRowsToAppend: any[][] = [];

  activeMembers.forEach((m) => {
    let warFame: string | number = warFameMap.get(m.tag) || 0;
    let battleCredit: number | string = 0;
    
    // ⚔️ SMART LOGGING: Force "N/A" if checking during Non-War Days
    if (!isWarDay) {
        warFame = "N/A";
        battleCredit = "N/A";
    } else if (Number(warFame) > 0) {
        battleCredit = 1; // Player participated today
    }

    if (existingMap.has(m.tag)) {
      const idx = existingMap.get(m.tag)!;
      const currentRow = todayValues[idx];

      currentRow[S_DB.NAME] = m.name;
      currentRow[S_DB.ROLE] = m.role;
      currentRow[S_DB.TROPHIES] = m.trophies;
      currentRow[S_DB.DON_GIVEN] = m.donations;
      currentRow[S_DB.DON_REC] = m.donationsReceived;
      currentRow[S_DB.LAST_SEEN] = parseTime(m.lastSeen);
      currentRow[S_DB.WAR_FAME] = warFame;
      currentRow[S_DB.BATTLE_CREDITS] = battleCredit;

      updatesMade = true;
      processedTags.add(m.tag);
    } else {
      newRowsToAppend.push([
        today,
        m.tag,
        m.name,
        m.role,
        m.trophies,
        Math.max(0, m.donations || 0),
        Math.max(0, m.donationsReceived || 0),
        parseTime(m.lastSeen),
        warFame,
        battleCredit,
      ]);
    }
  });

  // 4. Commit Updates
  if (updatesMade && todayDataRange) {
    console.log(`ETL: Updating ${processedTags.size} records for ${todayStr}.`);
    todayDataRange.setValues(todayValues);
  }

  // 5. Commit Appends
  if (newRowsToAppend.length > 0) {
    console.log(
      `ETL: Appending ${newRowsToAppend.length} records for ${todayStr}.`,
    );
    const writeRow = Math.max(sheet.getLastRow() + 1, startRow);
    sheet
      .getRange(writeRow, 2, newRowsToAppend.length, headerRow.length)
      .setValues(newRowsToAppend)
      .setHorizontalAlignment("center");
  }

  sheet.getRange("B1").setValue(`DATABASE • ${new Date().toLocaleString()}`);

  // 🧹 LAYOUT & CLEANUP
  View.applyStandardLayout(
    sheet,
    sheet.getLastRow() - (startRow - 1),
    headerRow.length,
    headerRow,
  );

  const currentLastRow = sheet.getLastRow();
  const dataRowCount = currentLastRow - (startRow - 1);
  if (dataRowCount > 0) {
    const sRow = startRow;
    sheet
      .getRange(sRow, 2 + S_DB.DATE, dataRowCount, 1)
      .setNumberFormat("yyyy-mm-dd");
    sheet.getRange(sRow, 2 + S_DB.TAG, dataRowCount, 3).setNumberFormat("@");
    sheet
      .getRange(sRow, 2 + S_DB.TROPHIES, dataRowCount, 4)
      .setNumberFormat("0");
    sheet
      .getRange(sRow, 2 + S_DB.LAST_SEEN, dataRowCount, 1)
      .setNumberFormat("yyyy-mm-dd hh:mm:ss");
      
    // ⚠️ CRITICAL: Do NOT force number format on War Fame column if it contains strings
    // We leave it as Automatic (or text compatible) to support "N/A"
    sheet
      .getRange(sRow, 2 + S_DB.WAR_FAME, dataRowCount, 1)
      .setNumberFormat("@"); // Force Text/Automatic to prevent "0" coercion
  }
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, { updateClanDatabase, VER_LOGGER });
