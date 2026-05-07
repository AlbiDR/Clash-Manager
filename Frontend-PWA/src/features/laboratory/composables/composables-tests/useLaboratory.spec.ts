import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';
import { setActivePinia, createPinia } from 'pinia';

// --- Mocks ---

const mockClashData = ref({ playerTag: '#TAG123' });
const mockCurrentSource = ref('GAS_BACKEND');
const mockHubSyncTime = ref(Date.now());

vi.mock("@core/services/useClashDataStore", () => ({
  useClashDataStore: () => ({
    data: mockClashData,
    currentSource: mockCurrentSource,
    lastSyncTime: mockHubSyncTime
  })
}));

const mockGetPlayerProfile = vi.fn();
vi.mock("@core/api/SupabaseClient", () => ({
  getPlayerProfile: (tag: string) => mockGetPlayerProfile(tag),
  lastHubDiagnosis: { value: null },
  lastSyncStatus: { value: null },
  // Include other exports if needed to prevent breakage
  NetworkError: class extends Error { constructor(m:string){super(m); this.name="NetworkError";}}
}));

// Mock requestAnimationFrame to execute immediately
vi.stubGlobal('requestAnimationFrame', vi.fn((cb: FrameRequestCallback) => cb(0)));

// Mock localStorage
const localStorageStore: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => localStorageStore[key] || null),
  setItem: vi.fn((key: string, value: string) => { localStorageStore[key] = value.toString(); }),
  removeItem: vi.fn((key: string) => { delete localStorageStore[key]; }),
  clear: vi.fn(() => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); })
};
vi.stubGlobal('localStorage', localStorageMock);

// --- Logic Mocks ---
const mockHydrate = vi.fn();
vi.mock('../../logic', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    ProfileHydrator: {
      ...actual.ProfileHydrator,
      hydrate: (raw: any) => mockHydrate(raw) || actual.ProfileHydrator.hydrate(raw)
    },
    calculateProgressionPath: vi.fn(function* () {
      yield { history: [], totalXp: 0, inventory: { gold: 0, gems: 0, wildCards: {} } };
    })
  };
});

