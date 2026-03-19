import { describe, it, expect, vi, beforeEach } from 'vitest';
import HeadhunterStore from '../Headhunter_Store';

const mocks = vi.hoisted(() => ({
    Time: {
        formatDate: vi.fn().mockReturnValue('01/01/2023'),
        formatDatetime: vi.fn().mockReturnValue('01/01/2023 12:00'),
        parseFlexibleDate: vi.fn().mockReturnValue(new Date('2023-01-01')),
    },
    View: {
        tagSheet: vi.fn()
    },
    Core: {
        normalizeTag: vi.fn((tag) => {
            if (!tag) return "";
            let clean = String(tag).trim().toUpperCase();
            if (clean && !clean.startsWith("#")) clean = "#" + clean;
            return clean;
        })
    }
}));

vi.mock('../Registry', () => ({
    default: {
        Services: {
            Time: mocks.Time,
            View: mocks.View,
            Core: mocks.Core
        }
    }
}));

// Mock SpreadsheetApp & Sheets API globally
vi.stubGlobal('SpreadsheetApp', {
    getActiveSpreadsheet: vi.fn(),
    flush: vi.fn(),
});

vi.stubGlobal('Sheets', {
    Spreadsheets: {
        Values: {
            update: vi.fn(),
        },
        batchUpdate: vi.fn(),
    },
});

describe('HeadhunterStore', () => {
    let mockSheet: any;
    let mockBlSheet: any;
    let mockEvtSheet: any;
    let mockParent: any;

    beforeEach(() => {
        vi.clearAllMocks();

        mockBlSheet = {
            getLastRow: vi.fn().mockReturnValue(1),
            getLastColumn: vi.fn().mockReturnValue(3),
            getRange: vi.fn().mockReturnThis(),
            getValue: vi.fn().mockReturnValue("Tag"),
            setValues: vi.fn(),
            setTabColor: vi.fn(),
            getValues: vi.fn().mockReturnValue([]),
            clearContent: vi.fn(),
            getParent: vi.fn().mockReturnValue({ getId: vi.fn().mockReturnValue('ss-id') }),
            getSheetId: vi.fn().mockReturnValue(456),
        };

        mockEvtSheet = {
            getLastRow: vi.fn().mockReturnValue(1),
            getLastColumn: vi.fn().mockReturnValue(10),
            getRange: vi.fn().mockReturnThis(),
            getValue: vi.fn().mockReturnValue("Tag"),
            setValues: vi.fn(),
            getValues: vi.fn().mockReturnValue([]),
            getDataRange: vi.fn().mockReturnThis(),
            clearContent: vi.fn(),
            getParent: vi.fn().mockReturnValue({ getId: vi.fn().mockReturnValue('ss-id') }),
            getSheetId: vi.fn().mockReturnValue(789),
            getMaxColumns: vi.fn().mockReturnValue(10),
            setTabColor: vi.fn(),
            hideSheet: vi.fn(),
        };

        mockSheet = {
            getLastRow: vi.fn().mockReturnValue(10),
            getRange: vi.fn().mockReturnThis(),
            getValues: vi.fn(),
            getName: vi.fn().mockReturnValue('Headhunter'),
            getSheetId: vi.fn().mockReturnValue(123),
            getParent: vi.fn(),
        };

        mockParent = {
            getSheetByName: vi.fn((name) => {
                if (name === 'HH_BLACKLIST') return mockBlSheet;
                if (name === 'HH_EVENT_LOG') return mockEvtSheet;
                if (name === 'Headhunter') return mockSheet;
                if (name === 'HH_QUEUE') return mockEvtSheet;
                return null;
            }),
            insertSheet: vi.fn((name) => {
                 if (name === 'HH_BLACKLIST') return mockBlSheet;
                 if (name === 'HH_EVENT_LOG') return mockEvtSheet;
                 if (name === 'HH_QUEUE') return mockEvtSheet;
                 return null;
            }),
            getId: vi.fn().mockReturnValue('ss-id'),
        };
        
        mockSheet.getParent.mockReturnValue(mockParent);
    });

    describe('loadDatabase', () => {
        it('should parse rows into Recruit objects', () => {
            const row1 = ["#ABC", false, "Player1", 5000, 100, 10, 5, "01/01/2023", 120, 90, "01/01/2023 12:00"];
            const row2 = ["#DEF", false, "Player2", 6000, 200, 20, 10, "01/01/2023", 150, 95, "01/01/2023 12:00"];
            mockSheet.getValues.mockReturnValue([row1, row2]);
            
            const map = HeadhunterStore.loadDatabase(mockSheet);
            expect(map.size).toBe(2);
            expect(map.get("#ABC")).toMatchObject({ tag: "#ABC", trophies: 5000, rawScore: 120 });
            expect(map.get("#DEF")).toMatchObject({ tag: "#DEF", trophies: 6000, rawScore: 150 });
        });
    });

    describe('updateAndGetBlacklist', () => {
        it('should process Event Stream (Hot Dismissals)', () => {
             mockEvtSheet.getLastRow.mockReturnValue(2);
             mockEvtSheet.getDataRange().getValues.mockReturnValue([
                 ["Tag", "Timestamp", "Score"],
                 ["#BANNED", 123456789, 200]
             ]);
             mockSheet.getLastRow.mockReturnValue(3); 
             mockSheet.getRange.mockImplementation((r, c) => {
                  return {
                      getValues: () => {
                          if (c === 2) return [["#BANNED", false, "Name", 5000, 0, 0, 0, "01/01/2023", 200, 50, "01/01/2023 12:00"]];
                          return [[false]];
                      },
                      getValue: vi.fn().mockReturnValue("Tag"),
                      setValue: vi.fn(),
                  }
             });

             const result = HeadhunterStore.updateAndGetBlacklist(mockSheet);
             expect(result.ids.has("#BANNED")).toBe(true);
             expect(mockEvtSheet.clearContent).toHaveBeenCalled();
        });
    });

    describe('Queue System', () => {
        it('should load candidates from the queue sheet', () => {
            const row = ["#QUEUE1", "QueuedPlayer", 7000, 100, 10, 5, 250, "01/01/2023", "TOURNAMENT", "01/01/2023 12:00"];
            mockEvtSheet.getLastRow.mockReturnValue(2);
            
            // Fix mock: use vi.fn() for getValues to track it
            const mockRange = {
                getValues: vi.fn().mockReturnValue([row])
            };
            mockEvtSheet.getRange.mockReturnValue(mockRange);

            // Mock Date to be 'now' so it doesn't expire
            mocks.Time.parseFlexibleDate.mockReturnValue(new Date());

            const map = HeadhunterStore.loadQueue(mockParent);
            expect(map.size).toBe(1);
            expect(map.get("#QUEUE1")).toMatchObject({ tag: "#QUEUE1", rawScore: 250 });
        });

        it('should save candidates to the queue sheet', () => {
             const recruits = [{ 
                 tag: "#NEW1", name: "New", trophies: 8000, donations: 0, 
                 cards: 0, war: 0, rawScore: 400, foundDate: new Date(),
                 invited: false, lastScan: Date.now()
             }] as any;
             
             HeadhunterStore.saveQueue(mockParent, recruits);
             expect(mockEvtSheet.setValues).toHaveBeenCalled();
        });
    });
});
