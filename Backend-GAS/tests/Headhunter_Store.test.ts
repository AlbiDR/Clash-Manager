
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HeadhunterStore from '../Headhunter_Store';
import { CONFIG } from '../Configuration';

// Mock Configuration
vi.mock('../Configuration', () => {
  const mockConfig = {
    LAYOUT: { DATA_START_ROW: 3 },
    SCHEMA: {
      HH: { TAG: 0, INVITED: 1, NAME: 2, TROPHIES: 3, DONATIONS: 4, CARDS: 5, WAR_WINS: 6, FOUND_DATE: 7, RAW_SCORE: 8, POTENTIAL_SCORE: 9 },
    },
    SHEETS: { BL: 'HH_BLACKLIST', EVT: 'HH_EVENT_LOG', HH: 'Headhunter', DB: 'Clan Database', QUEUE: 'HH_QUEUE' },
    HEADHUNTER: { BLACKLIST_DAYS: 30, TARGET: 50, MAX_QUEUE_SIZE: 500 },
    SYSTEM: { MAX_BACKUPS: 5 }
  };
  // @ts-ignore
  global.CONFIG = mockConfig;
  return { CONFIG: mockConfig };
});

// Mock Registry - Hoisted
const mocks = vi.hoisted(() => ({
    Time: {
        formatDate: vi.fn().mockReturnValue('2023-01-01'),
        parseFlexibleDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
        calculateWarWeekId: vi.fn().mockReturnValue('W1')
    },
    View: {
        tagSheet: vi.fn()
    },
    Store: {
        props: {
            getJSON: vi.fn().mockReturnValue({}),
            setJSON: vi.fn()
        },
        withLock: vi.fn((key, fn) => fn())
    }
}));

vi.mock('../Registry', () => ({
    default: {
        Services: {
            Time: mocks.Time,
            View: mocks.View,
            Store: mocks.Store
        }
    }
}));

// Mock Global Utilities
// @ts-ignore
global.Utilities = {
  sleep: vi.fn(),
  formatDate: vi.fn().mockReturnValue('2023-01-01')
};

// Mock Global Sheets API
// @ts-ignore
global.Sheets = {
  Spreadsheets: {
    batchUpdate: vi.fn(),
    Values: {
        update: vi.fn()
    }
  }
};

