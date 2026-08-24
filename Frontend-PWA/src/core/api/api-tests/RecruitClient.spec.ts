// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
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

// Mock Realtime Channel
const mockChannel = {
  on: vi.fn().mockReturnThis(),
  subscribe: vi.fn().mockReturnThis(),
};

// Make them fluent and thenable
[mockFrom.select, mockFrom.limit, mockFrom.eq, mockFrom.single, mockFrom.abortSignal, mockFrom.insert].forEach(m => {
  m.mockImplementation(() => {
    return Object.assign(Promise.resolve({ data: null, error: null }), mockFrom);
  });
});

// Hoisted mock client -- referenced directly in tests so vi.clearAllMocks()
// does not sever the reference to the mock factory's return value.
const mockClient = {
  rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  from: vi.fn(() => mockFrom),
  channel: vi.fn(() => mockChannel),
  removeChannel: vi.fn(),
};
(mockClient as any).schema = vi.fn(() => mockClient);

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => mockClient),
  };
});

describe("RecruitClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // vi.clearAllMocks() wipes mock implementations; restore safe defaults.
    mockClient.rpc.mockResolvedValue({ data: null, error: null });
    mockChannel.on.mockReturnThis();
    mockChannel.subscribe.mockReturnThis();
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
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });
      const ids = ['#ABC', 'XYZ'];

      await RecruitClient.undismissRecruits(ids);

      expect(mockClient.rpc).toHaveBeenCalledWith('undismiss_recruits', {
        player_tags: ['#ABC', '#XYZ']
      });
    });

    it("dismissRecruits throws NetworkError on RPC error", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { code: 'PGRST301', message: 'Timeout' } } as any);

      const items = [{ id: 'ABC', score: 80 }];
      await expect(RecruitClient.dismissRecruits(items)).rejects.toThrow();
    });

    it("undismissRecruits normalizes tags and throws NetworkError on any RPC error", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { code: '500', message: 'failed to fetch' } } as any);

      const ids = ['ABC'];
      await expect(RecruitClient.undismissRecruits(ids)).rejects.toThrow();

      // Verify tags are normalized
      expect(mockClient.rpc).toHaveBeenCalledWith('undismiss_recruits', { player_tags: ['#ABC'] });
    });

    it("dismissRecruits throws Valibot error on malformed RPC response", async () => {
      // success field is missing, which is required by DismissResponseSchema
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { count: 5 }, error: null });

      const items = [{ id: 'ABC', score: 80 }];
      await expect(RecruitClient.dismissRecruits(items)).rejects.toThrow();
    });
  });

  describe("Realtime", () => {
    it("subscribeToBlacklist sets up listeners for INSERT and DELETE", () => {
      const onInsert = vi.fn();
      const onDelete = vi.fn();

      RecruitClient.subscribeToBlacklist(onInsert, onDelete);

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        { event: 'INSERT', schema: 'drivers', table: 'recruit_blacklist' },
        expect.any(Function)
      );

      expect(mockChannel.on).toHaveBeenCalledWith(
        'postgres_changes',
        { event: 'DELETE', schema: 'drivers', table: 'recruit_blacklist' },
        expect.any(Function)
      );

      expect(mockChannel.subscribe).toHaveBeenCalled();
    });

    it("onInsert callback is triggered on INSERT event with valid payload", () => {
      const onInsert = vi.fn();
      const onDelete = vi.fn();

      RecruitClient.subscribeToBlacklist(onInsert, onDelete);

      // Find the INSERT handler
      const insertHandler = vi.mocked(mockChannel.on).mock.calls.find(
        call => call[1].event === 'INSERT'
      )![2];

      insertHandler({ new: { player_tag: '#ABC' } });
      expect(onInsert).toHaveBeenCalledWith('#ABC');

      // Invalid payload should not trigger callback
      onInsert.mockClear();
      insertHandler({ new: { invalid: true } });
      expect(onInsert).not.toHaveBeenCalled();
    });

    it("onDelete callback is triggered on DELETE event with valid payload", () => {
      const onInsert = vi.fn();
      const onDelete = vi.fn();

      RecruitClient.subscribeToBlacklist(onInsert, onDelete);

      // Find the DELETE handler
      const deleteHandler = vi.mocked(mockChannel.on).mock.calls.find(
        call => call[1].event === 'DELETE'
      )![2];

      deleteHandler({ old: { player_tag: '#XYZ' } });
      expect(onDelete).toHaveBeenCalledWith('#XYZ');

      // Invalid payload should not trigger callback
      onDelete.mockClear();
      deleteHandler({ old: {} });
      expect(onDelete).not.toHaveBeenCalled();
    });

    it("cleanup function removes the channel", () => {
      const cleanup = RecruitClient.subscribeToBlacklist(vi.fn(), vi.fn());

      cleanup();
      expect(mockClient.removeChannel).toHaveBeenCalledWith(mockChannel);
    });
  });
});
