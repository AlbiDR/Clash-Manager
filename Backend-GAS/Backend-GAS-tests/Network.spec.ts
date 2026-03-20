
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
    Core: { executeSafely: vi.fn((name, fn) => fn()) },
    Time: {
      calculateWarWeekId: vi.fn(() => "24W09"),
      parseRoyaleApiDate: vi.fn((d) => new Date(d))
    }
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

    it('should throw error if urls is not an array', () => {
      // @ts-ignore
      expect(() => Network.fetchRoyaleAPI('not-an-array')).toThrow(/Network: fetchRoyaleAPI expects an Array of URLs/);
    });
  });

  describe('fetchRoyaleAPIOne', () => {
    it('should fetch a single URL and return the object', () => {
      const url = 'https://api.clashroyale.com/v1/players/%23TAG';
      mockUrlFetch.fetchAll.mockReturnValueOnce([{
        getResponseCode: () => 200,
        getContentText: () => JSON.stringify({ name: 'Player' }),
      }]);
      
      const result = Network.fetchRoyaleAPIOne(url);
      
      expect(mockUrlFetch.fetchAll).toHaveBeenCalled();
      expect(result.name).toBe('Player');
    });

    it('should throw error if url is not a string', () => {
      // @ts-ignore
      expect(() => Network.fetchRoyaleAPIOne(['not-a-string'])).toThrow(/Network: fetchRoyaleAPIOne expects a string URL/);
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

  describe('fetchClanDataSmart Local Fallback', () => {
    it('should extract history from log when in local mode', () => {
        mockConfig.SYSTEM.CLAN_TAG = "#MYCLAN";
        mockConfig.SYSTEM.REMOTE_WORKER_URL = ""; // Disable remote
        
        const mockMembers = { items: [] };
        const mockRace = { clan: { tag: "#MYCLAN" } };
        const mockLog = {
            items: [
                {
                    createdDate: "20240301T100000.000Z",
                    standings: [
                        {
                            clan: {
                                tag: "#MYCLAN",
                                participants: [
                                    { tag: "#P1", fame: 1000 }
                                ]
                            }
                        }
                    ]
                }
            ]
        };

        mockUrlFetch.fetchAll.mockReturnValueOnce([
            { getResponseCode: () => 200, getContentText: () => JSON.stringify(mockMembers) },
            { getResponseCode: () => 200, getContentText: () => JSON.stringify(mockRace) },
            { getResponseCode: () => 200, getContentText: () => JSON.stringify(mockLog) }
        ]);

        const result = Network.fetchClanDataSmart("%23MYCLAN");
        
        expect(result.history).not.toBeNull();
        expect(result.history["#P1"]).toBeDefined();
        expect(result.history["#P1"]["24W09"]).toBe(1000);
    });
  });
});
