// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as VoyageClient from "../VoyageClient";
import { NetworkError } from "../SupabaseClient";

// Mock Supabase JS Client
const mockFrom = {
  select: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
};

// Hoisted mock client -- referenced directly in tests so vi.clearAllMocks()
// does not sever the reference to the mock factory's return value.
const mockClient = {
  rpc: vi.fn(),
  from: vi.fn(() => mockFrom),
  schema: vi.fn(),
};
(mockClient as any).schema = vi.fn(() => mockClient);

// Make them fluent and thenable
const resetMockFrom = () => {
  [mockFrom.select, mockFrom.limit, mockFrom.maybeSingle].forEach(m => {
    m.mockReset();
    m.mockImplementation(() => {
      return Object.assign(Promise.resolve({ data: null, error: null }), mockFrom);
    });
  });
};

vi.mock("@supabase/supabase-js", () => {
  return {
    createClient: vi.fn(() => mockClient),
  };
});

describe("VoyageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // vi.clearAllMocks() wipes mock implementations; restore a safe default so
    // tests that do not override rpc still get a resolved value rather than undefined.
    mockClient.rpc.mockResolvedValue({ data: null, error: null });
    resetMockFrom();
  });

  describe("RPC Activation & Scheduling", () => {
    it("initializeVoyage calls RPC with correct params", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });

      const result = await VoyageClient.initializeVoyage(1600, "start", "end");
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true });
      expect(mockClient.rpc).toHaveBeenCalledWith("initialize_voyage", {
        target_crowns: 1600,
        start_at: "start",
        end_at: "end"
      });
    });

    it("initializeVoyage throws NetworkError on RPC error", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { message: "RPC Error" } });

      await expect(VoyageClient.initializeVoyage(1600, "start", "end")).rejects.toThrow(NetworkError);
    });

    it("scheduleVoyageEvent calls RPC with correct params", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });

      const result = await VoyageClient.scheduleVoyageEvent(1000, "future_start");
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true });
      expect(mockClient.rpc).toHaveBeenCalledWith("schedule_voyage", {
        target_crowns: 1000,
        start_at: "future_start"
      });
    });

    it("scheduleVoyageEvent throws NetworkError on RPC error", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { message: "Schedule Error" } });

      await expect(VoyageClient.scheduleVoyageEvent(1000, "future_start")).rejects.toThrow(NetworkError);
    });

    it("setVoyageEnd calls RPC with correct params", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });

      const result = await VoyageClient.setVoyageEnd(123, "end_at");
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true });
      expect(mockClient.rpc).toHaveBeenCalledWith("set_voyage_end", {
        voyage_id: 123,
        end_at: "end_at"
      });
    });

    it("setVoyageEnd throws NetworkError on RPC error", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { message: "End Error" } });

      await expect(VoyageClient.setVoyageEnd(123, "end_at")).rejects.toThrow(NetworkError);
    });

    it("cancelScheduledVoyageEvent calls RPC with correct params", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });

      const result = await VoyageClient.cancelScheduledVoyageEvent(123);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ success: true });
      expect(mockClient.rpc).toHaveBeenCalledWith("cancel_voyage", {
        voyage_id: 123
      });
    });

    it("cancelScheduledVoyageEvent throws NetworkError on RPC error", async () => {
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: null, error: { message: "Cancel Error" } });

      await expect(VoyageClient.cancelScheduledVoyageEvent(123)).rejects.toThrow(NetworkError);
    });
  });

  describe("Data Retrieval", () => {
    it("fetchVoyageSummary returns validated summary", async () => {
      const mockData = {
        event: { id: 1, clan_tag: "TAG", status: "ACTIVE", target_crowns: 1000, start_at: "...", end_at: "..." },
        total_voyage_crowns: 500,
        progress_ratio: 0.5
      };
      vi.mocked(mockFrom.maybeSingle).mockResolvedValue({ data: mockData, error: null });

      const result = await VoyageClient.fetchVoyageSummary();
      // activated_by/is_victory are optional-with-null-default on the schema,
      // so the parsed output adds them even though the raw mock omitted both.
      expect(result).toEqual({
        ...mockData,
        event: { ...mockData.event, activated_by: null, is_victory: null }
      });
    });

    it("fetchVoyageSummary returns null when no data", async () => {
      vi.mocked(mockFrom.maybeSingle).mockResolvedValue({ data: null, error: null });
      const result = await VoyageClient.fetchVoyageSummary();
      expect(result).toBeNull();
    });

    it("fetchVoyageSummary returns null when the view reports an idle event", async () => {
      // The view always emits one row; a null `event` is the no-active-voyage
      // state and must resolve to null rather than throwing a validation error.
      vi.mocked(mockFrom.maybeSingle).mockResolvedValue({
        data: { event: null, total_voyage_crowns: 0, progress_ratio: 0 } as any,
        error: null
      });
      const result = await VoyageClient.fetchVoyageSummary();
      expect(result).toBeNull();
    });

    it("fetchVoyageSummary returns null on Supabase error", async () => {
      vi.mocked(mockFrom.maybeSingle).mockResolvedValue({ data: null, error: { message: "Fetch Error" } as any });
      const result = await VoyageClient.fetchVoyageSummary();
      expect(result).toBeNull();
    });

    it("fetchVoyageSummary throws on malformed data", async () => {
      const malformedData = { event: { id: "not-a-number" } };
      vi.mocked(mockFrom.maybeSingle).mockResolvedValue({ data: malformedData as any, error: null });
      await expect(VoyageClient.fetchVoyageSummary()).rejects.toThrow();
    });

    it("fetchVoyageContributions returns validated array", async () => {
      const mockData = [{ player_tag: "TAG", total_voyage_crowns: 10, percentage_voyage_crowns: 0.01 }];
      vi.mocked(mockFrom.select).mockResolvedValue({ data: mockData, error: null });

      const result = await VoyageClient.fetchVoyageContributions();
      expect(result).toEqual(mockData);
    });

    it("fetchVoyageContributions returns empty array when no data", async () => {
      vi.mocked(mockFrom.select).mockResolvedValue({ data: null, error: null });
      const result = await VoyageClient.fetchVoyageContributions();
      expect(result).toEqual([]);
    });

    it("fetchVoyageContributions returns empty array on Supabase error", async () => {
      vi.mocked(mockFrom.select).mockResolvedValue({ data: null, error: { message: "Fetch Error" } as any });
      const result = await VoyageClient.fetchVoyageContributions();
      expect(result).toEqual([]);
    });

    it("fetchVoyageContributions throws on malformed data array", async () => {
      const malformedData = [{ player_tag: 123 }]; // should be string
      vi.mocked(mockFrom.select).mockResolvedValue({ data: malformedData as any, error: null });
      await expect(VoyageClient.fetchVoyageContributions()).rejects.toThrow();
    });
  });
});
