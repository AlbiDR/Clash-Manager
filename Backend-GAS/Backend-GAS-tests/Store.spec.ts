
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Buffer } from 'node:buffer';
import Store from '../Store';

// Mock GAS services
const mockProperties = new Map<string, string>();
const mockCacheMap = new Map<string, string>();

const mockPropertiesService = {
  getScriptProperties: vi.fn().mockReturnValue({
    getProperty: vi.fn((key) => mockProperties.get(key) || null),
    setProperty: vi.fn((key, val) => mockProperties.set(key, String(val))),
    getProperties: vi.fn(() => Object.fromEntries(mockProperties)),
    deleteProperty: vi.fn((key) => mockProperties.delete(key)),
  }),
};

const mockCache = {
  get: vi.fn((key) => mockCacheMap.get(key) || null),
  put: vi.fn((key, val) => mockCacheMap.set(key, String(val))),
  remove: vi.fn((key) => mockCacheMap.delete(key)),
  getAll: vi.fn((keys) => {
    const res: Record<string, string> = {};
    keys.forEach((k: string) => {
      if (mockCacheMap.has(k)) res[k] = mockCacheMap.get(k)!;
    });
    return res;
  }),
  removeAll: vi.fn((keys) => keys.forEach((k: string) => mockCacheMap.delete(k))),
};

const mockCacheService = {
  getScriptCache: vi.fn(() => mockCache),
};

// Mock LockService
const mockLock = {
  tryLock: vi.fn().mockReturnValue(true),
  releaseLock: vi.fn(),
};
const mockLockService = {
  getScriptLock: vi.fn().mockReturnValue(mockLock),
};

// Mock Utilities (Compression)
const mockUtilities = {
  newBlob: vi.fn((data) => ({ getBytes: () => Buffer.from(data, 'utf-8') })),
  gzip: vi.fn((bytes) => bytes), // Pass-through for mock
  ungzip: vi.fn((bytes) => ({ getDataAsString: () => Buffer.from(bytes).toString('utf-8') })),
  base64Encode: vi.fn((bytes) => Buffer.from(bytes).toString('base64')),
  base64Decode: vi.fn((str) => Buffer.from(str, 'base64')),
};

// Inject mocks into global scope
vi.stubGlobal('PropertiesService', mockPropertiesService);
vi.stubGlobal('CacheService', mockCacheService);
vi.stubGlobal('LockService', mockLockService);
vi.stubGlobal('Utilities', mockUtilities);

describe('Store Module', () => {
  beforeEach(() => {
    mockProperties.clear();
    mockCacheMap.clear();
    vi.clearAllMocks();
  });

  describe('Atomic Locking', () => {
    it('should acquire lock when writing chunked data', () => {
      const data = { locked: true };
      Store.props.setChunked('lockKey', data);
      expect(mockLockService.getScriptLock).toHaveBeenCalled();
      expect(mockLock.tryLock).toHaveBeenCalled();
      expect(mockLock.releaseLock).toHaveBeenCalled();
    });
  });

  describe('Compression', () => {
    it('should compress large objects', () => {
      // Create large object > 2KB
      const largeObj = { data: 'x'.repeat(3000) };
      const compressed = Store.compress(largeObj);
      
      expect(compressed).toContain('gzip:');
      expect(mockUtilities.gzip).toHaveBeenCalled();
    });

    it('should decompress correctly', () => {
      const original = { data: 'my secret' };
      // Manually construct what compress() would output with our mocks
      // JSON -> Bytes -> Gzip(Mock=Bytes) -> Base64
      const json = JSON.stringify(original);
      const b64 = Buffer.from(json).toString('base64');
      const compressedStr = `gzip:${b64}`;

      const decompressed = Store.decompress(compressedStr);
      expect(decompressed).toEqual(original);
    });

    it('should transparently read compressed props', () => {
      const original = { data: 'auto-decompress' };
      const json = JSON.stringify(original);
      const b64 = Buffer.from(json).toString('base64');
      const compressedStr = `gzip:${b64}`;

      mockProperties.set('autoKey', compressedStr);
      
      const result = Store.props.getJSON('autoKey');
      expect(result).toEqual(original);
    });
  });

  describe('Store.props (Public API)', () => {
    it('should get and set simple properties', () => {
      Store.props.set('testKey', 'testValue');
      expect(mockProperties.get('testKey')).toBe('testValue');
      expect(Store.props.get('testKey')).toBe('testValue');
    });

    it('should handle JSON objects (auto-compression)', () => {
      const data = { foo: 'bar', num: 123 };
      Store.props.setJSON('jsonKey', data);
      
      // Verify transparent read
      expect(Store.props.getJSON('jsonKey')).toEqual(data);
      
      // Verify storage (might be raw or compressed, handled by implementation)
      const stored = mockProperties.get('jsonKey');
      expect(stored).toBeTruthy();
    });

    it('should prune orphaned chunks (Internal.writeChunks verification)', () => {
      // simulate old chunks
      mockProperties.set('chunkKey_0', 'old1');
      mockProperties.set('chunkKey_1', 'old2');
      mockProperties.set('chunkKey_2', 'old3');

      const data = { id: 1, text: 'small' }; // Should fit in 1 chunks
      Store.props.setChunked('chunkKey', data);

      expect(mockProperties.has('chunkKey_1')).toBe(false); // Pruned
      expect(mockProperties.has('chunkKey_2')).toBe(false); // Pruned
    });

    it('should handle special regex keys (Internal.escapeRegex verification)', () => {
      const complexKey = 'user(123).settings[v1]';
      const data = { valid: true };
      
      Store.props.setChunked(complexKey, data);
      const stored = Store.props.getChunked(complexKey);
      expect(stored).toEqual(data);
      expect(mockProperties.has(`${complexKey}_0`)).toBe(true);
    });
  });

  describe('Store.cache', () => {
    it('should cache small items normally', () => {
      Store.cache.putLarge('cacheKey', 'smallValue');
      expect(mockCacheMap.get('cacheKey')).toBe('smallValue');
      expect(mockCacheMap.has('cacheKey_meta')).toBe(false);
    });

    it('should chunk large items', () => {
      const largeVal = 'x'.repeat(100000); // Larger than 90k chunk size
      Store.cache.putLarge('largeKey', largeVal);

      expect(mockCacheMap.has('largeKey')).toBe(false); // Base key removed
      expect(mockCacheMap.has('largeKey_meta')).toBe(true);
      expect(mockCacheMap.has('largeKey_0')).toBe(true);
      expect(mockCacheMap.has('largeKey_1')).toBe(true);
      
      const retrieved = Store.cache.getLarge('largeKey');
      expect(retrieved).toBe(largeVal);
    });
  });
});
