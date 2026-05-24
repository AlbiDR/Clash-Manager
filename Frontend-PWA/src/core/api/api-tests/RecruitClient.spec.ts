// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import * as RecruitClient from "../RecruitClient";

// Mock Supabase JS Client
const mockFrom = {
  select: vi.fn(),
  limit: vi.fn(),
  eq: vi.fn(),
  single: vi.fn(),
  abortSignal: vi.fn(),
  insert: vi.fn(),
};

// Make them fluent and thenable
[mockFrom.select, mockFrom.limit, mockFrom.eq, mockFrom.single, mockFrom.abortSignal, mockFrom.insert].forEach(m => {
  m.mockImplementation(() => {
    return Object.assign(Promise.resolve({ data: null, error: null }), mockFrom);
  });
});

vi.mock("@supabase/supabase-js", () => {
  const mockClient = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn(() => mockFrom),
  };
  (mockClient as any).schema = vi.fn(() => mockClient);

  return {
    createClient: vi.fn(() => mockClient),
  };
});

describe("RecruitClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Scouting", () => {
    it("scanRecruitsDirect returns mapped recruits", async () => {
      vi.mocked(mockFrom.limit).mockResolvedValue({
        data: [{ player_tag: '#NEW', player_name: 'Newbie', trophies: 3000 }],
        error: null
      });

      const result = await RecruitClient.scanRecruitsDirect();
      expect(result).toHaveLength(1);
      expect(result![0].n).toBe('Newbie');
    });

    it("scanRecruitsDirect returns null if fetch fails", async () => {
      vi.mocked(mockFrom.limit).mockResolvedValue({ data: null, error: { message: 'Fetch Failed' } } as any);
      const result = await RecruitClient.scanRecruitsDirect();
      expect(result).toBeNull();
    });

    it("scanRecruitsDirect uses fallback for malformed rows", async () => {
      vi.mocked(mockFrom.limit).mockResolvedValue({
        data: [{ malformed: true }],
        error: null
      });

      const result = await RecruitClient.scanRecruitsDirect();
      expect(result).toHaveLength(1);
      expect(result![0].n).toBe('');
      expect(result![0].t).toBe(0);
    });
  });

  describe("Mutations", () => {
    it("dismissRecruits normalizes player tags idempotently", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });
      const items = [{ id: '#ABC', score: 80 }, { id: 'XYZ', score: 90 }];

      await RecruitClient.dismissRecruits(items);

      expect(mockClient.rpc).toHaveBeenCalledWith('dismiss_recruits', {
        items: [
          { id: '#ABC', score: 80 },
          { id: '#XYZ', score: 90 }
        ]
      });
    });

    it("undismissRecruits normalizes player tags idempotently", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });
      const ids = ['#ABC', 'XYZ'];

      await RecruitClient.undismissRecruits(ids);

      expect(mockClient.rpc).toHaveBeenCalledWith('undismiss_recruits', {
        player_tags: ['#ABC', '#XYZ']
      });
    });

    it("dismissRecruits throws NetworkError on RPC error", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'Timeout' } } as any);

      const items = [{ id: 'ABC', score: 80 }];
      await expect(RecruitClient.dismissRecruits(items)).rejects.toThrow();
    });

    it("undismissRecruits normalizes tags and throws NetworkError on any RPC error", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { code: '500', message: 'failed to fetch' } } as any);

      const ids = ['ABC'];
      await expect(RecruitClient.undismissRecruits(ids)).rejects.toThrow();

      // Verify tags are normalized
      expect(mockClient.rpc).toHaveBeenCalledWith('undismiss_recruits', { player_tags: ['#ABC'] });
    });
  });
});
