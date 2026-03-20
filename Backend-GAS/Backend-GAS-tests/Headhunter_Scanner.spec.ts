import { describe, it, expect, vi, beforeEach } from 'vitest';
import HeadhunterScanner from '../Headhunter_Scanner';

const mocks = vi.hoisted(() => ({
    Network: {
        fetchRoyaleAPI: vi.fn(),
        fetchRemoteWorker: vi.fn(),
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
        calculateRecruitRawScore: vi.fn().mockReturnValue(100),
    },
    Database: {
        loadDatabase: vi.fn().mockReturnValue([])
    },
    BattleLog: {
        processPlayerHistory: vi.fn().mockReturnValue([])
    }
}));

vi.mock('../Registry', () => ({
    default: {
        Services: {
            Network: mocks.Network,
            Reporting: mocks.Reporting,
            Core: mocks.Core,
            Scoring: mocks.Scoring,
            Database: mocks.Database,
            BattleLog: mocks.BattleLog
        }
    }
}));

// Mock BattleLog module too since it's imported
vi.mock('../Battle_Log', () => ({
    default: mocks.BattleLog,
    AnalysisGoal: { RECRUITMENT: 'RECRUITMENT' }
}));

describe('HeadhunterScanner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should use Local Scan when Remote is offline', () => {
        // 1. Discovery
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([{
            items: [{ tag: "#TOURNEY1", type: "open", maxPlayers: 100 }]
        }]);

        // 2. Details
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([{
            tag: "#TOURNEY1",
            membersList: [{ tag: "#P1", name: "Player1" }]
        }]);

        // 3. Profiles
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([{
            tag: "#P1",
            name: "Player1",
            trophies: 6000,
            totalDonations: 100,
            warDayWins: 10,
            challengeCardsWon: 1000
        }]);

        // 4. Logs
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([
            [] // Empty log for P1
        ]);

        const result = HeadhunterScanner.scanTournaments(5000, new Map(), new Set(), false);
        
        expect(result.length).toBe(1);
        expect(result[0].tag).toBe("#P1");
    });

    it('should use Remote Scan when Worker is healthy', () => {
        // 1. Discovery
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([{
            items: [{ tag: "#TOURNEY1", type: "open", maxPlayers: 100 }]
        }]);
        
        // 2. Details
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([{
            tag: "#TOURNEY1",
            membersList: [{ tag: "#P1", name: "Player1" }]
        }]);

        // 3. Remote Scan
        mocks.Network.fetchRemoteWorker.mockReturnValue({
            candidates: [{ tag: "#P1", name: "Player1", rawScore: 200, trophies: 6000 }]
        });

        // 4. Seed Logs (Shadow Scouting)
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([]);

        const result = HeadhunterScanner.scanTournaments(5000, new Map(), new Set(), false);
        
        expect(result.length).toBe(1);
        expect(result[0].rawScore).toBe(200);
    });
});
