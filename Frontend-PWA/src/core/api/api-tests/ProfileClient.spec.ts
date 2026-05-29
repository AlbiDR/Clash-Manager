// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as ProfileClient from "../ProfileClient";

// Named Constants for compliance with "No Hardcoded Numbers" policy
const HTTP_STATUS_BAD_REQUEST = 400;
const HTTP_STATUS_NOT_FOUND = 404;

const MOCK_KING_LEVEL_FOURTEEN = 14;
const MOCK_XP_INTO_LEVEL_ZERO = 0;
const MOCK_GOLD_ZERO = 0;
const MOCK_GEMS_ZERO = 0;

const MOCK_GOLD_VALUE = 1000;
const MOCK_GEMS_VALUE = 500;
const MOCK_CARD_LEVEL_TEN = 10;
const MOCK_CARD_COUNT_FIFTY = 50;

describe("ProfileClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();

    // Stub environment variables that SupabaseClient uses (and are imported by ProfileClient)
    vi.stubEnv('VITE_SUPABASE_URL', 'https://xyz.supabase.co');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'mock-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("Profile Retrieval", () => {
    it("getPlayerProfile normalizes tags and returns profile (direct envelope)", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          profile: { tag: '#MYTAG', name: 'Me', kingLevel: MOCK_KING_LEVEL_FOURTEEN, xpIntoLevel: MOCK_XP_INTO_LEVEL_ZERO },
          cards: [],
          inventory: { gold: MOCK_GOLD_ZERO, gems: MOCK_GEMS_ZERO, wildCards: { Common: MOCK_GOLD_ZERO, Rare: MOCK_GOLD_ZERO, Epic: MOCK_GOLD_ZERO, Legendary: MOCK_GOLD_ZERO, Champion: MOCK_GOLD_ZERO } },
        }),
      } as any);

      const result = await ProfileClient.getPlayerProfile('MYTAG');
      expect(result.profile.tag).toBe('#MYTAG');
      expect(result.profile.name).toBe('Me');
      expect(result.profile.kingLevel).toBe(MOCK_KING_LEVEL_FOURTEEN);
    });

    it("getPlayerProfile normalizes tags and returns profile (wrapped envelope inside data)", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            profile: { tag: '#MYTAG', name: 'Me', kingLevel: MOCK_KING_LEVEL_FOURTEEN, xpIntoLevel: MOCK_XP_INTO_LEVEL_ZERO },
            cards: [],
            inventory: { gold: MOCK_GOLD_ZERO, gems: MOCK_GEMS_ZERO, wildCards: { Common: MOCK_GOLD_ZERO, Rare: MOCK_GOLD_ZERO, Epic: MOCK_GOLD_ZERO, Legendary: MOCK_GOLD_ZERO, Champion: MOCK_GOLD_ZERO } },
          }
        }),
      } as any);

      const result = await ProfileClient.getPlayerProfile('MYTAG');
      expect(result.profile.tag).toBe('#MYTAG');
      expect(result.profile.name).toBe('Me');
      expect(result.profile.kingLevel).toBe(MOCK_KING_LEVEL_FOURTEEN);
    });

    it("getPlayerProfile defaults optional fields correctly when partial/empty", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      } as any);

      const result = await ProfileClient.getPlayerProfile('TAG');
      expect(result.profile.name).toBe('Unknown');
      expect(result.profile.tag).toBe('TAG');
      expect(result.profile.kingLevel).toBe(1);
      expect(result.profile.xpIntoLevel).toBe(0);
      expect(result.cards).toEqual([]);
      expect(result.inventory.gold).toBe(0);
      expect(result.inventory.gems).toBe(0);
    });

    it("getPlayerProfile throws if profile not found", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: HTTP_STATUS_NOT_FOUND,
        json: async () => ({ error: 'Profile not found' }),
      } as any);

      await expect(ProfileClient.getPlayerProfile('MISSING')).rejects.toThrow('Profile not found');
    });

    it("getPlayerProfile throws if validation fails", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: HTTP_STATUS_BAD_REQUEST,
        json: async () => ({ error: 'Profile data validation failed' }),
      } as any);

      await expect(ProfileClient.getPlayerProfile('TAG')).rejects.toThrow('Profile data validation failed');
    });

    it("getPlayerProfile throws Valibot error if Edge Function returns malformed card data", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          cards: [{ level: "not-a-number" }]
        }),
      } as any);

      await expect(ProfileClient.getPlayerProfile('TAG')).rejects.toThrow();
    });

    it("getPlayerProfile throws Valibot error if Edge Function returns a non-object payload", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => "completely-invalid",
      } as any);

      await expect(ProfileClient.getPlayerProfile('TAG')).rejects.toThrow();
    });

    it("getPlayerProfile merges cards and towerTroops successfully", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          cards: [{ name: "Knight", level: MOCK_CARD_LEVEL_TEN, count: MOCK_CARD_COUNT_FIFTY, isTowerTroop: false }],
          towerTroops: [{ name: "Cannoneer", level: MOCK_CARD_LEVEL_TEN, count: MOCK_CARD_COUNT_FIFTY, isTowerTroop: true }],
          inventory: { gold: MOCK_GOLD_VALUE, gems: MOCK_GEMS_VALUE }
        }),
      } as any);

      const result = await ProfileClient.getPlayerProfile('TAG');
      expect(result.cards).toHaveLength(2);
      expect(result.cards[0].name).toBe("Knight");
      expect(result.cards[1].name).toBe("Cannoneer");
      expect(result.cards[1].isTowerTroop).toBe(true);
      expect(result.inventory.gold).toBe(MOCK_GOLD_VALUE);
      expect(result.inventory.gems).toBe(MOCK_GEMS_VALUE);
    });
  });
});
