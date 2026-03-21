// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, beforeEach } from "vitest";
import { Network } from "../services/Network.js";

describe("Worker Network (Quota Guard)", () => {
  beforeEach(() => {
    // Reset private state safely for testing
    (Network as any)._fetchCount = 0;
    (Network as any)._lastResetDate = new Date().toISOString().slice(0, 10);
  });

  it("should increment quota and return stats perfectly", () => {
    Network.addQuotaUsage(5);
    const stats = Network.getQuotaStats();
    expect(stats.used).toBe(5);
    expect(stats.limit).toBe(15000);
    expect(stats.remaining).toBe(14995);
  });

  it("should throw HubError when quota check is exhausted", () => {
    Network.addQuotaUsage(14999);
    
    // Should not throw
    Network.quotaCheck(1);

    // Should throw
    expect(() => Network.quotaCheck(2)).toThrowError("Daily Developer API Quota exhausted for the Autonomous Hub.");

    try {
      Network.quotaCheck(5);
    } catch (e: any) {
      expect(e.code).toBe("ERR_QUOTA_EXHAUSTED");
      expect(e.layer).toBe("WORKER_HUB");
    }
  });

  it("should implicitly reset quota if date changes", () => {
     Network.addQuotaUsage(15000);
     
     // Mock a new day
     (Network as any)._lastResetDate = "2020-01-01";
     
     // Add 1 uses new day logic, resetting count to 0, then adding 1
     Network.addQuotaUsage(1);
     
     const stats = Network.getQuotaStats();
     expect(stats.used).toBe(1);
  });
});
