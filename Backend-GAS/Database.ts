import { CONFIG } from './Configuration';
import Registry from './Registry';
import { ClanMemberSnapshot, DatabaseUpdateResult } from './Database_Types';
import DatabaseView from './Database_View';
import DatabaseStore from './Database_Store';
import type { WarSnapshot } from './Service_WarIntelligence';

declare var SpreadsheetApp: any;
declare function getWarSnapshot(): WarSnapshot;
declare var module: any;

/**
 * MODULE: DATABASE (Orchestrator)
 * ----------------------------------------------------------------------------
 * DESCRIPTION: The Director of the Clan Database.
 *    Orchestrates: Network -> Store -> View.
 *    Replaces the legacy 'Logger.ts'.
 * ============================================================================
 */
const VER_DATABASE = "13.0.0";

export interface IDatabase {
    update(): void;
    deduplicate(): { pruned: number };
}

const Database: IDatabase = {
    /**
     * MAIN ENTRY: Update Clan Database
     * Fetches latest clan data and persists snapshots.
     */
    update(): void {
        console.info("Starting Clan Database ETL pipeline...");
        const ss = SpreadsheetApp.getActiveSpreadsheet();

        // SCHEMA SYNC: Ensure we find the right columns if they were moved
        Registry.Services.Schema.bootDynamicSchema();

        // CONFIGURATION CHECK
        if (!CONFIG.SYSTEM.CLAN_TAG) {
            console.error("Configuration Error: CLAN_TAG is not configured. Aborting Database Update.");
            const sheet = ss.getSheetByName(CONFIG.SHEETS.DB);
            if (sheet) sheet.getRange("B1").setValue("Configuration Error: Missing CLAN_TAG");
            return;
        }

        try {
            const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);

            // Fetch Members and War Race data
            Registry.Services.Reporting.logStep(1, 6, "Extracting Live API data (Members, Race)..."); // Updated step count to 6
            const urls = [
                `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
                `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/currentriverrace`,
            ];

            const [membersData, raceData] = Registry.Services.Network.fetchRoyaleAPI(urls);

            // 🛑 CIRCUIT BREAKER: API FAILURE
            if (!membersData || !membersData.items || membersData.items.length === 0) {
                console.error("Critical: API returned invalid/empty data. Aborting ETL to prevent data corruption.");
                return;
            }

            // WAR INTELLIGENCE CHECK
            let isWarDay = false;
            try {
                const warSnap = getWarSnapshot();
                // REFINEMENT: Combine Protocol Phase with Royale API Period Type for maximum precision
                const phaseIsBattle = (warSnap.protocol.phase === "ENGAGEMENT" || warSnap.protocol.phase === "COLOSSEUM");
                const periodIsWar = (raceData && raceData.periodType === 'war');
                
                // If API says it's war, or protocol says we are in battle phase
                isWarDay = phaseIsBattle || periodIsWar;
                
                console.info(`  War Phase: ${warSnap.protocol.phase} | Period: ${raceData?.periodType || 'N/A'}`);
                console.info(`  Logging Fame: ${isWarDay ? "NUMERIC" : "N/A"}`);
            } catch (e: any) {
                console.warn("War Intelligence: Could not fetch data. Defaulting to state-based detection.");
                isWarDay = !!(raceData && raceData.clan); // Simple fallback
            }

            const activeMembers = membersData.items as ClanMemberSnapshot[];
    
            // NORMALIZE: Ensure tags are uppercase for robust set matching
            const activeTags = new Set(activeMembers.map((m) => String(m.tag || "").toUpperCase().trim()));

            // MAP WAR FAME: Tag -> Fame
            const warFameMap = new Map<string, number>();
            if (raceData && raceData.clan && raceData.clan.participants) {
                raceData.clan.participants.forEach((p: any) => {
                    warFameMap.set(p.tag, Registry.Services.Scoring.resolveWarFame(p));
                });
                console.info(`  API: Collected ${warFameMap.size} unique participant record${warFameMap.size !== 1 ? 's' : ''}.`);
            }

            let sheet = ss.getSheetByName(CONFIG.SHEETS.DB);
            if (!sheet) sheet = ss.insertSheet(CONFIG.SHEETS.DB);

            // 1. VIEW: Ensure Structure
            Registry.Services.Reporting.logStep(2, 6, "Verifying Sheet Structure...");
            const { sheetId, currentMaxRows } = DatabaseView.ensureStructure(ss, sheet);

            // BACKUP
            Registry.Services.View.backupSheet(ss, CONFIG.SHEETS.DB);

            // 2. VIEW: Layout Prep
            Registry.Services.Reporting.logStep(3, 6, "Restoring Standard Layout...");
            const preservedRows = Math.max(100, currentMaxRows - CONFIG.LAYOUT.DATA_START_ROW);
            Registry.Services.View.applyStandardLayout(
                sheet,
                preservedRows, 
                DatabaseView.getHeaders().length,
                DatabaseView.getHeaders(),
            );

            // 3. STORE: Prune Stale Data
            Registry.Services.Reporting.logStep(4, 6, "Pruning stale historical data...");
            DatabaseStore.pruneStaleData(sheet, activeTags);

            // 4. STORE: Upsert Daily Snapshots
            Registry.Services.Reporting.logStep(5, 6, "Performing Smart-Merge on daily snapshots...");
            const updateResult = DatabaseStore.upsertDailySnapshots(sheet, activeMembers, warFameMap, isWarDay);

            // 5. VIEW: Final Visuals
            Registry.Services.Reporting.logStep(6, 6, "Finalizing Visuals...");
            // Recalculate last row after updates
            const finalLastRow = sheet.getLastRow();
            const dataRowCount = Math.max(0, finalLastRow - (CONFIG.LAYOUT.DATA_START_ROW - 1));
            
            DatabaseView.restoreVisuals(sheet, sheetId, dataRowCount);


            // Final Log
            Registry.Services.Reporting.logReport(
                `CLAN DATABASE v${VER_DATABASE} REPORT`,
                [
                    `OP TYPE:   ETL SNAPSHOT (DAILY)`,
                    `UPDATED:   ${updateResult.updated} members`,
                    `APPENDED:  ${updateResult.appended} members`,
                    `─`,
                    `HEALTH:    Atomic Transaction Complete.`
                ]
            );
            console.info(`Database ETL Cycle Finished.`);
            console.timeEnd("ETL");

        } catch(e: any) {
            console.error(`ETL Error: ${e.message} \n${e.stack}`);
        }
    },

    /**
     * DEDUPLICATION: Removes redundant entries for the same Tag + Day.
     */
    deduplicate(): { pruned: number } {
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        const sheet = ss.getSheetByName(CONFIG.SHEETS.DB);
        if (!sheet) return { pruned: 0 };
        return DatabaseStore.deduplicateDatabase(sheet);
    }
};

/**
 * GLOBAL BRIDGE (Legacy Support)
 * Preserves compatibility with existing GAS Triggers.
 */
function updateClanDatabase() {
    Database.update();
}

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Database;
}

(function(scope: any) {
  Object.assign(scope, { Database, updateClanDatabase, VER_DATABASE });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Database;
