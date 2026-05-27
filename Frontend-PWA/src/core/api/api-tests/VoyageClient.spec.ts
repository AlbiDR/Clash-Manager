// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import * as VoyageClient from "../VoyageClient";

// Mock Supabase JS Client
const mockFrom = {
  select: vi.fn(),
  limit: vi.fn(),
  maybeSingle: vi.fn(),
};

// Make them fluent and thenable
[mockFrom.select, mockFrom.limit, mockFrom.maybeSingle].forEach(m => {
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

describe("VoyageClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Event Activation", () => {
    it("initializeVoyage calls RPC with correct params", async () => {
      const mockClient = vi.mocked(createClient)();
      vi.mocked(mockClient.rpc).mockResolvedValue({ data: { success: true }, error: null });

      const result = await VoyageClient.initializeVoyage(1600, "start", "end");
      expect(result.success).toBe(true);
      expect(mockClient.rpc).toHaveBeenCalledWith("initialize_voyage", {
        target_crowns: 1600,
        start_at: "start",
        end_at: "end"
      });
    });
  });

  describe("Data Retrieval", () => {
    it("fetchVoyageSummary returns validated summary", async () => {
      const mockData = {
        event: { id: 1, clan_tag: "TAG", status: "ACTIVE", target_crowns: 1000, start_at: "...", end_at: "..." },
        total_crowns: 500,
        progress_ratio: 0.5
      };
      vi.mocked(mockFrom.maybeSingle).mockResolvedValue({ data: mockData, error: null });

      const result = await VoyageClient.fetchVoyageSummary();
      expect(result).toEqual(mockData);
    });

    it("fetchVoyageContributions returns validated array", async () => {
      const mockData = [{ player_tag: "TAG", crowns: 10, voyage_crown_pct: 0.01 }];
      vi.mocked(mockFrom.select).mockResolvedValue({ data: mockData, error: null });

      const result = await VoyageClient.fetchVoyageContributions();
      expect(result).toEqual(mockData);
    });
  });
});
