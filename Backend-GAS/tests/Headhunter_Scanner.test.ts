
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HeadhunterScanner from '../Headhunter_Scanner';
import { CONFIG } from '../Configuration';

// Mock Configuration
vi.mock('../Configuration', () => {
  const mockConfig = {
    HEADHUNTER: {
      KEYWORDS: ['test'],
      WEIGHTS: { TROPHY: 1, DON: 0.1, WAR: 10 },
      DEEP_SCAN: {
        LOCAL: { TOURNEYS: 10, PLAYERS: 10 },
        REMOTE: { TOURNEYS: 20, PLAYERS: 20 },
        MAX_TOURNEYS: 50,
        MAX_PLAYERS: 50
      }
    },
    SHEETS: { QUEUE: 'HH_QUEUE' },
    SYSTEM: { API_BASE: 'https://api.test', MAX_BACKUPS: 5, PROPHET_TENURE_THRESHOLD: 10 }
  };
  // @ts-ignore
  global.CONFIG = mockConfig;
  return { CONFIG: mockConfig };
});

// Mock Registry - Hoisted
const mocks = vi.hoisted(() => ({
    Network: {
        fetchRoyaleAPI: vi.fn(),
        remoteWorkerHealthy: vi.fn(),
        getLastWorkerError: vi.fn(),
        scanTournamentsRemote: vi.fn(),
    },
    Store: {
        props: { get: vi.fn(), getJSON: vi.fn().mockReturnValue({}), setJSON: vi.fn() }
    },
    Reporting: { logReport: vi.fn() },
    Core: {
        shuffleArray: vi.fn((arr) => arr),
    },
    Scoring: {
        calculateRecruitRawScore: vi.fn()
    },
    RosterStore: {
        getProphetCache: vi.fn().mockReturnValue(new Map())
    }
}));

vi.mock('../Registry', () => ({
    default: {
        Services: {
            Network: mocks.Network,
            Store: mocks.Store,
            Reporting: mocks.Reporting,
            Core: mocks.Core,
            Scoring: mocks.Scoring
        }
    }
}));

vi.mock('../Roster_Store', () => {
    return {
        default: {
            getProphetCache: vi.fn().mockReturnValue(new Map())
        }
    };
});

describe('HeadhunterScanner', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        // @ts-ignore
        global.CONFIG = CONFIG;

        // Defaults
        mocks.RosterStore.getProphetCache.mockReturnValue(new Map());
        mocks.Store.props.getJSON.mockReturnValue({});
        mocks.Store.props.get.mockReturnValue("1"); // Remote Expand Enabled
        mocks.Network.remoteWorkerHealthy.mockReturnValue(false); // Default to Local to start safe
        mocks.Core.shuffleArray.mockImplementation((a: any) => a);
    });

    it('should return empty if no tournaments found', () => {
        mocks.Network.fetchRoyaleAPI.mockReturnValue([]); // No results
        const result = HeadhunterScanner.scanTournaments(5000, new Map(), new Set());
        expect(result).toEqual([]);
    });

    it('should use Local Scan when Remote is offline', () => {
        mocks.Network.remoteWorkerHealthy.mockReturnValue(false);
        
        // 1. Discovery
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([
            { items: [{ tag: "#T1", capacity: 50 }] } 
        ]);

        // 2. Tournament Details Fetch (Local)
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([
            {
                tag: "#T1",
                membersList: [
                    { tag: "#P1", clan: { tag: "" } }, // Clanless
                    { tag: "#P2", clan: { tag: "#CLAN" } }, // Clanned
                    ...Array(8).fill({ tag: "#P_EXTRA", clan: { tag: "#CLAN" } }) // Fill to 10
                ]
            }
        ]);

        // 3. Player Details Fetch
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([
           { tag: "#P1", trophies: 5500, totalDonations: 100, warDayWins: 10 } 
        ]);
        
        // 4. Battle Log Fetch (because rawScore missing)
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([[]]); // Empty log
        
        mocks.Scoring.calculateRecruitRawScore.mockReturnValue(100);

        const result = HeadhunterScanner.scanTournaments(5000, new Map(), new Set());
        
        expect(result.length).toBe(1);
        expect(result[0].tag).toBe("#P1");
        expect(mocks.Network.fetchRoyaleAPI).toHaveBeenCalledTimes(4);
    });

    it('should use Remote Scan when Worker is healthy', () => {
        mocks.Network.remoteWorkerHealthy.mockReturnValue(true);
        mocks.Store.props.get.mockReturnValue("1");

        // 1. Discovery
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([
            { items: [{ tag: "#T1", capacity: 50 }] }
        ]);

        // 2. Remote Scan Call
        mocks.Network.scanTournamentsRemote.mockReturnValue([
            { tag: "#P1", rawScore: 200, potentialScore: 90, trophies: 6000 }
        ]);

        // 3. Shadow Scout Battle Logs (Triggered by low yield < 40)
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([ [] ]); // Empty logs for simplicy

        const result = HeadhunterScanner.scanTournaments(5000, new Map(), new Set());
        
        expect(result.length).toBe(1);
        expect(result[0].rawScore).toBe(200);
        expect(mocks.Network.scanTournamentsRemote).toHaveBeenCalled();
        // Should call fetchRoyaleAPI twice: 1 for Discovery, 1 for Shadow Scout
        expect(mocks.Network.fetchRoyaleAPI).toHaveBeenCalledTimes(2); 
    });

    it('should fallback to Local if Remote fails', () => {
        mocks.Network.remoteWorkerHealthy.mockReturnValue(true);
        mocks.Network.scanTournamentsRemote.mockImplementation(() => {
            throw new Error("Worker Timeout");
        });

        // 1. Discovery
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([
             { items: [{ tag: "#T1" }] }
        ]);

        // 2. Local Fallbacks
        mocks.Network.fetchRoyaleAPI.mockReturnValueOnce([{ membersList: [] }]); // Details
        // Stops here as no members

        const result = HeadhunterScanner.scanTournaments(5000, new Map(), new Set());
        
        expect(result).toEqual([]);
        expect(mocks.Network.scanTournamentsRemote).toHaveBeenCalled();
        // Should call local fetch
        expect(mocks.Network.fetchRoyaleAPI).toHaveBeenCalledTimes(2);
    });
});
