import { CONFIG } from './Configuration';
import Registry from './Registry';
import { ClanMemberSnapshot, DatabaseUpdateResult } from './Database_Types';
import DatabaseView from './Database_View';
import DatabaseStore from './Database_Store';
import type { WarSnapshot } from './War_Intelligence';

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
const VER_DATABASE = "13.1.0";

export interface DatabaseContract {
    synchronizeClanSnapshot(): void;
    purgeDuplicateSnapshots(): { pruned: number };
}

const Database: DatabaseContract = {
    /**
     * MAIN ENTRY: Update Clan Database
     * Fetches latest clan data and persists snapshots.
     */
    synchronizeClanSnapshot(): void {
        const startTime = Date.now();
        console.info("DATABASE: Starting ETL Pipeline Initialization");
        
        const ss = SpreadsheetApp.getActiveSpreadsheet();
        Registry.Services.Schema.bootDynamicSchema();

        // 1. RUNTIME CONTEXT
        Registry.Services.Reporting.logReport("DATABASE RUNTIME CONTEXT", [
            `VERSION:    ${VER_DATABASE}`,
            `CLAN TARGET: ${CONFIG.SYSTEM.CLAN_TAG || "NOT_CONFIGURED"}`,
            `PURGE DAYS:  ${CONFIG.SYSTEM.DB_PURGE_DAYS} Days`,
            `THRESHOLD:   ${CONFIG.SYSTEM.DB_PRUNE_THRESHOLD} Players`,
            `MODE:        ATOMIC_UPSERT`
        ]);

        if (!CONFIG.SYSTEM.CLAN_TAG) {
            console.error("CONFIGURATION ERROR: Missing CLAN_TAG. Aborting Pipeline.");
            return;
        }

        try {
            const cleanTag = encodeURIComponent(CONFIG.SYSTEM.CLAN_TAG);

            // 2. DATA ACQUISITION
            Registry.Services.Reporting.logStep(1, 6, "Extracting Remote API Data...");
            const apiStart = Date.now();
            const urls = [
                `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/members`,
                `${CONFIG.SYSTEM.API_BASE}/clans/${cleanTag}/currentriverrace`,
            ];

            const [membersData, raceData] = Registry.Services.Network.fetchRoyaleAPI(urls);
            const apiDuration = Date.now() - apiStart;

            // CIRCUIT BREAKER: Validation
            if (!membersData || !membersData.items) {
                console.error("CIRCUIT BREAKER: API returned invalid data structure. Terminating ETL.");
                return;
            }

            const activeMembers = membersData.items as ClanMemberSnapshot[];
            if (activeMembers.length === 0) {
                console.warn("VALIDATION: Clan appears empty in API response. Aborting to prevent mass-pruning.");
                return;
            }

            // 3. WAR INTELLIGENCE PROCESSING
            Registry.Services.Reporting.logStep(2, 6, "Processing War Intelligence...");
            let isWarDay = false;
            let protocolPhase = "UNKNOWN";
            
            try {
                const warSnap = getWarSnapshot();
                protocolPhase = warSnap.protocol.phase;
                const phaseIsBattle = (protocolPhase === "ENGAGEMENT" || protocolPhase === "COLOSSEUM");
                const periodIsWar = (raceData && raceData.periodType === 'war');
                isWarDay = phaseIsBattle || periodIsWar;
            } catch (e: any) {
                console.warn("INTELLIGENCE: Protocol unreachable, using state-based detection.");
                // FALLBACK: Only trust the API if it explicitly confirms a 'war' period.
                isWarDay = !!(raceData && raceData.periodType === 'war');
            }

            // MAPPING: Tag Normalization & Fame Extraction
            const activeTags = new Set(activeMembers.map((m) => String(m.tag || "").toUpperCase().trim()));
            const warFameMap = new Map<string, number>();
            const deckUsageWeeklyMap = new Map<string, number>();
            const deckUsageTodayMap = new Map<string, number>();

            if (raceData && raceData.clan && raceData.clan.participants) {
                raceData.clan.participants.forEach((p: any) => {
                    const tag = p.tag;
                    warFameMap.set(tag, Registry.Services.Scoring.resolveWarFame(p));
                    deckUsageWeeklyMap.set(tag, Number(p.decksUsed) || 0);
                    deckUsageTodayMap.set(tag, Number(p.decksUsedToday) || 0);
                });
            }

            // REPORT: INGESTION METRICS
            Registry.Services.Reporting.logReport("DATA INGESTION METRICS", [
                `ACTIVE MEMBERS: ${activeMembers.length}`,
                `WAR PARTICIPANTS: ${warFameMap.size}`,
                `WAR STATUS:     ${isWarDay ? "ACTIVE" : "INACTIVE"}`,
                `API LATENCY:    ${apiDuration}ms`,
                `PROTOCOL:       ${protocolPhase}`
            ]);

            // 4. STORAGE PREPARATION
            let sheet = ss.getSheetByName(CONFIG.SHEETS.DB);
            if (!sheet) {
                sheet = ss.insertSheet(CONFIG.SHEETS.DB);
                Registry.Services.View.enforceGlobalTabHygiene();
            }

            Registry.Services.Reporting.logStep(3, 6, "Verifying Visual Architecture...");
            const { sheetId, currentMaxRows } = DatabaseView.ensureStructure(ss, sheet);

            Registry.Services.Reporting.logStep(4, 6, "Executing Atomic Backup...");
            Registry.Services.View.backupSheet(ss, CONFIG.SHEETS.DB);

            // 5. STORAGE OPERATIONS
            Registry.Services.Reporting.logStep(5, 6, "Pruning Stale Secondary Data...");
            const stalePruned = DatabaseStore.pruneStaleData(sheet, activeTags);

            Registry.Services.Reporting.logStep(6, 6, "Executing Snapshot Upsert...");
            const updateResult = DatabaseStore.upsertDailySnapshots(sheet, activeMembers, warFameMap, deckUsageWeeklyMap, deckUsageTodayMap, isWarDay);

            // 6. VISUAL FINALIZATION
            const finalLastRow = sheet.getLastRow();
            const dataRowCount = Math.max(0, finalLastRow - (CONFIG.LAYOUT.DATA_START_ROW - 1));
            DatabaseView.restoreVisuals(sheet, sheetId, dataRowCount);

            // FINAL REPORT
            const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
            Registry.Services.Reporting.logReport("DATABASE SYNC COMPLETE", [
                `STATUS:     SUCCESS`,
                `MERGED:     ${updateResult.updated} Members`,
                `APPENDED:   ${updateResult.appended} Members`,
                `PRUNED:     ${stalePruned + updateResult.pruned} Rows`,
                `TOTAL ROWS: ${finalLastRow}`,
                `RUNTIME:    ${totalDuration}s`,
                `─`,
                `HEALTH:     Integrity Verified.`
            ]);

        } catch(e: any) {
            console.error(`PIPELINE FAILURE: ${e.message} \n${e.stack}`);
            Registry.Services.Reporting.logReport("DATABASE CRITICAL FAILURE", [
                `ERROR: ${e.message}`,
                `STATE: UNSTABLE`,
                `ACTION: CHECK LOGS`
            ]);
        }
    },

    /**
     * DEDUPLICATION: Removes redundant entries for the same Tag + Day.
     */
    purgeDuplicateSnapshots(): { pruned: number } {
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
    Database.synchronizeClanSnapshot();
}

// @ts-ignore
if (typeof module !== "undefined" && module.exports) {
  module.exports = Database;
}

(function(scope: any) {
  Object.assign(scope, { Database, updateClanDatabase, VER_DATABASE });
})(typeof globalThis !== 'undefined' ? globalThis : (typeof global !== 'undefined' ? global : this));

export default Database;
