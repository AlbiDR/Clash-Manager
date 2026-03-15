import { vi, describe, it, expect, beforeEach } from 'vitest';
import RosterStore from '../Roster_Store';
import { CONFIG } from '../Configuration';

// Mock GAS globals
const mockSheet = {
  getLastRow: vi.fn(),
  getRange: vi.fn().mockReturnThis(),
  getValues: vi.fn(),
  getName: vi.fn(() => "Clan Database")
};

const mockSpreadsheet = {
  getSheetByName: vi.fn(),
  getId: vi.fn(() => "SS_ID")
};

const mockSpreadsheetApp = {
  getActiveSpreadsheet: vi.fn(() => mockSpreadsheet),
  flush: vi.fn()
};

(global as any).SpreadsheetApp = mockSpreadsheetApp;

vi.mock('../Registry', () => ({
  default: {
    Services: {
      Time: {
        parseFlexibleDate: vi.fn((val) => new Date(val)),
        calculateWarWeekId: vi.fn((date) => "24W10"),
        formatShortDate: vi.fn((date) => "2024-03-01"),
        formatDate: vi.fn((date) => "2024-03-01 10:00:00")
      },
      Core: {
        parseWarHistory: vi.fn()
      },
      Store: {
        props: {
          getChunked: vi.fn(),
          setChunked: vi.fn()
        }
      }
    }
  }
}));

describe('RosterStore Module', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        CONFIG.LAYOUT.DATA_START_ROW = 3;
        CONFIG.SHEETS.DB = "Clan Database";
        CONFIG.SCHEMA.DB = {
            DATE: 0,
            TAG: 1,
            NAME: 2,
            ROLE: 3,
            TROPHIES: 4,
            DON_GIVEN: 5,
            DON_REC: 6,
            LAST_SEEN: 7,
            WAR_FAME: 8,
            BATTLE_CREDITS: 9
        };
    });

    describe('loadMarketIntelligence', () => {
        it('should extract fame history from the database sheet', () => {
            mockSpreadsheet.getSheetByName.mockReturnValue(mockSheet);
            mockSheet.getLastRow.mockReturnValue(4); // Start at 3, so 2 rows
            
            // Row structure: [Date, Tag, Name, Role, Trophies, DonGiven, DonRec, LastSeen, WarFame, BattleCredits]
            // getRange(3, 2, 2, 10) starting from index 2 (Column B)
            // schema starts from 0 relative to B (Column B is index 0)
            const mockValues = [
                ["2024-03-01", "#P1", "Player 1", "elder", 5000, 100, 100, "2024-03-01", 1200, 1],
                ["2024-03-02", "#P1", "Player 1", "elder", 5000, 100, 100, "2024-03-02", 1500, 1]
            ];
            mockSheet.getValues.mockReturnValue(mockValues);

            const result = RosterStore.loadMarketIntelligence();

            expect(result.has("#P1")).toBe(true);
            const p1 = result.get("#P1");
            expect(p1.fameHistory).toBeDefined();
            expect(p1.fameHistory.get("24W10")).toBe(1500); // Max of 1200 and 1500
        });

        it('should return empty map if sheet not found', () => {
            mockSpreadsheet.getSheetByName.mockReturnValue(null);
            const result = RosterStore.loadMarketIntelligence();
            expect(result.size).toBe(0);
        });
    });
});
