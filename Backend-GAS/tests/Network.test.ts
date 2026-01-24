
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Network from '../Network';

// Mock GAS services
const mockUrlFetch = {
  fetch: vi.fn(),
  fetchAll: vi.fn(),
};
const mockUtilities = {
  sleep: vi.fn(),
  base64EncodeWebSafe: vi.fn((s) => s),
  computeDigest: vi.fn(() => []),
  DigestAlgorithm: { MD5: 'MD5' }
};

const mockCache = {
  get: vi.fn(),
  put: vi.fn(),
};

const mockCacheService = {
  getScriptCache: vi.fn(() => mockCache),
};

// Mock Dependencies
const mockStore = {
  props: {
    getJSON: vi.fn(),
    setJSON: vi.fn(),
  },
};
const mockConfig = {
  SYSTEM: {
    API_KEYS: [{ name: 'TestKey', value: 'secret' }],
    REMOTE_WORKER_URL: 'https://worker',
    REMOTE_WORKER_SECRET: 'secret',
    RETRY_MAX: 1
  }
};

const mockRegistry = {
  Services: {
    Store: mockStore,
    Core: { executeSafely: vi.fn((name, fn) => fn()) }
  }
};

vi.stubGlobal('UrlFetchApp', mockUrlFetch);
vi.stubGlobal('Utilities', mockUtilities);
vi.stubGlobal('CacheService', mockCacheService);
vi.stubGlobal('Registry', mockRegistry);
vi.stubGlobal('CONFIG', mockConfig);

describe('Network Module', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Network._clearCache();
    mockUrlFetch.fetch.mockReturnValue({
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ items: [] }),
    });
    mockUrlFetch.fetchAll.mockReturnValue([{
      getResponseCode: () => 200,
      getContentText: () => JSON.stringify({ items: [] }),
    }]);
  });

  describe('fetchRoyaleAPI', () => {
    it('should fetch data using UrlFetchApp', () => {
      const urls = ['https://api.clashroyale.com/v1/clans'];
      const result = Network.fetchRoyaleAPI(urls);
      
      expect(mockUrlFetch.fetchAll).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });

    it('should handle quota tracking', () => {
      mockStore.props.getJSON.mockReturnValue({ date: new Date().toISOString().slice(0, 10), count: 0 });
      Network.fetchRoyaleAPI(['url1']);
      expect(mockStore.props.setJSON).toHaveBeenCalled();
    });
  });

  describe('remoteWorkerHealthy', () => {
    it('should check worker health', () => {
        mockUrlFetch.fetch.mockReturnValueOnce({
            getResponseCode: () => 200,
            getContentText: () => JSON.stringify({ status: "success", checks: { auth: "OK", upstream: "OK", memory: 100000000 } })
        });
        const healthy = Network.remoteWorkerHealthy();
        expect(healthy).toBe(true);
    });
  });
});
