// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useLaboratory } from '../useLaboratory';
import { ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';

// Mock dependencies
vi.mock('@core/services/useClashData', () => ({
  useClashData: () => ({
    data: ref({ playerTag: '#ABC' })
  })
}));

vi.mock('@core/api/SupabaseClient', () => ({
  lastSyncStatus: { value: null }
}));

vi.mock('@core/api/ProfileClient', () => ({
  getPlayerProfile: vi.fn(),
}));

// Mock the logic module
vi.mock('../../logic', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    ProfileHydrator: {
      hydrate: vi.fn((data) => ({
        profile: { kingLevel: 14, tag: '#ABC' },
        inventory: { gold: 1000, gems: 100, wildCards: {} }
      })),
      createInitialState: vi.fn(() => ({ totalXp: 0, inventory: { gold: 1000, gems: 100, wildCards: {} }, history: [] }))
    },
    calculateProgressionPath: vi.fn(() => ({
      next: () => ({ done: true, value: { totalXp: 100, inventory: { gold: 500, gems: 50, wildCards: {} }, history: [], totalGoldSpent: 500, totalGemsSpent: 50, totalWildCardsUsed: {} } })
    }))
  };
});

describe('useLaboratory handleVaultUpdate', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('should update gold via handleVaultUpdate', () => {
    const lab = useLaboratory();

    // Setup initial observation via ingest
    lab.ingest({ profile: { kingLevel: 14, tag: '#ABC' }, inventory: { gold: 1000, gems: 100, wildCards: {} } });

    lab.handleVaultUpdate('gold', 2000);

    expect(lab.observation.value?.inventory.gold).toBe(2000);
    const persisted = JSON.parse(localStorage.getItem('laboratory_inventory') || '{}');
    expect(persisted.gold).toBe(2000);
  });

  it('should update gems via handleVaultUpdate', () => {
    const lab = useLaboratory();

    lab.ingest({ profile: { kingLevel: 14, tag: '#ABC' }, inventory: { gold: 1000, gems: 100, wildCards: {} } });

    lab.handleVaultUpdate('gems', 500);

    expect(lab.observation.value?.inventory.gems).toBe(500);
    const persisted = JSON.parse(localStorage.getItem('laboratory_inventory') || '{}');
    expect(persisted.gems).toBe(500);
  });

  it('should update wildcards via handleVaultUpdate', () => {
    const lab = useLaboratory();

    lab.ingest({
      profile: { kingLevel: 14, tag: '#ABC' },
      inventory: {
        gold: 1000,
        gems: 100,
        wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0 }
      }
    });

    lab.handleVaultUpdate('wc_rare', 50);

    expect(lab.observation.value?.inventory.wildCards.Rare).toBe(50);
    const persisted = JSON.parse(localStorage.getItem('laboratory_inventory') || '{}');
    expect(persisted.wildCards.Rare).toBe(50);
  });
});
