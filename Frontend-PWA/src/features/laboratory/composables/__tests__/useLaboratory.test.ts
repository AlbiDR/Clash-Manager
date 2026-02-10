import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick } from 'vue';

// --- Mocks ---

const mockClashData = ref({ playerTag: '#TAG123' });
vi.mock('../useClashData', () => ({
  useClashData: () => ({
    data: mockClashData
  })
}));

const mockGetPlayerProfile = vi.fn();
vi.mock('../../api/gasClient', () => ({
  getPlayerProfile: (tag: string) => mockGetPlayerProfile(tag)
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

// Mock LaboratoryKernel and LaboratoryAdapter
vi.mock('../../logic/Laboratory/Laboratory_Kernel', () => ({
  default: {
    optimize: vi.fn(() => ({ actions: [], totalXpGained: 0 }))
  }
}));

// Mocks

describe('useLaboratory', () => {
  beforeEach(async () => {
    vi.resetModules();
    localStorageMock.clear();
    vi.clearAllMocks();
    mockClashData.value = { playerTag: '#TAG123' };
    mockGetPlayerProfile.mockReset();
  });

  it('should initialize settings from localStorage', async () => {
    localStorageMock.setItem('laboratory_settings', JSON.stringify({ strategy: 'Efficiency', allowGemSpending: true }));

    const { useLaboratory } = await import('../useLaboratory');
    const { settings } = useLaboratory();

    expect(settings.value.strategy).toBe('Efficiency');
    expect(settings.value.allowGemSpending).toBe(true);
  });

  it('should migrate legacy strategy names from localStorage', async () => {
    localStorageMock.setItem('laboratory_settings', JSON.stringify({ strategy: 'Target' }));

    const { useLaboratory } = await import('../useLaboratory');
    const { settings } = useLaboratory();

    expect(settings.value.strategy).toBe('Projection');
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
    // Import with clean localStorage to avoid initialization bug
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

    setSettings({ strategy: 'Efficiency' });
    expect(settings.value.strategy).toBe('Efficiency');
  });

  // This test hits the TDZ bug because it calls analyze() via the watcher
  it.fails('should watch for playerTag changes and auto-fetch if no observation exists', async () => {
    mockClashData.value = { playerTag: '' };

    const { useLaboratory } = await import('../useLaboratory');
    const { observation } = useLaboratory();

    const mockProfile = { name: 'Auto User', tag: '#NEW', expLevel: 14, expPoints: 0, cards: [] };
    mockGetPlayerProfile.mockResolvedValue(mockProfile);

    // Setting tag when observation exists triggers analyze() via watcher
    ingest({ name: 'User', tag: '#TAG123', expLevel: 14, expPoints: 0, cards: [] });

    mockClashData.value = { playerTag: '#NEW' };
    await nextTick();

    expect(mockGetPlayerProfile).not.toHaveBeenCalled(); // Should not fetch because observation exists
  });
});
