import { describe, it, expect, vi, beforeEach } from 'vitest';
import Headhunter from '../Headhunter';
import HeadhunterStore from '../Headhunter_Store';
import HeadhunterScanner from '../Headhunter_Scanner';
import HeadhunterView from '../Headhunter_View';

const mocks = vi.hoisted(() => ({
    Network: {
        fetchRoyaleAPI: vi.fn(),
        fetchRoyaleAPIOne: vi.fn(),
        getWorkerSummary: vi.fn().mockReturnValue('Healthy'),
    },
    Reporting: {
        logReport: vi.fn()
    },
    Core: {
        normalizeTag: vi.fn((tag) => {
            if (!tag) return "";
            let clean = String(tag).trim().toUpperCase();
            if (clean && !clean.startsWith("#")) clean = "#" + clean;
            return clean;
        }),
    },
    Scoring: {
        calculateClanTrophyFloor: vi.fn().mockReturnValue(5000),
        calculateEffectiveScoutFloor: vi.fn().mockReturnValue(4500),
        calculateRecruitRawScore: vi.fn().mockReturnValue(100),
        calculateHybridBenchmark: vi.fn().mockReturnValue(150),
        calculatePotentialScore: vi.fn().mockReturnValue(80),
    },
    View: {
        backupSheet: vi.fn(),
        enforceGlobalTabHygiene: vi.fn().mockReturnValue('Cleaned'),
    },
    Time: {
        calculateWarWeekId: vi.fn().mockReturnValue('24W01'),
    }
}));

vi.mock('../Registry', () => ({
    default: {
        Services: {
            Network: mocks.Network,
            Reporting: mocks.Reporting,
            Core: mocks.Core,
            Scoring: mocks.Scoring,
            View: mocks.View,
            Time: mocks.Time,
        }
    }
}));

vi.mock('../Headhunter_Store', () => ({
    default: {
        updateAndGetBlacklist: vi.fn().mockReturnValue({ ids: new Set(), entries: [] }),
        loadDatabase: vi.fn().mockReturnValue(new Map()),
        loadQueue: vi.fn().mockReturnValue(new Map()),
        saveQueue: vi.fn().mockReturnValue({ count: 10, pruned: 0 }),
    }
}));

vi.mock('../Headhunter_Scanner', () => ({
    default: {
        scanTournaments: vi.fn().mockReturnValue([]),
    }
}));

vi.mock('../Headhunter_View', () => ({
    default: {
        render: vi.fn(),
    }
}));

const mockSheet = {
    getLastRow: vi.fn().mockReturnValue(0),
    getName: vi.fn().mockReturnValue('Mock'),
};

vi.stubGlobal('SpreadsheetApp', {
    getActiveSpreadsheet: vi.fn().mockReturnValue({
        getSheetByName: vi.fn().mockReturnValue(mockSheet),
        insertSheet: vi.fn().mockReturnValue(mockSheet),
        getId: vi.fn().mockReturnValue('ss-id'),
    }),
    flush: vi.fn(),
});

describe('Headhunter Orchestrator', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should run full executeRecruitScout pipeline successfully', () => {
        mocks.Network.fetchRoyaleAPIOne.mockReturnValueOnce({
            items: [{ tag: "#TOURNEY1", type: "open", maxPlayers: 100 }]
        });

        Headhunter.executeRecruitScout();

        expect(HeadhunterStore.loadDatabase).toHaveBeenCalled();
        expect(HeadhunterScanner.scanTournaments).toHaveBeenCalled();
        expect(HeadhunterView.render).toHaveBeenCalled();
    });
});
