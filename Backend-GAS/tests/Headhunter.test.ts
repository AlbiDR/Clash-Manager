
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Headhunter from '../Headhunter';
import { CONFIG } from '../Configuration';

// Mock Config
vi.mock('../Configuration', () => {
  const mockConfig = {
    SYSTEM: { CLAN_TAG: "#CLAN", API_BASE: "https://api", TIMEZONE: "UTC", DATE_FORMAT_VALUE: "YYYY", MAX_BACKUPS: 5 },
    SHEETS: { HH: "Headhunter", LB: "Leaderboard" },
    HEADHUNTER: { TARGET: 50, WEIGHTS: {} },
    SCHEMA: { 
        LB: { PERF_SCORE: 1, TROPHIES: 2, TOTAL_DON: 3, HISTORY: 4 },
        HH: {} 
    },
    LAYOUT: { DATA_START_ROW: 3 }
  };
  // @ts-ignore
  global.CONFIG = mockConfig;
  return { CONFIG: mockConfig };
});

// Mock Sub-Modules - Hoisted
const mocks = vi.hoisted(() => ({
    Strategy: { calculateTrophyFloor: vi.fn() },
    Store: { updateAndGetBlacklist: vi.fn(), loadDatabase: vi.fn() },
    Scanner: { scanTournaments: vi.fn() },
    View: { render: vi.fn() },
    Registry: {
        Services: {
            Network: { fetchRoyaleAPI: vi.fn(), getRemainingQuota: vi.fn() },
            View: { setStatusMessage: vi.fn(), backupSheet: vi.fn() },
            Core: { logStep: vi.fn(), logReport: vi.fn() },
            Schema: { bootDynamicSchema: vi.fn() },
            Scoring: { 
                calculateHybridBenchmark: vi.fn(), 
                calculatePotentialScore: vi.fn(),
                calculateRecruitRawScore: vi.fn()
            },
            Time: { calculateWarWeekId: vi.fn() }
        }
    }
}));

vi.mock('../Headhunter_Strategy', () => ({ default: mocks.Strategy }));
vi.mock('../Headhunter_Store', () => ({ default: mocks.Store }));
vi.mock('../Headhunter_Scanner', () => ({ default: mocks.Scanner }));
vi.mock('../Headhunter_View', () => ({ default: mocks.View }));
vi.mock('../Registry', () => ({ default: mocks.Registry }));

// Mock Globals
global.SpreadsheetApp = {
    getActiveSpreadsheet: vi.fn(),
    flush: vi.fn(),
    insertSheet: vi.fn()
};
global.Sheets = {
    Spreadsheets: {
        Values: { batchGet: vi.fn() }
    }
};
global.refreshWebPayload = vi.fn();

describe('Headhunter Orchestrator', () => {
    let mockSS: any;
    let mockSheet: any;

    beforeEach(() => {
        vi.restoreAllMocks();
        // @ts-ignore
        global.CONFIG = CONFIG;
        
        mockSheet = { 
            getRange: vi.fn().mockReturnThis(), 
            setValue: vi.fn(),
            getName: vi.fn().mockReturnValue("Headhunter"),
            getLastRow: vi.fn().mockReturnValue(10), // For Benchmark Fetch
            getParent: vi.fn().mockReturnValue({ getId: vi.fn() })
        };
        mockSS = {
            getSheetByName: vi.fn().mockReturnValue(mockSheet),
            insertSheet: vi.fn().mockReturnValue(mockSheet),
            getId: vi.fn(),
        };
        global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(mockSS);

        // Default Mock Returns
        mocks.Registry.Services.Network.fetchRoyaleAPI.mockReturnValue([
            { requiredTrophies: 3000, memberList: [] } // Clan Details
        ]);
        mocks.Registry.Services.Network.getRemainingQuota.mockReturnValue(5000);
        
        mocks.Strategy.calculateTrophyFloor.mockReturnValue({ floor: 3000, method: "Base" });
        mocks.Store.updateAndGetBlacklist.mockReturnValue({ ids: new Set(), entries: [] });
        mocks.Store.loadDatabase.mockReturnValue(new Map());
        mocks.Scanner.scanTournaments.mockReturnValue([]);
        
        // Benchmark Fetch - Expecting 4 ranges
        global.Sheets.Spreadsheets.Values.batchGet.mockReturnValue({ 
            valueRanges: [
                { values: [] }, // Perf
                { values: [] }, // Trophies
                { values: [] }, // Don
                { values: [] }  // History
            ] 
        });
        mocks.Registry.Services.Scoring.calculateHybridBenchmark.mockReturnValue({});
    });

    it('should run full scout pipeline successfully', () => {
        Headhunter.scout();

        // 1. Initialization
        expect(mocks.Registry.Services.Schema.bootDynamicSchema).toHaveBeenCalled();
        expect(mocks.Registry.Services.Network.fetchRoyaleAPI).toHaveBeenCalled(); // Clan Details

        // 2. Strategy
        expect(mocks.Strategy.calculateTrophyFloor).toHaveBeenCalled();

        // 3. Store
        expect(mocks.Store.updateAndGetBlacklist).toHaveBeenCalled();
        expect(mocks.Store.loadDatabase).toHaveBeenCalled();

        // 4. Scanner
        expect(mocks.Scanner.scanTournaments).toHaveBeenCalled();

        // 5. View
        expect(mocks.View.render).toHaveBeenCalled();
        expect(global.SpreadsheetApp.flush).toHaveBeenCalled();
    });

    it('should abort if quota is low', () => {
        mocks.Registry.Services.Network.getRemainingQuota.mockReturnValue(100);
        Headhunter.scout();
        expect(mocks.Scanner.scanTournaments).not.toHaveBeenCalled();
    });
});
