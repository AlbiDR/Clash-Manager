
import { describe, it, expect, vi, beforeEach } from 'vitest';
import HeadhunterView from '../Headhunter_View';

// Mock Config
vi.mock('../Configuration', () => ({
  CONFIG: {
    HEADHUNTER: { TARGET: 5 }, // Small target for testing
    SCHEMA: {
      HH: { TAG: 0, INVITED: 1, NAME: 2, TROPHIES: 3, DONATIONS: 4, CARDS: 5, WAR_WINS: 6, FOUND_DATE: 7, RAW_SCORE: 8, POTENTIAL_SCORE: 9 },
      HH_HEADERS: { TAG: 'Tag' }
    },
    LAYOUT: { DATA_START_ROW: 3 },
    SYSTEM: { TIMEZONE: 'UTC', DATE_FORMAT_VALUE: 'yyyy-MM-dd' }
  }
}));

// Mock Registry - Hoisted
const mocks = vi.hoisted(() => ({
    View: {
        applyStandardLayout: vi.fn(),
        setStatusMessage: vi.fn()
    }
}));

vi.mock('../Registry', () => ({
    default: {
        Services: {
            View: mocks.View
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
        expect(mocks.View.applyStandardLayout).toHaveBeenCalledWith(mockSheet, 5, 10, expect.any(Array));

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
});