describe('useLaboratory', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    vi.resetModules();
    localStorageMock.clear();
    vi.clearAllMocks();
    mockClashData.value = { playerTag: '#TAG123' };
    mockGetPlayerProfile.mockReset();
  });

  it('should initialize settings from localStorage', async () => {
    localStorageMock.setItem('laboratory_settings', JSON.stringify({ strategy: 'Resource Efficiency', allowGemSpending: true }));

    const { useLaboratory } = await import('../useLaboratory');
    const { settings } = useLaboratory();

    expect(settings.value.strategy).toBe('Resource Efficiency');
    expect(settings.value.allowGemSpending).toBe(true);
  });

  it('should migrate legacy strategy names from localStorage', async () => {
    localStorageMock.setItem('laboratory_settings', JSON.stringify({ strategy: 'Target' }));

    const { useLaboratory } = await import('../useLaboratory');
    const { settings } = useLaboratory();

    expect(settings.value.strategy).toBe('Level Projection');
  });

  it('should hydrate from cache if tag matches', async () => {
    const cachedData = {
      profile: { name: 'Cached User', tag: '#TAG123', kingLevel: 10, xpIntoLevel: 0 },
      inventory: { gold: 100, gems: 10, wildCards: {} },
      cards: []
    };
    localStorageMock.setItem('laboratory_observation', JSON.stringify(cachedData));

    const { useLaboratory } = await import('../useLaboratory');
    const { observation } = useLaboratory();

    expect(observation.value?.profile.name).toBe('Cached User');
  });

  it('should ingest raw data and persist observation', async () => {
    const { useLaboratory } = await import('../useLaboratory');
    const { ingest, observation, settings } = useLaboratory();

    const rawProfile = { name: 'New User', tag: '#TAG123', expLevel: 5, expPoints: 0, cards: [] };
    ingest(rawProfile);

    expect(observation.value?.profile.name).toBe('New User');
    expect(observation.value?.profile.kingLevel).toBe(5);
    expect(settings.value.targetLevel).toBe(7);

    expect(localStorageMock.setItem).toHaveBeenCalledWith('laboratory_observation', expect.stringContaining('New User'));
  });

  it('should update inventory and persist changes', async () => {
    const { useLaboratory } = await import('../useLaboratory');
    const { ingest, updateInventory, observation } = useLaboratory();

    ingest({ name: 'User', tag: '#TAG123', expLevel: 14, expPoints: 0, cards: [] });

    updateInventory({ gold: 50000 });

    expect(observation.value?.inventory.gold).toBe(50000);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('laboratory_inventory', expect.stringContaining('50000'));
  });

  it('should fetch tracked player profile on demand', async () => {
    const mockProfile = { name: 'Fetched User', tag: '#TAG123', expLevel: 14, expPoints: 0, cards: [] };
    mockGetPlayerProfile.mockResolvedValue(mockProfile);

    const { useLaboratory } = await import('../useLaboratory');
    const { refresh, observation, isFetching } = useLaboratory();

    const promise = refresh();
    expect(isFetching.value).toBe(true);

    await promise;

    expect(isFetching.value).toBe(false);
    expect(observation.value?.profile.name).toBe('Fetched User');
  });

  it('should set settings and re-analyze', async () => {
    const { useLaboratory } = await import('../useLaboratory');
    const { setSettings, settings, ingest } = useLaboratory();

    ingest({ name: 'User', tag: '#TAG123', expLevel: 14, expPoints: 0, cards: [] });

    setSettings({ strategy: 'Resource Efficiency' });
    expect(settings.value.strategy).toBe('Resource Efficiency');
  });

  describe('Hardening & Sad Paths', () => {
    it('ingest: should handle ProfileHydrator failure gracefully', async () => {
      mockHydrate.mockImplementation(() => {
        throw new Error("Mock Extraction Failed");
      });

      const { useLaboratory } = await import('../useLaboratory');
      const { ingest, fetchError } = useLaboratory();

      ingest({ malformed: true });

      expect(fetchError.value).toBe("Mock Extraction Failed");
    });

    it('ingest: should process rawInventory if provided', async () => {
      // Clear mockHydrate to let actual ProfileHydrator run (which uses our mock logic's defaults)
      mockHydrate.mockReturnValue(null);

      const { useLaboratory } = await import('../useLaboratory');
      const { ingest, observation } = useLaboratory();

      const rawProfile = { name: 'New User', tag: '#TAG123', expLevel: 5, expPoints: 0, cards: [] };
      const rawInventory = { gold: 999999, wildCards: { Common: 500 } };

      ingest(rawProfile, rawInventory);

      expect(observation.value?.inventory.gold).toBe(999999);
      expect(observation.value?.inventory.wildCards.Common).toBe(500);
    });

    it('fetchTrackedPlayer: should handle API rejection', async () => {
      mockGetPlayerProfile.mockRejectedValue(new Error("API Down"));

      const { useLaboratory } = await import('../useLaboratory');
      const { refresh, fetchError, isFetching } = useLaboratory();

      await refresh();

      expect(isFetching.value).toBe(false);
      expect(fetchError.value).toBe("API Down");
    });
  });

  describe('Reactive States (layoutProps)', () => {
    it('should reflect loading state during fetch', async () => {
      mockGetPlayerProfile.mockReturnValue(new Promise(() => {})); // Never resolves

      const { useLaboratory } = await import('../useLaboratory');
      const { refresh, layoutProps } = useLaboratory();

      refresh();
      await nextTick();

      expect(layoutProps.value.loading).toBe(true);
      expect(layoutProps.value.status.type).toBe('loading');
      expect(layoutProps.value.status.text).toBe('Scanning Vault...');
    });

    it('should reflect error state', async () => {
      mockGetPlayerProfile.mockRejectedValue(new Error("Fail"));

      const { useLaboratory } = await import('../useLaboratory');
      const { refresh, layoutProps } = useLaboratory();

      await refresh();

      expect(layoutProps.value.syncError).toBe("Fail");
      expect(layoutProps.value.status.type).toBe('error');
      expect(layoutProps.value.status.text).toBe('Extraction Failed');
    });

    it('should reflect "Target Required" when no tag is present', async () => {
      mockClashData.value.playerTag = "";

      const { useLaboratory } = await import('../useLaboratory');
      const { layoutProps } = useLaboratory();

      expect(layoutProps.value.status.type).toBe('ready');
      expect(layoutProps.value.status.text).toBe('Target Required');
    });
  });
});
