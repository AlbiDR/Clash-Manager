
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processBatch } from '../index';

describe('Worker Hygiene Logic', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('should filter out players who are in a clan during scoring phase', async () => {
    // Mock profile fetch
    const mockProfile = {
      tag: '#PLAYER1',
      name: 'Test Player',
      trophies: 6500,
      totalDonations: 1000,
      warDayWins: 50,
      challengeCardsWon: 10000,
      clan: { tag: '#CLAN1', name: 'Some Clan' } // PLAYER IS IN A CLAN
    };

    // Mock battlelog fetch
    const mockLogs = [
      { type: 'riverRacePvP', battleTime: '20240101T000000.000Z' }
    ];

    (global.fetch as any)
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify(mockProfile)
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify(mockLogs)
      });

    const urls = ['https://proxy.royaleapi.dev/v1/players/%23PLAYER1'];
    const scoring = { TROPHY: 1.0, DON: 0.1, WAR: 10.0, WAR_BASELINE_BONUS: 500 };
    
    // Concurrency 1 for predictable order
    const results = await processBatch(urls, ['fake-key'], 1, scoring);

    // Should be empty because the player was filtered out
    expect(results).toHaveLength(0);
  });

  it('should allow players who are clanless during scoring phase', async () => {
    // Mock profile fetch (NO CLAN)
    const mockProfile = {
      tag: '#PLAYER2',
      name: 'Clanless Hero',
      trophies: 6500,
      totalDonations: 1000,
      warDayWins: 50,
      challengeCardsWon: 10000
    };

    (global.fetch as any)
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify(mockProfile)
      })
      .mockResolvedValueOnce({
        status: 200,
        text: async () => JSON.stringify([])
      });

    const urls = ['https://proxy.royaleapi.dev/v1/players/%23PLAYER2'];
    const scoring = { TROPHY: 1.0, DON: 0.1, WAR: 10.0, WAR_BASELINE_BONUS: 500 };
    
    const results = await processBatch(urls, ['fake-key'], 1, scoring);

    expect(results).toHaveLength(1);
    expect((results[0].content as any).tag).toBe('#PLAYER2');
    expect((results[0].content as any).clan).toBeNull();
  });
});
