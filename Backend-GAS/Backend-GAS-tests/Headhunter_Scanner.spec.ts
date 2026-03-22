import { describe, it, expect, vi, beforeEach } from 'vitest';
import HeadhunterScanner from '../Headhunter_Scanner';

const mocks = vi.hoisted(() => ({
    Network: {
        fetchRoyaleAPI: vi.fn(),
        fetchRoyaleAPIOne: vi.fn(),
        fetchRemoteWorker: vi.fn(),
        remoteWorkerHealthy: vi.fn(),
    },
    Roster: {
        getTopPerformers: vi.fn().mockReturnValue(["#TOP1", "#TOP2", "#TOP3"])
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
            BattleLog: mocks.BattleLog,
            Roster: mocks.Roster
        }
    }
}));

vi.mock('../Battle_Log', () => ({
    default: mocks.BattleLog,
    AnalysisGoal: { RECRUITMENT: 'RECRUITMENT' }
}));

vi.mock('../Configuration', () => ({
    CONFIG: {
        HEADHUNTER: {
            KEYWORDS: ["a", "b", "c", "1", "2", "3"],
            WEIGHTS: { trophies: 1, donations: 1, war: 1, cards: 1 },
            MAX_SHADOW_RECRUITS: 10
        },
        SYSTEM: {
            API_BASE: "https://api.clashroyale.com/v1",
            REMOTE_WORKER_URL: "https://worker.fake"
        }
    }
}));

describe('HeadhunterScanner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.Network.fetchRemoteWorker.mockReturnValue(undefined);
        mocks.Network.remoteWorkerHealthy.mockReturnValue(false);
        // Default catch-all to prevent undefined errors
        mocks.Network.fetchRoyaleAPI.mockImplementation((urls) => {
            if (!urls || urls.length === 0) return [];
            return [];
        });
    });

    it('should use Local Scan when Remote is offline', () => {
        mocks.Network.fetchRoyaleAPIOne.mockReturnValue({ items: [{ tag: "#T1", type: "open", maxPlayers: 100 }] });

        mocks.Network.fetchRoyaleAPI.mockImplementation((urls, scoring, label) => {
            if (label === "Extraction") return [{ tag: "#T1", membersList: [{ tag: "#P1", name: "Player1" }] }];
            if (label === "Deep Profiling") return [{ tag: "#P1", name: "Player1", trophies: 6000 }];
            if (label === "Shadow Seeding") return [[]];
            return [];
        });

        const result = HeadhunterScanner.scanTournaments(5000, new Map(), new Set(), false);
        
        expect(result.length).toBe(1);
        expect(result[0].tag).toBe("#P1");
    });

    it('should use Remote Scan when Worker is healthy', () => {
        mocks.Network.remoteWorkerHealthy.mockReturnValue(true);
        mocks.Network.fetchRoyaleAPIOne.mockReturnValue({ items: [{ tag: "#T1", type: "open", maxPlayers: 100 }] });

        mocks.Network.fetchRemoteWorker.mockReturnValue({
            candidates: [{ tag: "#P1", name: "Player1", rawScore: 200, trophies: 6000 }]
        });

        mocks.Network.fetchRoyaleAPI.mockImplementation((urls, scoring, label) => {
            if (label === "Extraction") return [{ tag: "#T1", membersList: [{ tag: "#P1", name: "Player1" }] }];
            if (label === "Shadow Seeding") return [[]];
            return [];
        });

        const result = HeadhunterScanner.scanTournaments(5000, new Map(), new Set(), false);
        
        expect(result.length).toBe(1);
        expect(result[0].rawScore).toBe(200);
    });

    it('should proceed to Shadow Scouting even if Tournament Search fails', () => {
        mocks.Network.fetchRoyaleAPIOne.mockReturnValue({ items: [] });
        
        const existingRecruits = new Map();
        existingRecruits.set("#SEED1", { tag: "#SEED1", name: "Seeder", rawScore: 500 });

        mocks.Network.fetchRoyaleAPI.mockImplementation((urls, scoring, label) => {
            if (label === "Extraction") return [];
            if (label === "Deep Profiling") return [];
            if (label === "Shadow Seeding") return [
                [{ type: "ladder", opponent: [{ tag: "#SHADOW1", name: "Shadow Player", clan: null }] }]
            ];
            if (label === "Shadow Profiles") return [{
                tag: "#SHADOW1",
                name: "Shadow Player",
                trophies: 6200,
                totalDonations: 500,
                warDayWins: 50
            }];
            return [];
        });

        const result = HeadhunterScanner.scanTournaments(5000, existingRecruits, new Set(), false);

        expect(result.length).toBe(1);
        expect(result[0].tag).toBe("#SHADOW1");
        expect(result[0].source).toBe("SHADOW");
    });
});
