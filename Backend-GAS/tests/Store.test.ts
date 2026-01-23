
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Store from '../Store';

// Mock GAS services
const mockProperties = new Map<string, string>();
const mockCache = new Map<string, string>();

const mockPropertiesService = {
  getScriptProperties: vi.fn().mockReturnValue({
    getProperty: vi.fn((key) => mockProperties.get(key) || null),
    setProperty: vi.fn((key, val) => mockProperties.set(key, String(val))),
    getProperties: vi.fn(() => Object.fromEntries(mockProperties)),
    deleteProperty: vi.fn((key) => mockProperties.delete(key)),
  }),
};

const mockCacheService = {
  getScriptCache: vi.fn().mockReturnValue({
    get: vi.fn((key) => mockCache.get(key) || null),
    put: vi.fn((key, val) => mockCache.set(key, val)),
    getAll: vi.fn((keys) => {
      const result: Record<string, any> = {};
      keys.forEach((k: string) => (result[k] = mockCache.get(k)));
      return result;
    }),
    remove: vi.fn((key) => mockCache.delete(key)),
  }),
};

// Inject mocks into global scope
vi.stubGlobal('PropertiesService', mockPropertiesService);
vi.stubGlobal('CacheService', mockCacheService);

describe('Store Module', () => {
  beforeEach(() => {
    mockProperties.clear();
    mockCache.clear();
    vi.clearAllMocks();
  });

  describe('Store.props', () => {
    it('should get and set simple properties', () => {
      Store.props.set('testKey', 'testValue');
      expect(mockProperties.get('testKey')).toBe('testValue');
      expect(Store.props.get('testKey')).toBe('testValue');
    });

    it('should handle JSON objects', () => {
      const data = { foo: 'bar', num: 123 };
      Store.props.setJSON('jsonKey', data);
      expect(JSON.parse(mockProperties.get('jsonKey')!)).toEqual(data);
      expect(Store.props.getJSON('jsonKey')).toEqual(data);
    });

    it('should prune orphaned chunks when setting chunked data', () => {
      // simulate old chunks
      mockProperties.set('chunkKey_0', 'old1');
      mockProperties.set('chunkKey_1', 'old2');
      mockProperties.set('chunkKey_2', 'old3');

      const data = { id: 1, text: 'small' }; // Should fit in 1 chunks
      Store.props.setChunked('chunkKey', data);

      expect(mockProperties.has('chunkKey_1')).toBe(false); // Pruned
      expect(mockProperties.has('chunkKey_2')).toBe(false); // Pruned
    });

    it('should handle keys with special regex characters safely', () => {
      const complexKey = 'user(123).settings[v1]';
      const data = { valid: true };
      
      Store.props.setChunked(complexKey, data);
      
      const stored = Store.props.getChunked(complexKey);
      expect(stored).toEqual(data);
      
      // Verify underlying storage safety
      expect(mockProperties.has(`${complexKey}_0`)).toBe(true);
    });
  });

  describe('Store.cache', () => {
    it('should cache small items normally', () => {
      Store.cache.putLarge('cacheKey', 'smallValue');
      expect(mockCache.get('cacheKey')).toBe('smallValue');
      expect(mockCache.has('cacheKey_meta')).toBe(false);
    });

    it('should chunk large items', () => {
      const largeVal = 'x'.repeat(100000); // Larger than 90k chunk size
      Store.cache.putLarge('largeKey', largeVal);

      expect(mockCache.has('largeKey')).toBe(false); // Base key removed
      expect(mockCache.has('largeKey_meta')).toBe(true);
      expect(mockCache.has('largeKey_0')).toBe(true);
      expect(mockCache.has('largeKey_1')).toBe(true);
      
      const retrieved = Store.cache.getLarge('largeKey');
      expect(retrieved).toBe(largeVal);
    });
  });
});
