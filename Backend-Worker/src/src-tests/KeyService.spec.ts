// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from "vitest";
import { KeyService } from "../KeyService.js";

/**
 * ============================================================================
 * [TEST] KEY SERVICE (HARDENING)
 * ----------------------------------------------------------------------------
 * Rationale: Verify the resilience of the Key Rotation engine against
 * duplicate configurations and ensuring correct cooldown state transitions.
 * ============================================================================
 */

describe("KeyService Hardening", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("should de-duplicate keys in the constructor to prevent rate-limit bypass", () => {
    // THREAT: Duplicate keys in configuration could bypass rate-limit cooldowns.
    const rawKeys = ["KEY1", "KEY1", "KEY2"];
    const service = new KeyService(rawKeys);

    const stats = service.getPoolStats();
    expect(stats.total).toBe(2);
    expect(stats.available).toBe(2);
  });

  it("should mark a throttled key (429) as unavailable for 60 seconds", () => {
    const service = new KeyService(["KEY1"]);

    service.reportFailure("KEY1", 429);

    expect(service.getHealthyKey()).toBeNull();
    expect(service.getPoolStats().throttled).toBe(1);

    // Fast-forward 30s -> Still throttled
    vi.advanceTimersByTime(30000);
    expect(service.getHealthyKey()).toBeNull();

    // Fast-forward another 31s -> Available
    vi.advanceTimersByTime(31000);
    expect(service.getHealthyKey()).toBe("KEY1");
  });

  it("should mark a rejected key (403) as unavailable for 1 hour", () => {
    const service = new KeyService(["KEY1"]);

    service.reportFailure("KEY1", 403);

    expect(service.getHealthyKey()).toBeNull();

    // Fast-forward 30 minutes
    vi.advanceTimersByTime(30 * 60 * 1000);
    expect(service.getHealthyKey()).toBeNull();

    // Fast-forward to 61 minutes
    vi.advanceTimersByTime(31 * 60 * 1000);
    expect(service.getHealthyKey()).toBe("KEY1");
  });

  it("should apply a short penalty after 5 consecutive generic failures", () => {
    const service = new KeyService(["KEY1"]);

    // 4 failures
    for (let i = 0; i < 4; i++) {
      service.reportFailure("KEY1", 500);
      expect(service.getHealthyKey()).toBe("KEY1");
    }

    // 5th failure -> Throttled for 30s
    service.reportFailure("KEY1", 500);
    expect(service.getHealthyKey()).toBeNull();

    vi.advanceTimersByTime(31000);
    expect(service.getHealthyKey()).toBe("KEY1");
  });

  it("should reset failure count on success", () => {
    const service = new KeyService(["KEY1"]);

    for (let i = 0; i < 4; i++) {
      service.reportFailure("KEY1", 500);
    }

    service.reportSuccess("KEY1");

    // One more failure should NOT trigger the penalty (needs 5 consecutive)
    service.reportFailure("KEY1", 500);
    expect(service.getHealthyKey()).toBe("KEY1");
  });

  it("should correctly rotate between available keys", () => {
    const service = new KeyService(["KEY1", "KEY2"]);
    service.reportFailure("KEY1", 429);

    // Only KEY2 should be returned
    for (let i = 0; i < 10; i++) {
        expect(service.getHealthyKey()).toBe("KEY2");
    }
  });
});
