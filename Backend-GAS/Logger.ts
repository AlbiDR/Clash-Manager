
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
import type { IRegistry } from "./Registry";
import type { WarSnapshot } from "./Service_WarIntelligence";

// Global Version Constant
// @ts-ignore
const VER_LOGGER = "12.0.0";

declare var SpreadsheetApp: any;
declare var Sheets: any; // Advanced Sheets API
declare var LockService: any;
declare var PropertiesService: any;
declare var UrlFetchApp: any;
declare var SpreadsheetApp: any;
declare var Sheets: any;
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
declare const Registry: IRegistry;
declare function getWarSnapshot(): WarSnapshot;
declare function refreshWebPayload(): void;

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

    const [membersData, raceData] = Registry.Services.Network.fetchRoyaleAPI(urls);

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
        warFameMap.set(p.tag, Registry.Services.ScoringSystem.resolveWarFame(p));
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
    // 🛡️ SCHEMA & GRID MANAGEMENT (Advanced API Way)
    const ssId = ss.getId();
    const sheetMetadata = Sheets.Spreadsheets!.get(ssId, {
      ranges: [CONFIG.SHEETS.DB],
      includeGridData: false
    });
    const dbSheetMeta = sheetMetadata.sheets.find((s: any) => s.properties.title === CONFIG.SHEETS.DB);
    const sheetId = dbSheetMeta.properties.sheetId;
    const gridProps = dbSheetMeta.properties.gridProperties;
    const currentMaxRows = gridProps.rowCount;
    const currentMaxCols = gridProps.columnCount;
    const requiredCols = HEADER.length + 2;

    // Header Check & Initialization
    if (currentMaxRows < 2) {
       // Atomic write of headers if sheet is empty
       Sheets.Spreadsheets!.Values!.update({
         values: [HEADER]
       }, ssId, `'${CONFIG.SHEETS.DB}'!B2`, {
         valueInputOption: "USER_ENTERED"
       });
    }

    if (currentMaxCols < requiredCols) {
      Sheets.Spreadsheets!.batchUpdate({
        requests: [{
          appendDimension: {
            sheetId: sheetId,
            dimension: "COLUMNS",
            length: requiredCols - currentMaxCols
          }
        }]
      }, ssId);
    }

    // 🛡️ BACKUP
    Registry.Services.View.backupSheet(ss, CONFIG.SHEETS.DB);

    // 🏗️ LAYOUT PREPARATION (Run FIRST to establish canvas)
    Registry.Services.View.applyStandardLayout(
      sheet,
      -1, // Signal to use metadata
      HEADER.length,
      HEADER,
    );

    // 🧹 STEP 1: PRUNE STALE DATA
    pruneStaleData(sheet, activeTags);

    // 📥 STEP 2: SMART MERGE TODAY'S DATA
    upsertDailySnapshots(sheet, activeMembers, warFameMap, HEADER, isWarDay);

    SpreadsheetApp.flush();
    refreshWebPayload(); // ⚡ PUSH TO WEBAPP

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
  const ssId = sheet.getParent().getId();
  const sheetName = sheet.getName();
  const meta = Sheets.Spreadsheets!.get(ssId, { ranges: [sheetName], includeGridData: false });
  const lastRow = meta.sheets[0].properties.gridProperties.rowCount;

  if (lastRow < startRow) return;

  const S_DB = CONFIG.SCHEMA.DB;

  // 1. COLUMN-SELECTIVE INGESTION (API Mode)
  const tagCol = String.fromCharCode(65 + 1 + S_DB.TAG); // Column B is index 0 for range but here we adjust
  const dateCol = String.fromCharCode(65 + 1 + S_DB.DATE);
  
  // We fetch only the columns we need: Tag and Date
  const ranges = [`'${sheetName}'!${tagCol}${startRow}:${tagCol}${lastRow}`, `'${sheetName}'!${dateCol}${startRow}:${dateCol}${lastRow}`];
  const response = Sheets.Spreadsheets!.Values!.batchGet(ssId, { ranges });
  
  if (!response.valueRanges || response.valueRanges.length < 2) return;
  
  const tagValues = response.valueRanges[0].values || [];
  const dateValues = response.valueRanges[1].values || [];

  // 2. Build maps of latest dates per tag
  const tagSeenData = new Map<string, Date>();
  const tagsToPurge = new Set<string>();

  for (let i = 0; i < tagValues.length; i++) {
    const tag = String(tagValues[i][0] || "");
    const dateVal = dateValues[i] && dateValues[i][0] ? new Date(dateValues[i][0]) : new Date(0);
    
    if (!tagSeenData.has(tag) || dateVal > tagSeenData.get(tag)!) {
      tagSeenData.set(tag, dateVal);
    }
  }

  // 3. Identify tags to purge
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CONFIG.SYSTEM.DB_PURGE_DAYS);

  tagSeenData.forEach((lastDate, tag) => {
    if (!activeTags.has(tag) && lastDate < cutoff) {
      tagsToPurge.add(tag);
    }
  });

  if (tagsToPurge.size === 0) {
    console.log("🧹 Pruning: No stale members found.");
    return;
  }

  // 4. Calculate rows to delete
  const rowsToDelete: number[] = [];
  for (let i = 0; i < tagValues.length; i++) {
    const rowContent = tagValues[i];
    if (rowContent && rowContent[0] && tagsToPurge.has(String(rowContent[0]))) {
      rowsToDelete.push(startRow + i);
    }
  }

  // 5. Write Back (Atomic Delete via Dimension)
  if (rowsToDelete.length > 0) {
    console.log(`🧹 Pruning: Removing ${tagsToPurge.size} old members.`);

    const sheetId = sheet.getSheetId();
    const deleteRequests = rowsToDelete
      .sort((a, b) => b - a)
      .map(row => ({
        deleteDimension: {
          range: {
            sheetId: sheetId,
            dimension: "ROWS",
            startIndex: row - 1,
            endIndex: row
          }
        }
      }));

    if (deleteRequests.length > 0) {
        Sheets.Spreadsheets!.batchUpdate({ requests: deleteRequests }, ssId);
        console.log(`🧹 Pruning Complete: Removed ${rowsToDelete.length} rows via Sheets API.`);
    }
  }
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
  const todayStr = Registry.Services.Time.formatDate(today);

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

  let todayValues: any[][] = [];
  let firstRowIndex = -1;

  // 1. Sort & Locate "Today's" Block (Advanced API way)
  const ssId = sheet.getParent().getId();
  const sheetId = sheet.getSheetId();
  const sheetName = sheet.getName();
  let meta = Sheets.Spreadsheets!.get(ssId, { ranges: [sheetName], includeGridData: false });
  let rowCount = meta.sheets[0].properties.gridProperties.rowCount;

  if (rowCount >= startRow) {
      // Atomic Sort
      Sheets.Spreadsheets!.batchUpdate({
        requests: [{
          sortRange: {
            range: { sheetId, startRowIndex: startRow - 1, endRowIndex: rowCount, startColumnIndex: 1, endColumnIndex: 1 + headerRow.length },
            sortSpecs: [{ dimensionIndex: 1 + S_DB.DATE, sortOrder: "ASCENDING" }]
          }
        }]
      }, ssId);

      // Fetch Dates to find Today's block
      const dateRange = `'${sheetName}'!${String.fromCharCode(65 + 1 + S_DB.DATE)}${startRow}:${String.fromCharCode(65 + 1 + S_DB.DATE)}${rowCount}`;
      const dateRes = Sheets.Spreadsheets!.Values!.get(ssId, dateRange);
      const dateValues = dateRes.values || [];

      let startIdx = -1;
      let count = 0;

      for (let i = 0; i < dateValues.length; i++) {
        const d = dateValues[i][0] ? new Date(dateValues[i][0]) : null;
        if (d && Registry.Services.Time.formatDate(d) === todayStr) {
          if (startIdx === -1) startIdx = i;
          count++;
        }
      }

      if (startIdx !== -1) {
        firstRowIndex = startRow + startIdx;
        const dataRange = `'${sheetName}'!B${firstRowIndex}:${String.fromCharCode(65 + 1 + headerRow.length)}${firstRowIndex + count - 1}`;
        const dataRes = Sheets.Spreadsheets!.Values!.get(ssId, dataRange);
        todayValues = dataRes.values || [];
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
  if (updatesMade && firstRowIndex !== -1) {
    console.log(`ETL: Updating ${processedTags.size} records for ${todayStr}.`);
    
    Sheets.Spreadsheets!.Values!.update({
      values: todayValues
    }, ssId, `'${sheetName}'!B${firstRowIndex}`, {
      valueInputOption: "USER_ENTERED"
    });
  }

  // 5. Commit Appends
  if (newRowsToAppend.length > 0) {
    console.log(`ETL: Appending ${newRowsToAppend.length} records for ${todayStr} (Fast-Append).`);

    const appendRes = Sheets.Spreadsheets!.Values!.append({
      values: newRowsToAppend
    }, ssId, `'${sheetName}'!B${startRow}`, {
      valueInputOption: "USER_ENTERED"
    });

    // 🏎️ ATOMIC UI: Highlight new entries using the ACTUAL range returned by the API
    const updatedRange = appendRes.updates.updatedRange; // e.g., 'Clan Database'!B3153:K3194
    const rowMatch = updatedRange.match(/!.*?(\d+):.*?(\d+)$/);
    
    if (rowMatch) {
      const startRowIdx = parseInt(rowMatch[1]) - 1; // Zero-based
      const endRowIdx = parseInt(rowMatch[2]); // Exclusive
      
      const requests = [
          {
            repeatCell: {
              range: { sheetId, startRowIndex: startRowIdx, endRowIndex: endRowIdx, startColumnIndex: 1, endColumnIndex: 1 + headerRow.length },
              cell: { userEnteredFormat: { backgroundColor: { red: 0.933, green: 0.988, blue: 0.921 } } },
              fields: "userEnteredFormat.backgroundColor"
            }
          },
          {
            repeatCell: {
              range: { sheetId, startRowIndex: startRowIdx, endRowIndex: endRowIdx, startColumnIndex: 1, endColumnIndex: 2 },
              cell: { userEnteredFormat: { textFormat: { foregroundColor: { red: 0.18, green: 0.49, blue: 0.18 } } } },
              fields: "userEnteredFormat.textFormat.foregroundColor"
            }
          }
      ];
      Sheets.Spreadsheets!.batchUpdate({ requests }, ssId);
    }
  }

  // ----------------------------------------------------------------------------
  // 6. TOTAL ATOMIC VISUAL RESTORATION (Consolidated)
  // ----------------------------------------------------------------------------
  meta = Sheets.Spreadsheets!.get(ssId, { ranges: [sheetName], includeGridData: false });
  const currentLastRow = meta.sheets[0].properties.gridProperties.rowCount;
  const dataRowCount = Math.max(0, currentLastRow - (startRow - 1));
  const contentCols = headerRow.length;

  const finalVisualRequests: any[] = [
    // 6A. HEADERS DELIVERY (Row 2 Style & Value Sync)
    {
      updateCells: {
        rows: [{
          values: headerRow.map(h => ({
            userEnteredValue: { stringValue: h },
            userEnteredFormat: { 
                textFormat: { bold: true }, 
                wrapStrategy: "WRAP", 
                horizontalAlignment: "CENTER", 
                backgroundColor: { red: 0.95, green: 0.95, blue: 0.95 } 
            }
          }))
        }],
        fields: 'userEnteredValue,userEnteredFormat(textFormat.bold,wrapStrategy,horizontalAlignment,backgroundColor)',
        range: { sheetId, startRowIndex: 1, endRowIndex: 2, startColumnIndex: 1, endColumnIndex: 1 + contentCols }
      }
    }
  ];

  if (dataRowCount > 0) {
      // 6B. NUMBER FORMATS (Date & Clean Strings)
      finalVisualRequests.push(
        {
          repeatCell: {
            range: { sheetId, startRowIndex: startRow - 1, endRowIndex: currentLastRow, startColumnIndex: 1 + S_DB.DATE, endColumnIndex: 2 + S_DB.DATE },
            cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "ddd dd/mm/yyyy" } } },
            fields: "userEnteredFormat.numberFormat"
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: startRow - 1, endRowIndex: currentLastRow, startColumnIndex: 1 + S_DB.TAG, endColumnIndex: 4 + S_DB.TAG },
            cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
            fields: "userEnteredFormat.numberFormat"
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: startRow - 1, endRowIndex: currentLastRow, startColumnIndex: 1 + S_DB.LAST_SEEN, endColumnIndex: 2 + S_DB.LAST_SEEN },
            cell: { userEnteredFormat: { numberFormat: { type: "DATE_TIME", pattern: "dd/mm/yyyy HH:mm" } } },
            fields: "userEnteredFormat.numberFormat"
          }
        },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: startRow - 1, endRowIndex: currentLastRow, startColumnIndex: 1 + S_DB.WAR_FAME, endColumnIndex: 2 + S_DB.WAR_FAME },
            cell: { userEnteredFormat: { numberFormat: { type: "TEXT" } } },
            fields: "userEnteredFormat.numberFormat"
          }
        }
      );
  }

  // 6C. INJECT STANDARD LAYOUT (Borders, Alignment, Status Bar, Auto-Resize)
  finalVisualRequests.push(...Registry.Services.View.getStandardVisualRequests(sheetId, dataRowCount, contentCols));

  // 🚀 EXECUTE UNBREAKABLE TRANSACTION
  Sheets.Spreadsheets!.batchUpdate({ requests: finalVisualRequests }, ssId);

  Registry.Services.View.setStatusMessage(sheet, `DATABASE • ${new Date().toLocaleString()}`);
  console.log(`✅ Database View Rendered: ${dataRowCount} entries (Atomic).`);
}

/**
 * 🌍 GLOBAL BRIDGE
 */
Object.assign(this as any, { updateClanDatabase, VER_LOGGER });
