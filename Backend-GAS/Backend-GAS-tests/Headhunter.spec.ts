
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Headhunter from '../Headhunter';
import HeadhunterStore from '../Headhunter_Store';
import HeadhunterView from '../Headhunter_View';
import { CONFIG } from '../Configuration';

// Mock Config
vi.mock('../Configuration', () => {
  const mockConfig = {
    SYSTEM: { CLAN_TAG: "#CLAN", API_BASE: "https://api", TIMEZONE: "UTC", DATE_FORMAT_VALUE: "YYYY", MAX_BACKUPS: 5 },
    SHEETS: { HH: "Headhunter", ROSTER: "Leaderboard", QUEUE: "HH_QUEUE" },
    HEADHUNTER: { TARGET: 50, WEIGHTS: {}, MAX_QUEUE_SIZE: 500 },
    SCHEMA: { 
        ROSTER: { PERF_SCORE: 1, TROPHIES: 2, TOTAL_DON: 3, HISTORY: 4 },
        HH: {},
        QUEUE: { TAG: 0, RAW_SCORE: 6 }
    },
    LAYOUT: { DATA_START_ROW: 3 }
  };
  // @ts-ignore
  global.CONFIG = mockConfig;
  return { CONFIG: mockConfig };
});

// Mock Sub-Modules - Hoisted
const mocks = vi.hoisted(() => ({
    Store: { 
        updateAndGetBlacklist: vi.fn(), 
        loadDatabase: vi.fn(),
        loadQueue: vi.fn(),
        saveQueue: vi.fn()
    },
    Scanner: { scanTournaments: vi.fn() },
    View: { 
        render: vi.fn(), 
        backupSheet: vi.fn(), 
        enforceGlobalTabHygiene: vi.fn(), 
        tagSheet: vi.fn() 
    },
    Registry: {
        Services: {
            Network: { 
                fetchRoyaleAPI: vi.fn(), 
                getRemainingQuota: vi.fn(), 
                _clearCache: vi.fn(), 
                getWorkerSummary: vi.fn(),
                remoteWorkerHealthy: vi.fn()
            },
            View: { 
                backupSheet: vi.fn(), 
                enforceGlobalTabHygiene: vi.fn(), 
                tagSheet: vi.fn() 
            },
            Reporting: { logReport: vi.fn() },
            Schema: { bootDynamicSchema: vi.fn() },
            Scoring: { 
                calculateTrophyFloor: vi.fn(),
                calculateHybridBenchmark: vi.fn(), 
                calculatePotentialScore: vi.fn(),
                calculateRecruitRawScore: vi.fn()
            },
            Time: { calculateWarWeekId: vi.fn() }
        }
    }
}));

vi.mock('../Headhunter_Store', () => ({ default: mocks.Store }));
vi.mock('../Headhunter_Scanner', () => ({ default: mocks.Scanner }));
vi.mock('../Headhunter_View', () => ({ default: mocks.View }));
vi.mock('../Registry', () => ({ default: mocks.Registry }));

// Mock Globals
global.SpreadsheetApp = {
    getActiveSpreadsheet: vi.fn(),
    flush: vi.fn(),
    insertSheet: vi.fn()
} as any;
global.Sheets = {
    Spreadsheets: {
        Values: { batchGet: vi.fn().mockReturnValue({ valueRanges: [] }) },
        batchUpdate: vi.fn()
    }
} as any;
global.Utilities = {
    sleep: vi.fn(),
    formatDate: vi.fn()
} as any;
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
            getLastRow: vi.fn().mockReturnValue(10),
            getParent: vi.fn().mockReturnValue({ getId: vi.fn().mockReturnValue('mock-ss-id') }),
            appendRow: vi.fn()
        };
        mockSS = {
            getSheetByName: vi.fn().mockReturnValue(mockSheet),
            insertSheet: vi.fn().mockReturnValue(mockSheet),
            getId: vi.fn().mockReturnValue('mock-ss-id'),
        };
        global.SpreadsheetApp.getActiveSpreadsheet.mockReturnValue(mockSS);

        // Default Mock Returns
        mocks.Registry.Services.Network.fetchRoyaleAPI.mockReturnValue([
            { requiredTrophies: 3000, memberList: [] } // Clan Details
        ]);
        mocks.Registry.Services.Network.getRemainingQuota.mockReturnValue(5000);
        
        mocks.Registry.Services.Scoring.calculateTrophyFloor.mockReturnValue({ floor: 3000, method: "Base", mode: "BASE" });
        mocks.Store.updateAndGetBlacklist.mockReturnValue({ ids: new Set(), entries: [] });
        mocks.Store.loadDatabase.mockReturnValue(new Map());
        mocks.Store.loadQueue.mockReturnValue(new Map());
        mocks.Store.saveQueue.mockReturnValue({ count: 0, pruned: 0 });
        mocks.Scanner.scanTournaments.mockReturnValue([
            { tag: "#P1", name: "Candidate", trophies: 6000, rawScore: 150, foundDate: new Date() }
        ]);
        
        mocks.Registry.Services.Scoring.calculateHybridBenchmark.mockReturnValue(10000);
        mocks.Registry.Services.View.backupSheet.mockReturnValue("succeeded");
        mocks.Registry.Services.View.enforceGlobalTabHygiene.mockReturnValue("Clean");
    });

    it('should run full executeRecruitScout pipeline successfully', () => {
        Headhunter.executeRecruitScout();

        // 1. Initialization
        expect(mocks.Registry.Services.Schema.bootDynamicSchema).toHaveBeenCalled();
        expect(mocks.Registry.Services.Network.fetchRoyaleAPI).toHaveBeenCalled(); // Clan Details

        // 2. Strategy & Scoring
        expect(mocks.Registry.Services.Scoring.calculateTrophyFloor).toHaveBeenCalled();

        // 3. Store
        expect(mocks.Store.updateAndGetBlacklist).toHaveBeenCalled();
        expect(mocks.Store.loadDatabase).toHaveBeenCalled();
        expect(mocks.Store.loadQueue).toHaveBeenCalled();

        // 4. Scanner
        expect(mocks.Scanner.scanTournaments).toHaveBeenCalled();

        // 5. Finalize
        expect(vi.mocked(HeadhunterStore).saveQueue).toHaveBeenCalled();
        expect(vi.mocked(HeadhunterView).render).toHaveBeenCalled();
        expect(global.SpreadsheetApp.flush).toHaveBeenCalled();
    });

    it('should abort if quota is low', () => {
        mocks.Registry.Services.Network.getRemainingQuota.mockReturnValue(100);
        Headhunter.executeRecruitScout();
        expect(mocks.Scanner.scanTournaments).not.toHaveBeenCalled();
    });
});