describe('HeadhunterStore', () => {
    let mockSheet: any;
    let mockParent: any;
    let mockBlSheet: any;
    let mockEvtSheet: any;

    beforeEach(() => {
        vi.restoreAllMocks();
        // @ts-ignore
        global.CONFIG = CONFIG;
        
        // Defaults
        mocks.Time.parseFlexibleDate.mockReturnValue(new Date());
        mocks.Store.props.getJSON.mockReturnValue({});

        mockBlSheet = {
            getLastRow: vi.fn(),
            getRange: vi.fn().mockReturnThis(),
            getValue: vi.fn().mockReturnValue("Tag"),
            setValues: vi.fn(),
            setTabColor: vi.fn(),
            getValues: vi.fn().mockReturnValue([]),
            clearContent: vi.fn(),
            insertSheet: vi.fn().mockReturnThis(),
            getParent: vi.fn().mockReturnValue({ getId: vi.fn().mockReturnValue('mock-ss-id') }),
            hideSheet: vi.fn(),
            getSheetId: vi.fn().mockReturnValue(456),
            getMaxColumns: vi.fn().mockReturnValue(20),
        };

        mockEvtSheet = {
            getLastRow: vi.fn(),
            getRange: vi.fn().mockReturnThis(),
            setValues: vi.fn(),
            setTabColor: vi.fn(),
            getDataRange: vi.fn().mockReturnThis(),
            getValues: vi.fn().mockReturnValue([]), // Header only
            clearContent: vi.fn(),
            getLastColumn: vi.fn().mockReturnValue(3),
            getParent: vi.fn().mockReturnValue({ getId: vi.fn().mockReturnValue('mock-ss-id') }),
            hideSheet: vi.fn(),
            getSheetId: vi.fn().mockReturnValue(789),
            getMaxColumns: vi.fn().mockReturnValue(20),
            getValue: vi.fn().mockReturnValue("Tag"),
        };

        mockSheet = {
            getLastRow: vi.fn().mockReturnValue(10), // Some rows
            getRange: vi.fn().mockReturnThis(),
            getValues: vi.fn(),
            deleteRow: vi.fn(),
            getName: vi.fn().mockReturnValue('Headhunter'),
            getSheetId: vi.fn().mockReturnValue(123),
            getParent: vi.fn(),
            setTabColor: vi.fn(),
            getMaxColumns: vi.fn().mockReturnValue(20),
        };

        mockParent = {
            getSheetByName: vi.fn((name) => {
                if (name === 'HH_BLACKLIST') return mockBlSheet;
                if (name === 'HH_EVENT_LOG') return mockEvtSheet;
                if (name === 'Headhunter') return mockSheet;
                return null;
            }),
            insertSheet: vi.fn((name) => {
                 if (name === 'HH_BLACKLIST') return mockBlSheet;
                 if (name === 'HH_EVENT_LOG') return mockEvtSheet;
                 return null;
            }),
            toast: vi.fn(),
            getId: vi.fn().mockReturnValue('mock-ss-id'),
        };
        
        mockSheet.getParent.mockReturnValue(mockParent);
    });

    describe('loadDatabase', () => {
        it('should parse rows into Recruit objects', () => {
            // Mock 2 rows.
            // SCHEMA.HH TAG=0, INVITED=1, NAME=2, TROPHIES=3...
            // Config Mock adjusted to match real world better.
            const row1 = ["#ABC", false, "Player1", 5000, 100, 10, 5, "2023-01-01", 120, 90];
            const row2 = ["#DEF", false, "Player2", 6000, 200, 20, 10, "2023-01-01", 150, 95];
            
            mockSheet.getValues.mockReturnValue([row1, row2]);
            
            const map = HeadhunterStore.loadDatabase(mockSheet);
            expect(map.size).toBe(2);
            expect(map.get("#ABC")).toMatchObject({ tag: "#ABC", trophies: 5000, rawScore: 120 });
            expect(map.get("#DEF")).toMatchObject({ tag: "#DEF", trophies: 6000, rawScore: 150 });
        });

        it('should handle empty sheet', () => {
            mockSheet.getLastRow.mockReturnValue(2); // Less than DATA_START_ROW (3)
            const map = HeadhunterStore.loadDatabase(mockSheet);
            expect(map.size).toBe(0);
        });
    });

    describe('updateAndGetBlacklist', () => {
        it('should initialize sheets if they do not exist', () => {
             mockParent.getSheetByName.mockReturnValue(null); // Return null first
             
             // BL Sheet Mock Setup for Initialization
             mockBlSheet.getLastRow.mockReturnValue(0);
             // Ensure fetching main data returns empty so loop doesn't crash on undefined 'forEach'
             mockSheet.getRange.mockReturnValue({
                 getValues: () => []
             });
             
             // Run
             HeadhunterStore.updateAndGetBlacklist(mockSheet);
             
             expect(mockParent.insertSheet).toHaveBeenCalledWith('HH_BLACKLIST');
             expect(mockParent.insertSheet).toHaveBeenCalledWith('HH_EVENT_LOG');
         });

        it('should process Event Stream (Hot Dismissals)', () => {
             // 1. Setup Event Stream Data
             // Header + 1 Event
             mockEvtSheet.getLastRow.mockReturnValue(2);
             mockEvtSheet.getDataRange().getValues.mockReturnValue([
                 ["Tag", "Timestamp", "Score"],
                 ["#BANNED", 123456789, 200]
             ]);

             // 2. Setup Main Sheet Data (to find score of banned player)
             // Start Row 3.
             // Tag at 0 (Col B), RawScore at 7 (Col I).
             // B3: #BANNED, I3: 200
             mockSheet.getLastRow.mockReturnValue(3); 
             // Call 1: get recruits data for metadata map
             mockSheet.getValues.mockReturnValue([
                 ["#BANNED", "INVITED_VAL", "Name", 5000, 0, 0, 0, 0, 200]
             ]);
             
             // Call 2: get INVITED column for auditing (Standard Cleanup)
             // Mocking getRange logic inside updateAndGetBlacklist is complex because it calls getRange multiple times.
             // We need to match the calls.
             
             // Simpler approach: mock getValues based on getRange return.
             // But we mocked getRange to return 'this' (mockSheet).
             // So mockSheet.getValues needs to be smart or we verify side effects.
             
             // Logic:
             // 1. Load Main Data -> map(#BANNED -> score 200)
             // 2. Load Events -> find #BANNED. Add to BL map.
             // 3. Tick Main Sheet -> set Invited to TRUE.
             
             // Let's refine mockSheet.getValues behavior.
             mockSheet.getValues
                .mockReturnValueOnce([["#BANNED", "", "", "", "", "", "", 200]]) // Main Data Load
                .mockReturnValueOnce([[false]]); // Invited Column Load

             mockSheet.getRange.mockImplementation((r, c) => {
                  return {
                      getValues: () => {
                          if (c === 2) return [["#BANNED", "", "", "", "", "", "", "", 200]]; // Main Load
                          return [[false]]; // Invited Load
                      },
                      getValue: vi.fn(),
                      setValue: vi.fn(),
                      setValues: vi.fn(),
                      clearContent: vi.fn()
                  }
             });

             const result = HeadhunterStore.updateAndGetBlacklist(mockSheet);
             
             expect(result.ids.has("#BANNED")).toBe(true);
             expect(result.entries[0].rawScore).toBe(200);
             
             // Verify Event Sheet was cleared
             expect(mockEvtSheet.clearContent).toHaveBeenCalled();
        });
        
        it('should process Manual Ticks (Standard Cleanup)', () => {
             // Setup Main Sheet: Row 3 has #TICKED, Invited=TRUE
             mockSheet.getLastRow.mockReturnValue(3);
             
             // Mock Data Helper
             // 1. Main Data Load: Tag #TICKED, Score 300
             // 2. Invited Column Load: TRUE
             mockSheet.getRange.mockImplementation(() => {
                 return {
                     getValues: () => {
                         const row = new Array(10).fill("");
                         row[0] = "#TICKED";
                         row[1] = true;
                         row[8] = 300;
                         return [row];
                     },
                      getValue: vi.fn(),
                      setValue: vi.fn(),
                      clearContent: vi.fn(),
                      deleteRow: vi.fn()
                 }
             });

             const result = HeadhunterStore.updateAndGetBlacklist(mockSheet);
             
             // Should have added to BL
             expect(result.ids.has("#TICKED")).toBe(true);
             expect(result.entries[0].rawScore).toBe(300);
             
             // Should use batchUpdate for deletion
             expect(global.Sheets.Spreadsheets.batchUpdate).toHaveBeenCalled();
        });
    });

    describe('Queue System', () => {
        it('should load candidates from the queue sheet', () => {
            const recentDate = new Date().toISOString();
            const row = ["#QUEUE1", "QueuedPlayer", 7000, 100, 10, 5, 250, recentDate, "TOURNAMENT"];
            mockEvtSheet.getLastRow.mockReturnValue(2);
            mockEvtSheet.getRange.mockReturnValue({
                getValues: () => [row]
            });
            mockParent.getSheetByName.mockImplementation((name) => {
                if (name === 'HH_QUEUE') return mockEvtSheet;
                return null;
            });
            
            const map = HeadhunterStore.loadQueue(mockParent);
            expect(map.size).toBe(1);
            expect(map.get("#QUEUE1")).toMatchObject({ tag: "#QUEUE1", rawScore: 250 });
        });

        it('should save candidates to the queue sheet', () => {
             const recruits = [{ 
                 tag: "#NEW1", name: "New", trophies: 8000, donations: 0, 
                 cards: 0, war: 0, rawScore: 400, foundDate: new Date(),
                 invited: false 
             }];
             
             mockParent.getSheetByName.mockReturnValue(null); // Force insert
             mockParent.insertSheet.mockReturnValue(mockEvtSheet);
             mockEvtSheet.getLastRow.mockReturnValue(0);
             
             HeadhunterStore.saveQueue(mockParent, recruits);
             
             expect(mockParent.insertSheet).toHaveBeenCalledWith('HH_QUEUE');
             expect(mockEvtSheet.setValues).toHaveBeenCalled();
        });
    });
});
