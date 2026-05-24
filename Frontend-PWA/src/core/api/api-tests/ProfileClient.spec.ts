// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as ProfileClient from "../ProfileClient";

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
    it("getPlayerProfile normalizes tags and returns profile", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: async () => ({
          profile: { tag: '#MYTAG', name: 'Me', kingLevel: 14, xpIntoLevel: 0 },
          cards: [],
          inventory: { gold: 0, gems: 0, wildCards: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Champion: 0 } },
        }),
      } as any);

      const result = await ProfileClient.getPlayerProfile('MYTAG');
      expect(result.profile.tag).toBe('#MYTAG');
      expect(result.profile.name).toBe('Me');
      expect(result.profile.kingLevel).toBe(14);
    });

    it("getPlayerProfile throws if profile not found", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Profile not found' }),
      } as any);

      await expect(ProfileClient.getPlayerProfile('MISSING')).rejects.toThrow('Profile not found');
    });

    it("getPlayerProfile throws if validation fails", async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 400,
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
  });
});
