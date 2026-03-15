import { CONFIG } from './Configuration';
import Registry from './Registry';
import { ClanMemberSnapshot, DatabaseUpdateResult } from './Database_Types';
import DatabaseView from './Database_View';
import * as v from 'valibot';
import { ClanMemberSnapshotSchema } from './Validation';

declare var Sheets: any;
declare var Utilities: any;
declare var SpreadsheetApp: any;

/**
 * MODULE: DATABASE STORE
 * ----------------------------------------------------------------------------
 * DESCRIPTION: Persistence handling for the Clan Database.
 *    Manages fetching, parsing, pruning, and upserting records.
 * ============================================================================
 */
const VER_DATABASE_STORE = "13.1.1";

const DatabaseStore = {
  
  /**
   * Prunes rows for players who are NOT currently in the clan AND
   * whose most recent entry in the DB is older than CONFIG.SYSTEM.DB_PURGE_DAYS.
   */
  pruneStaleData(sheet: any, activeTags: Set<string>): number {
    const startRow = CONFIG.LAYOUT.DATA_START_ROW;
    const ssId = sheet.getParent().getId();
    const sheetName = sheet.getName();
    const meta = Sheets.Spreadsheets.get(ssId, { ranges: [sheetName], includeGridData: false });
    const lastRow = meta.sheets[0].properties.gridProperties.rowCount;

    if (lastRow < startRow) return 0;

    const S_DB = CONFIG.SCHEMA.DB;
    const V = Registry.Services.View;

    // 1. COLUMN-SELECTIVE INGESTION (API Mode)
    const tagCol = V.getColLetter(2 + S_DB.TAG); 
    const dateCol = V.getColLetter(2 + S_DB.DATE);
    const nameCol = V.getColLetter(2 + S_DB.NAME);
    
    // We fetch only the columns we need: Tag, Date, and Name
    const ranges = [
      `'${sheetName}'!${tagCol}${startRow}:${tagCol}${lastRow}`, 
      `'${sheetName}'!${dateCol}${startRow}:${dateCol}${lastRow}`,
      `'${sheetName}'!${nameCol}${startRow}:${nameCol}${lastRow}`
    ];
    const response = Sheets.Spreadsheets.Values.batchGet(ssId, { ranges });
    
    if (!response.valueRanges || response.valueRanges.length < 3) return 0;
    
    const tagValues = response.valueRanges[0].values || [];
    const dateValues = response.valueRanges[1].values || [];
    const nameValues = response.valueRanges[2].values || [];

    // 2. Build maps of latest dates and names per tag
    const tagSeenData = new Map<string, Date>();
    const tagToName = new Map<string, string>();
    const tagsToPurge = new Set<string>();

    const sanitizeTag = (t: any) => String(t || "").trim().toUpperCase().replace(/[^A-Z0-9#]/g, '');

    for (let i = 0; i < tagValues.length; i++) {
        const tag = sanitizeTag(tagValues[i][0]);
        if (!tag) continue;

        const rawDate = dateValues[i] && dateValues[i][0];
        const dateVal = Registry.Services.Time.parseFlexibleDate(rawDate);
        const name = String(nameValues[i] && nameValues[i][0] || "Unknown").trim();

        if (!tagSeenData.has(tag) || dateVal > tagSeenData.get(tag)!) {
          tagSeenData.set(tag, dateVal);
          tagToName.set(tag, name);
        }
    }

    // 3. Identify tags to purge
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - CONFIG.SYSTEM.DB_PURGE_DAYS);

    tagSeenData.forEach((lastDate, tag) => {
      // Only purge if NOT active AND last seen date is older than cutoff
      if (!activeTags.has(tag) && lastDate < cutoff) {
        tagsToPurge.add(tag);
      }
    });

    if (tagsToPurge.size === 0) {
      console.info("Pruning: No stale members found.");
      return 0;
    }

    // 4. Calculate rows to delete
    const rowsToDelete: number[] = [];
    for (let i = 0; i < tagValues.length; i++) {
      const rowContent = tagValues[i];
      if (rowContent && rowContent[0]) {
         const t = sanitizeTag(rowContent[0]);
         if (tagsToPurge.has(t)) {
           rowsToDelete.push(startRow + i);
         }
      }
    }

    // [GUARD] CIRCUIT BREAKER
    // Ensure we don't wipe the clan due to API or logic anomalies.
    // Threshold is 10 players or > clan size.
    if (tagsToPurge.size > CONFIG.SYSTEM.DB_PRUNE_THRESHOLD) {
       // Clinical reported list: deduplicated and sorted for user review
       const uniqueReportList = Array.from(new Set(Array.from(tagsToPurge).map(tag => tagToName.get(tag) || tag))).sort();
       
       console.warn(`Pruning Aborted: Attempted to delete ${tagsToPurge.size} players. Threshold is ${CONFIG.SYSTEM.DB_PRUNE_THRESHOLD}.`);
       Registry.Services.Reporting.logReport("Pending Purge Players", uniqueReportList);
       return 0;
    }

    // 5. Write Back (Atomic Delete via Dimension)
    if (rowsToDelete.length > 0) {
      const sheetId = sheet.getSheetId();
      const deleteRequests = rowsToDelete
        .sort((a, b) => b - a)
        .map(row => V.createDeleteRequest(sheetId, row));

      if (deleteRequests.length > 0) {
          Sheets.Spreadsheets.batchUpdate({ requests: deleteRequests }, ssId);
          console.info(`Pruning: Removed ${rowsToDelete.length} stale row(s).`);
          SpreadsheetApp.flush();
          return rowsToDelete.length;
      }
    }
    return 0;
  },

  /**
   * Upserts daily performance snapshots into the database.
   */
  upsertDailySnapshots(
    sheet: any,
    activeMembers: ClanMemberSnapshot[],
    warFameMap: Map<string, number>,
    deckUsageWeeklyMap: Map<string, number>,
    deckUsageTodayMap: Map<string, number>,
    isWarDay: boolean,
  ): DatabaseUpdateResult {
    const startRow = CONFIG.LAYOUT.DATA_START_ROW;
    const S_DB = CONFIG.SCHEMA.DB;
    const today = new Date();
    const todayStr = Registry.Services.Time.formatDate(today);

    let todayValues: any[][] = [];
    const existingMap = new Map<string, number>();
    const processedTags = new Set<string>();
    const individualUpdates: Array<{range: string, values: any[][]}> = [];
    const newRowsToAppend: any[][] = [];

    const ssId = sheet.getParent().getId();
    const sheetId = sheet.getSheetId();
    const sheetName = sheet.getName();

    // 1B. Fetch LAST N rows to check for "Today"
    const lastRow = sheet.getLastRow(); 
    let maxSortNumber = 0;
    
    if (lastRow >= startRow) {
        // SCAN WINDOW: Increased to 3000 to handle existing duplication bloat
        // A 50-member clan with 24 updates/day = 1200 rows. 3000 ensures roughly 2-3 days of
        // margin to find Today's entries even if partially bloated.
        const scanSize = 3000; 
        const readStart = Math.max(startRow, lastRow - scanSize + 1);
        const headers = DatabaseView.getHeaders(); 
        
        const ranges = [
          `'${sheetName}'!A${startRow}:A${lastRow}`, // Column A for sort numbers
          `'${sheetName}'!B${readStart}:${String.fromCharCode(65 + 1 + headers.length)}${lastRow}` // Data
        ];
        const dataRes = Sheets.Spreadsheets.Values.batchGet(ssId, { ranges });
        
        const sortValues = dataRes.valueRanges?.[0].values || [];
        const scanValues = dataRes.valueRanges?.[1].values || [];

        // Find max sort number
        sortValues.forEach((sortRow: any[]) => {
          const n = parseInt(sortRow[0]);
          if (!isNaN(n) && n > maxSortNumber) maxSortNumber = n;
        });

        // Identify which rows are actually "Today" and map them by Tag
        // Reverse scan to find the LATEST entry for each tag
        for (let i = scanValues.length - 1; i >= 0; i--) {
          const scanRow = scanValues[i];
          const d = Registry.Services.Time.parseFlexibleDate(scanRow[S_DB.DATE]);
          if (d && Registry.Services.Time.formatDate(d).split(" ")[0] === todayStr.split(" ")[0]) {
            const tag = String(scanRow[S_DB.TAG]).toUpperCase().trim();
            if (!existingMap.has(tag)) {
               existingMap.set(tag, readStart + i);
               todayValues.push(scanRow);
            }
          }
        }
    }

    // 3. Process API Data
    activeMembers.forEach((activeMember) => {
      const result = v.safeParse(ClanMemberSnapshotSchema, activeMember);
      if (!result.success) return;

      const data = result.output;
      const normalizedTag = data.tag.toUpperCase().trim();
      const rawFame = warFameMap.get(data.tag) || 0;
      
      const warFame = isWarDay 
          ? Registry.Services.Scoring.toStrictValue(rawFame) 
          : "N/A";
          
      const decksWeekly = isWarDay
          ? Registry.Services.Scoring.toStrictValue(deckUsageWeeklyMap.get(data.tag) || 0)
          : "N/A";

      const decksToday = isWarDay
          ? Registry.Services.Scoring.toStrictValue(deckUsageTodayMap.get(data.tag) || 0)
          : "N/A";

      const battleCredit = isWarDay 
          ? Registry.Services.Scoring.toStrictValue(Number(rawFame) > 0 ? 1 : 0) 
          : "N/A";

      const rowData = [
        Registry.Services.Time.formatDate(today),
        data.tag,
        data.name,
        data.role,
        Registry.Services.Scoring.toStrictValue(data.trophies),
        Registry.Services.Scoring.toStrictValue(data.donations),
        Registry.Services.Scoring.toStrictValue(data.donationsReceived),
        Registry.Services.Time.formatDate(Registry.Services.Time.parseRoyaleApiDate(data.lastSeen)),
        warFame,
        decksToday,
        decksWeekly,
        battleCredit,
      ];

      if (existingMap.has(normalizedTag)) {
        const rowIdx = existingMap.get(normalizedTag)!;
        individualUpdates.push({
          range: `'${sheetName}'!B${rowIdx}`,
          values: [rowData]
        });
        processedTags.add(normalizedTag);
      } else {
        maxSortNumber++;
        newRowsToAppend.push([
          maxSortNumber, 
          ...rowData
        ]);
      }
    });

    // 4. Commit Updates
    if (individualUpdates.length > 0) {
      Sheets.Spreadsheets.Values.batchUpdate({
        valueInputOption: "USER_ENTERED",
        data: individualUpdates
      }, ssId);
      console.info(`Merge: Synchronized ${individualUpdates.length} existing record(s).`);
    }

    // 5. Commit Appends
    if (newRowsToAppend.length > 0) {
      console.log(`ETL: Appending ${newRowsToAppend.length} records.`);
      
      const nextRow = sheet.getLastRow() + 1;
      const meta = Sheets.Spreadsheets.get(ssId, { ranges: [sheetName], includeGridData: false });
      const currentGridRows = meta.sheets[0].properties.gridProperties.rowCount || 0;
      const requiredRows = nextRow + newRowsToAppend.length;

      if (requiredRows > currentGridRows) {
         Sheets.Spreadsheets.batchUpdate({
           requests: [{
             appendDimension: {
               sheetId: sheetId,
               dimension: "ROWS",
               length: Math.max(10, requiredRows - currentGridRows)
             }
           }]
         }, ssId);
      }

      Sheets.Spreadsheets.Values.update({
        values: newRowsToAppend
      }, ssId, `'${sheetName}'!A${nextRow}`, {
        valueInputOption: "USER_ENTERED"
      });
      console.info(`Append: Ingested ${newRowsToAppend.length} new record(s).`);
    }
    
    SpreadsheetApp.flush();

    // 6. AUTO-DEDUPLICATE (v13.1.1)
    // Ensure idempotency
    const dedupRes = this.deduplicateDatabase(sheet);

    return {
        updated: individualUpdates.length,
        appended: newRowsToAppend.length,
        pruned: dedupRes.pruned
    };
  },

  /**
   * DEDUPLICATION UTILITY
   * Scans the entire database and removes redundant entries for the same Tag + Day.
   */
  deduplicateDatabase(sheet: any): { pruned: number } {
    console.warn("Deduplication: Starting Clan Database sweep...");
    const startRow = CONFIG.LAYOUT.DATA_START_ROW;
    const ssId = sheet.getParent().getId();
    const sheetName = sheet.getName();
    const lastRow = sheet.getLastRow();
    
    if (lastRow < startRow) return { pruned: 0 };

    const S_DB = CONFIG.SCHEMA.DB;
    const V = Registry.Services.View;

    // Fetch Tag, Date columns
    const tagCol = V.getColLetter(2 + S_DB.TAG); 
    const dateCol = V.getColLetter(2 + S_DB.DATE);
    
    const ranges = [`'${sheetName}'!${tagCol}${startRow}:${tagCol}${lastRow}`, `'${sheetName}'!${dateCol}${startRow}:${dateCol}${lastRow}`];
    const response = Sheets.Spreadsheets.Values.batchGet(ssId, { ranges });
    
    if (!response.valueRanges || response.valueRanges.length < 2) return { pruned: 0 };
    
    const tagValues = response.valueRanges[0].values || [];
    const dateValues = response.valueRanges[1].values || [];

    const uniqueMap = new Map<string, number>(); // Key: "TAG_YYYYMMDD" -> Row Index
    const rowsToDelete: number[] = [];

    // Scan from bottom to top to keep the LATEST entry for each day
    for (let i = tagValues.length - 1; i >= 0; i--) {
      const tag = String(tagValues[i]?.[0] || "").trim().toUpperCase();
      const rawDate = dateValues[i]?.[0];
      if (!tag || !rawDate) continue;

      const dateObj = Registry.Services.Time.parseFlexibleDate(rawDate);
      
      // CRITICAL FIX: Skip rows with invalid dates to prevent wiping out data
      // If parsing fails, parseFlexibleDate now returns Epoch 0 (1970).
      if (!dateObj || dateObj.getTime() <= 0) {
        console.warn(`Deduplication: Skipping row ${startRow + i}: Invalid date format "${rawDate}"`);
        continue;
      }

      const dayKey = `${tag}_${Registry.Services.Time.formatShortDate(dateObj)}`;

      if (uniqueMap.has(dayKey)) {
        rowsToDelete.push(startRow + i);
      } else {
        uniqueMap.set(dayKey, startRow + i);
      }
    }

    if (rowsToDelete.length === 0) {
      console.info("Deduplication: No duplicates found.");
      return { pruned: 0 };
    }

    // Sort descending to avoid index shift during deletion
    const sheetId = sheet.getSheetId();
    const deleteRequests = rowsToDelete
      .sort((a, b) => b - a)
      .map(row => V.createDeleteRequest(sheetId, row));

    // Batch update in chunks of 500 to prevent API limits if massive
    const batchSize = 500;
    for (let i = 0; i < deleteRequests.length; i += batchSize) {
      const batch = deleteRequests.slice(i, i + batchSize);
      Sheets.Spreadsheets.batchUpdate({ requests: batch }, ssId);
      console.info(`Deduplication: Removed ${batch.length} row(s) (${i + batch.length}/${rowsToDelete.length}).`);
    }

    SpreadsheetApp.flush();
    return { pruned: rowsToDelete.length };
  }
};

/**
 * GLOBAL BRIDGE
 */
(function(scope: any) {
  Object.assign(scope, { DatabaseStore, VER_DATABASE_STORE });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default DatabaseStore;
