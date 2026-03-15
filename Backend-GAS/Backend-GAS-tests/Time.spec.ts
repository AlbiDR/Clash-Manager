
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Time from '../Time';

// Mock GAS Utilities
const mockUtilities = {
  formatDate: vi.fn(),
};
const mockConfig = {
  SYSTEM: {
    TIMEZONE: 'GMT',
    DATE_FORMAT_VALUE: 'dd/MM/yyyy HH.mm.ss',
  },
};

vi.mock('../Configuration', () => ({
  CONFIG: {
    SYSTEM: {
      TIMEZONE: 'GMT',
      DATE_FORMAT_VALUE: 'dd/MM/yyyy HH.mm.ss',
      DATE_FORMAT_DATE: 'dd/MM/yyyy'
    }
  }
}));

vi.stubGlobal('Utilities', mockUtilities);

describe('Time Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('formatDate', () => {
    it('should format valid dates', () => {
      const date = new Date('2023-01-01T12:00:00Z');
      mockUtilities.formatDate.mockReturnValue('2023-01-01');
      expect(Time.formatDate(date)).toBe('2023-01-01');
      expect(mockUtilities.formatDate).toHaveBeenCalledWith(date, 'GMT', 'dd/MM/yyyy HH.mm.ss');
    });

    it('should return empty string for invalid dates', () => {
      expect(Time.formatDate(null)).toBe('');
      expect(Time.formatDate(undefined)).toBe('');
    });
  });

  describe('calculateWarWeekId', () => {
    it('should calculate correct week ID', () => {
        // Thursday Jan 4th 2024 is in Week 1 of 2024
        // Monday Jan 1st 2024 after 10:00 UTC is Week 1
        const date = new Date('2024-01-04T12:00:00Z'); 
        // 2024 W01
        expect(Time.calculateWarWeekId(date)).toBe('24W01');
    });
  });

  describe('getLogicalDay', () => {
    it('should return 1 for Monday after reset', () => {
      const monAfter = new Date('2024-01-01T11:00:00Z'); // Mon 11am UTC
      expect(Time.getLogicalDay(monAfter)).toBe(1);
    });

    it('should return 7 for Monday before reset (Sunday logical)', () => {
        const monBefore = new Date('2024-01-01T09:00:00Z'); // Mon 9am UTC
        expect(Time.getLogicalDay(monBefore)).toBe(7);
    });
  });
});
