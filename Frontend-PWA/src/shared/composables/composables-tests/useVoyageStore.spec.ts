// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setActivePinia, createPinia } from "pinia";
import { useVoyageStore } from "../useVoyageStore";
import * as SupabaseClient from "@core/api/SupabaseClient";
import * as VoyageClient from "@core/api/VoyageClient";

vi.mock("@core/api/SupabaseClient", () => ({
  createSupabaseClient: vi.fn(() => ({
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn()
    }))
  }))
}));

vi.mock("@core/api/VoyageClient");

describe("useVoyageStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should initialize with default state", () => {
    const store = useVoyageStore();
    expect(store.summary).toBeNull();
    expect(store.status).toBe("IDLE");
  });

  it("should fetch and populate state on success", async () => {
    const mockSummary = {
      event: { id: 1, status: "ACTIVE", target_crowns: 1000 },
      total_voyage_crowns: 500,
      progress_ratio: 0.5
    };
    const mockContributions = [];

    vi.mocked(VoyageClient.fetchVoyageSummary).mockResolvedValue(mockSummary as any);
    vi.mocked(VoyageClient.fetchVoyageContributions).mockResolvedValue(mockContributions as any);

    const store = useVoyageStore();
    await store.refresh();

    expect(store.summary).not.toBeNull();
    expect(store.status).toBe("ACTIVE");
  });
});
