// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { hydrateClashData } from "../useClashLoader";
import { useClashDataStore } from "../useClashDataStore";

vi.mock("../useClashDataStore", () => ({
  useClashDataStore: vi.fn(),
}));

describe("hydrateClashData", () => {
  let mockStore: {
    loadLocal: any;
    refreshFromSupabase: any;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockStore = {
      loadLocal: vi.fn().mockResolvedValue(undefined),
      refreshFromSupabase: vi.fn().mockResolvedValue(undefined),
    };
    vi.mocked(useClashDataStore).mockReturnValue(mockStore as any);
  });

  it("should orchestrate the hydration sequence by loading local data then triggering refresh", async () => {
    await hydrateClashData();

    expect(mockStore.loadLocal).toHaveBeenCalledTimes(1);
    expect(mockStore.refreshFromSupabase).toHaveBeenCalledTimes(1);
  });

  it("should await loadLocal before calling refreshFromSupabase", async () => {
    let resolveLoadLocal: (value: unknown) => void = () => {};
    const loadLocalPromise = new Promise((resolve) => {
      resolveLoadLocal = resolve;
    });
    mockStore.loadLocal.mockReturnValue(loadLocalPromise);

    const hydrationPromise = hydrateClashData();

    // Verification: refresh should not have been called yet
    expect(mockStore.loadLocal).toHaveBeenCalled();
    expect(mockStore.refreshFromSupabase).not.toHaveBeenCalled();

    // Resolve loadLocal
    resolveLoadLocal(undefined);
    await hydrationPromise;

    // Verification: refresh should now be called
    expect(mockStore.refreshFromSupabase).toHaveBeenCalled();
  });

  it("should not await refreshFromSupabase (fire-and-forget logic proof)", async () => {
    let refreshResolved = false;
    mockStore.refreshFromSupabase.mockImplementation(() => {
      return new Promise((resolve) => {
        // Delay resolution to prove it's not awaited
        setTimeout(() => {
          refreshResolved = true;
          resolve(undefined);
        }, 50);
      });
    });

    await hydrateClashData();

    // If hydrateClashData resolved, but refreshResolved is still false,
    // it proves refreshFromSupabase was not awaited.
    expect(refreshResolved).toBe(false);

    // Cleanup: wait for the pending promise to avoid vitest warnings
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(refreshResolved).toBe(true);
  });
});
