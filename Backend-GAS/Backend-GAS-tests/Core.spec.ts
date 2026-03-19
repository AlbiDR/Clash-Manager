import { describe, it, expect, vi, beforeEach } from 'vitest';
import Core from '../Core';

const mockLock = {
  tryLock: vi.fn().mockReturnValue(true),
  releaseLock: vi.fn(),
};
const mockLockService = {
  getScriptLock: vi.fn().mockReturnValue(mockLock),
};

vi.stubGlobal('LockService', mockLockService);

describe('Core Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Core.executeSafely', () => {
    it('should acquire and release lock for safe execution', () => {
      const callback = vi.fn().mockReturnValue('result');
      const result = Core.executeSafely('TEST_LOCK', callback);
      expect(mockLockService.getScriptLock).toHaveBeenCalled();
      expect(mockLock.tryLock).toHaveBeenCalledWith(60000);
      expect(callback).toHaveBeenCalled();
      expect(mockLock.releaseLock).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should always release lock even on error', () => {
      const callback = vi.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      expect(() => Core.executeSafely('TEST_LOCK', callback)).toThrow('Test error');
      expect(mockLock.releaseLock).toHaveBeenCalled();
    });

    it('should throw if lock cannot be acquired', () => {
      mockLock.tryLock.mockReturnValueOnce(false);
      expect(() => Core.executeSafely('TEST_LOCK', () => {})).toThrow(/Lock timeout/);
    });
  });

  describe('Core.normalizeTag', () => {
    it('should uppercase and trim tags', () => {
      expect(Core.normalizeTag('  #abc123  ')).toBe('#ABC123');
    });

    it('should add missing # prefix', () => {
      expect(Core.normalizeTag('abc123')).toBe('#ABC123');
    });

    it('should return empty string for null/undefined/empty', () => {
      expect(Core.normalizeTag(null as any)).toBe('');
      expect(Core.normalizeTag(undefined as any)).toBe('');
      expect(Core.normalizeTag('')).toBe('');
    });

    it('should handle already normalized tags', () => {
      expect(Core.normalizeTag('#P123')).toBe('#P123');
    });
  });

  describe('Core.shuffleArray', () => {
    it('should shuffle array in place', () => {
      const original = [1, 2, 3, 4, 5];
      const copy = [...original];
      const randomValues = [0.9, 0.1, 0.5, 0.2];
      let callIndex = 0;
      vi.spyOn(Math, 'random').mockImplementation(() => randomValues[callIndex++ % randomValues.length]);
      const result = Core.shuffleArray(copy);
      expect(result).toBe(copy);
      expect(result.length).toBe(original.length);
      vi.restoreAllMocks();
    });
    
    it('should handle empty array', () => {
      const empty: number[] = [];
      const result = Core.shuffleArray(empty);
      expect(result).toEqual([]);
    });
  });

  describe('Core.runtime', () => {
    it('should track elapsed time', () => {
      const elapsed = Core.runtime.getElapsedMs();
      expect(typeof elapsed).toBe('number');
      expect(elapsed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Core.parseWarHistory', () => {
    it('should parse standard history strings', () => {
      const hist = "1200 24W10 | 2500 24W09";
      const result = Core.parseWarHistory(hist);
      expect(result.size).toBe(2);
      expect(result.get('24W10')).toBe(1200);
      expect(result.get('24W09')).toBe(2500);
    });

    it('should handle GAS comma delimiters', () => {
      const hist = "1200 24W10, 2500 24W09";
      const result = Core.parseWarHistory(hist);
      expect(result.size).toBe(2);
      expect(result.get('24W10')).toBe(1200);
      expect(result.get('24W09')).toBe(2500);
    });

    it('should handle mixed delimiters and extra spaces', () => {
      const hist = "  1200 24W10,  | 2500 24W09 ";
      const result = Core.parseWarHistory(hist);
      expect(result.size).toBe(2);
      expect(result.get('24W10')).toBe(1200);
      expect(result.get('24W09')).toBe(2500);
    });

    it('should return empty map for null/empty/invalid input', () => {
      expect(Core.parseWarHistory(null).size).toBe(0);
      expect(Core.parseWarHistory("").size).toBe(0);
      expect(Core.parseWarHistory("-").size).toBe(0);
      expect(Core.parseWarHistory("random garbage").size).toBe(0);
    });

    it('should ignore malformed entries but parse valid ones', () => {
      const hist = "1200 24W10 | malformed | 2500 24W09";
      const result = Core.parseWarHistory(hist);
      expect(result.size).toBe(2);
      expect(result.get('24W10')).toBe(1200);
      expect(result.get('24W09')).toBe(2500);
    });
  });
});
