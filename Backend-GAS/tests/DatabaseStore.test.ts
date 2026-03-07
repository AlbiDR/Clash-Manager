
import { describe, it, expect, vi, beforeEach } from 'vitest';
import DatabaseStore from '../DatabaseStore';
import Registry from '../Registry';

// Mock Configuration
vi.mock('../Configuration', () => ({
  CONFIG: {
    LAYOUT: { DATA_START_ROW: 3 },
    SCHEMA: {
      DB: {
        DATE: 0,
        TAG: 1,
        NAME: 2
      }
    },
    SYSTEM: {
      DB_PURGE_DAYS: 30,
      DB_PRUNE_THRESHOLD: 10
    }
  }
}));

// Mock Registry
vi.mock('../Registry', () => ({
  default: {
    Services: {
      Time: {
        parseFlexibleDate: vi.fn(),
        formatShortDate: vi.fn(),
        formatDate: vi.fn()
      },
      View: {
        getColLetter: vi.fn(),
        createDeleteRequest: vi.fn()
      }
    }
  }
}));

// Mock GAS Globals
vi.stubGlobal('Sheets', {
  Spreadsheets: {
    get: vi.fn(),
    Values: {
      batchGet: vi.fn(),
      batchUpdate: vi.fn(),
      update: vi.fn()
    },
    batchUpdate: vi.fn()
  }
});
vi.stubGlobal('SpreadsheetApp', {
  flush: vi.fn()
});

describe('DatabaseStore Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pruneStaleData', () => {
    it('should identify stale members correctly', () => {
      const mockSheet = {
        getParent: () => ({ getId: () => 'ss-id' }),
        getName: () => 'DB',
        getSheetId: () => 123
      };
      const activeTags = new Set(['TAG1']);
      
      // Mock Sheets metadata
      (global as any).Sheets.Spreadsheets.get.mockReturnValue({
        sheets: [{ properties: { gridProperties: { rowCount: 10 } } }]
      });

      // Mock View helpers
      (Registry.Services.View.getColLetter as any)
        .mockReturnValueOnce('B') // Tag
        .mockReturnValueOnce('C') // Date
        .mockReturnValueOnce('D'); // Name

      // Mock Data response
      (global as any).Sheets.Spreadsheets.Values.batchGet.mockReturnValue({
        valueRanges: [
          { values: [['TAG1'], ['TAG2']] }, // Tags
          { values: [['01/01/2024'], ['01/01/2020']] }, // Dates
          { values: [['Player 1'], ['Player 2']] } // Names
        ]
      });

      // Mock Time parsing
      const freshDate = new Date();
      const ancientDate = new Date('2020-01-01');
      (Registry.Services.Time.parseFlexibleDate as any)
        .mockReturnValueOnce(freshDate)
        .mockReturnValueOnce(ancientDate);

      DatabaseStore.pruneStaleData(mockSheet, activeTags);

      // Verify batchUpdate was called for TAG2
      expect((global as any).Sheets.Spreadsheets.batchUpdate).toHaveBeenCalled();
      const calls = (global as any).Sheets.Spreadsheets.batchUpdate.mock.calls;
      const requests = calls[0][0].requests;
      expect(requests.length).toBe(1); // Only index 1 (TAG2) should be deleted
    });
  });

  describe('deduplicateDatabase', () => {
    it('should skip invalid dates during deduplication', () => {
      const mockSheet = {
        getParent: () => ({ getId: () => 'ss-id' }),
        getName: () => 'DB',
        getLastRow: () => 10,
        getSheetId: () => 123
      };

      (global as any).Sheets.Spreadsheets.Values.batchGet.mockReturnValue({
        valueRanges: [
          { values: [['TAG1'], ['TAG2']] },
          { values: [['VALID'], ['INVALID']] }
        ]
      });

      (Registry.Services.Time.parseFlexibleDate as any)
        .mockReturnValueOnce(new Date('2024-01-01'))
        .mockReturnValueOnce(new Date(0)); // Invalid/Epoch 0

      const result = DatabaseStore.deduplicateDatabase(mockSheet);
      expect(result.pruned).toBe(0);
    });

    it('should generate correct day keys for deduplication', () => {
      const mockSheet = {
        getParent: () => ({ getId: () => 'ss-id' }),
        getName: () => 'DB',
        getLastRow: () => 10,
        getSheetId: () => 123
      };

      (global as any).Sheets.Spreadsheets.Values.batchGet.mockReturnValue({
        valueRanges: [
          { values: [['TAG1'], ['TAG1']] },
          { values: [['2024-01-01'], ['2024-01-01']] }
        ]
      });

      const date = new Date('2024-01-01');
      (Registry.Services.Time.parseFlexibleDate as any).mockReturnValue(date);
      (Registry.Services.Time.formatShortDate as any).mockReturnValue('20240101');

      DatabaseStore.deduplicateDatabase(mockSheet);
      expect(Registry.Services.Time.formatShortDate).toHaveBeenCalledWith(date);
    });
  });
});
