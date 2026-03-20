import { describe, it, expect, vi, beforeEach } from 'vitest';
import HeadhunterScanner from '../Headhunter_Scanner';

const mocks = vi.hoisted(() => ({
    Network: {
        fetchRoyaleAPI: vi.fn(),
        fetchRoyaleAPIOne: vi.fn(),
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
        // Ensure remote worker is "offline" by default for local-scan tests
        mocks.Network.fetchRemoteWorker.mockReturnValue(undefined);
    });

    it('should use Local Scan when Remote is offline', () => {
        // 1. Discovery
        mocks.Network.fetchRoyaleAPIOne.mockReturnValueOnce({
            items: [{ tag: "#TOURNEY1", type: "open", maxPlayers: 100 }]
        });

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
        mocks.Network.fetchRoyaleAPIOne.mockReturnValueOnce({
            items: [{ tag: "#TOURNEY1", type: "open", maxPlayers: 100 }]
        });
        
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

    it('should fall back to 10-player threshold on 3rd attempt', () => {
        // Attempt 0: threshold=50, all tournaments too small → miss
        mocks.Network.fetchRoyaleAPIOne.mockReturnValueOnce({
            items: [{ tag: "#T_SMALL_A", type: "open", maxPlayers: 30 }]
        });
        // Attempt 1: threshold=25, tournaments still too small → miss
        mocks.Network.fetchRoyaleAPIOne.mockReturnValueOnce({
            items: [{ tag: "#T_SMALL_B", type: "open", maxPlayers: 20 }]
        });
        // Attempt 2: threshold=10, tournament now qualifies → hit
        mocks.Network.fetchRoyaleAPIOne.mockReturnValueOnce({
            items: [{ tag: "#T_SMALL_C", type: "open", maxPlayers: 12 }]
        });

        // Details for the winning tournament
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([{
            tag: "#T_SMALL_C",
            membersList: [{ tag: "#P_FALLBACK", name: "Fallback Player" }]
        }]);

        // Player profile (local scan path)
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([{
            tag: "#P_FALLBACK",
            name: "Fallback Player",
            trophies: 5500,
            totalDonations: 50,
            warDayWins: 5,
            challengeCardsWon: 500
        }]);

        // Battle log
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([[]]);

        const result = HeadhunterScanner.scanTournaments(5000, new Map(), new Set(), false);

        expect(result.length).toBe(1);
        expect(result[0].tag).toBe("#P_FALLBACK");
    });
});
