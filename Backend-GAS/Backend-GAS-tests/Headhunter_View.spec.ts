
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HeadhunterView from '../Headhunter_View';
import { CONFIG } from '../Configuration';

// Mock Config
vi.mock('../Configuration', () => {
  const mockConfig = {
    HEADHUNTER: { TARGET: 5 }, // Small target for testing
    SCHEMA: {
      HH: { TAG: 0, INVITED: 1, NAME: 2, TROPHIES: 3, DONATIONS: 4, CARDS: 5, WAR_WINS: 6, FOUND_DATE: 7, RAW_SCORE: 8, POTENTIAL_SCORE: 9, LAST_SCAN: 10 },
      HH_HEADERS: { TAG: 'Tag', INVITED: 'Invited', NAME: 'Name', TROPHIES: 'Trophies', DONATIONS: 'Donations', CARDS: 'Cards Won', WAR_WINS: 'War Wins', FOUND_DATE: 'Found Date', RAW_SCORE: 'Potential Raw Score', POTENTIAL_SCORE: 'Potential Score', LAST_SCAN: 'Last Scan' }
    },
    LAYOUT: { DATA_START_ROW: 3 },
    SYSTEM: { TIMEZONE: 'UTC', DATE_FORMAT_VALUE: 'yyyy-MM-dd', DATE_FORMAT_DATETIME: 'yyyy-MM-dd HH:mm', MAX_BACKUPS: 5 },
    THEME: { TABLE: { HEADER_BG: '#f8f9fa' } }
  };
  // @ts-ignore
  global.CONFIG = mockConfig;
  return { CONFIG: mockConfig };
});

const mocks = vi.hoisted(() => ({
  View: {
    applyStandardLayout: vi.fn(),
    setStatusMessage: vi.fn(),
    hexToRgbColor: vi.fn(() => ({ red: 0, green: 0, blue: 0 })),
    render: vi.fn(),
    enforceGlobalTabHygiene: vi.fn(),
    backupSheet: vi.fn()
  },
  Time: {
    parseFlexibleDate: vi.fn((val: any) => new Date(val)),
    formatDate: vi.fn(() => 'mock-date')
  }
}));

vi.mock('../Registry', () => ({
  default: {
    Services: {
      View: mocks.View,
      Time: mocks.Time
    }
  },
  Registry: {
    Services: {
      View: mocks.View,
      Time: mocks.Time
    }
  }
}));


// Mock Globals
global.Utilities = {
    formatDate: vi.fn((d) => "2023-01-01")
};

global.Sheets = {
    Spreadsheets: {
        Values: {
            update: vi.fn()
        },
        batchUpdate: vi.fn()
    }
};

describe('HeadhunterView', () => {
    let mockSheet: any;

    beforeEach(() => {
        vi.restoreAllMocks();
        mockSheet = {
            getName: vi.fn().mockReturnValue("Headhunter"),
            getParent: vi.fn().mockReturnValue({ getId: vi.fn().mockReturnValue("ss1") }),
            getSheetId: vi.fn().mockReturnValue(999)
        };
    });

    it('should render recruits and pad to target', () => {
        const recruits: any[] = [
            { tag: "#1", name: "P1", foundDate: new Date() }
        ];

        HeadhunterView.render(mockSheet, recruits, 0);

        // Verify Layout
        expect(mocks.View.applyStandardLayout).toHaveBeenCalledWith(mockSheet, 5, 11, expect.any(Array));

        // Verify Data Update
        expect(global.Sheets.Spreadsheets.Values.update).toHaveBeenCalled();
        const callArgs = (global.Sheets.Spreadsheets.Values.update as any).mock.calls[0];
        const payload = callArgs[0];
        
        // Should have 5 rows (1 recruit + 4 empty)
        expect(payload.values.length).toBe(5);
        expect(payload.values[0][0]).toBe("#1");
        expect(payload.values[1][0]).toBe("");

        // Verify Visuals
        expect(global.Sheets.Spreadsheets.batchUpdate).toHaveBeenCalled();
    });

    it('should handle empty list', () => {
        HeadhunterView.render(mockSheet, [], 0);
        
        // Should just render 5 empty rows
        const callArgs = (global.Sheets.Spreadsheets.Values.update as any).mock.calls[0];
        const payload = callArgs[0];
        expect(payload.values.length).toBe(5);
        expect(payload.values[0][0]).toBe("");
    });

    it('should coerce complex objects to numbers to prevent list_value errors', () => {
        const recruits: any[] = [
            { 
                tag: "#OBJ", 
                name: "Object Player", 
                donations: [{ count: 87, name: "Giant" }], // Malformed: Array of objects
                cards: [{ count: 1, name: "Archer" }],    // Malformed: Array of objects
                foundDate: new Date() 
            }
        ];

        HeadhunterView.render(mockSheet, recruits, 0);

        const callArgs = (global.Sheets.Spreadsheets.Values.update as any).mock.calls[0];
        const payload = callArgs[0];
        
        // donations index 4, cards index 5
        expect(payload.values[0][4]).toBeNaN();
        expect(payload.values[0][5]).toBeNaN();
    });
});
