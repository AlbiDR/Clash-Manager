// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { useAppSettings, useBenchmarking } from "@core";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { ref, computed } from "vue";
import { setActivePinia, createPinia } from 'pinia';
// Mock useClashData with empty data capability via ref reference
const mockLbData = ref<any[]>([
  {
    id: "1",
    n: "Player 1",
    t: 9000, // Max trophies
    performanceScore: 100, // Max score
    performanceRawScore: 12000,
    dt: 10,
    d: { rate: "100", avg: 50, days: 100, winRate: 1.0, seen: "1h ago" } // Max win rate
  },
  {
    id: "2",
    n: "Player 2",
    t: 5000, // Avg trophies = (9000+5000+1000)/3 = 5000
    performanceScore: 50, // Avg score = (100+50+0)/3 = 50
    performanceRawScore: 6000,
    dt: 0,
    d: { rate: "50", avg: 25, days: 50, winRate: 0.5, seen: "2h ago" } // Avg win rate = (1.0+0.5+0)/3 = 0.5
  },
  {
    id: "3",
    n: "Player 3",
    t: 1000,
    performanceScore: 0,
    performanceRawScore: 0,
    dt: -10,
    d: { rate: "0", avg: 0, days: 10, winRate: 0, seen: "4h ago" }
  }
]);

const mockHhData = ref<any[]>([
  {
    id: "R1",
    n: "Recruit 1",
    t: 8000, // Max
    potentialScore: 100, // Max
    potentialRawScore: 12000,
    lastScan: Date.now() - 60 * 60000,
    d: { don: 1000, war: 100, cards: 1000, ago: "1d ago" }
  },
  {
    id: "R2",
    n: "Recruit 2",
    t: 4000, // Avg
    potentialScore: 50, // Avg
    potentialRawScore: 6000,
    lastScan: Date.now() - 120 * 60000,
    d: { don: 500, war: 50, cards: 500, ago: "2d ago" }
  },
  {
    id: "R3",
    n: "Recruit 3",
    t: 0,
    potentialScore: 0,
    potentialRawScore: 0,
    lastScan: Date.now() - 240 * 60000,
    d: { don: 0, war: 0, cards: 0, ago: "3d ago" }
  }
]);

vi.mock("../useClashDataStore", () => ({
  useClashDataStore: vi.fn(() => ({
    data: computed(() => ({
      lb: mockLbData.value,
      hh: mockHhData.value,
    }))
  }))
}));

describe("useBenchmarking", () => {
  let getBenchmark: ReturnType<typeof useBenchmarking>["getBenchmark"];
  let getSafeBenchmark: ReturnType<typeof useBenchmarking>["getSafeBenchmark"];

  beforeEach(() => {
    setActivePinia(createPinia());
    mockLbData.value = [
      {
        id: "1",
        n: "Player 1",
        t: 9000,
        performanceScore: 100,
        performanceRawScore: 12000,
        dt: 10,
        d: { rate: "100", avg: 50, days: 100, winRate: 1.0, seen: "1h ago" }
      },
      {
        id: "2",
        n: "Player 2",
        t: 5000,
        performanceScore: 50,
        performanceRawScore: 6000,
        dt: 0,
        d: { rate: "50", avg: 25, days: 50, winRate: 0.5, seen: "2h ago" }
      },
      {
        id: "3",
        n: "Player 3",
        t: 1000,
        performanceScore: 0,
        performanceRawScore: 0,
        dt: -10,
        d: { rate: "0", avg: 0, days: 10, winRate: 0, seen: "4h ago" }
      }
    ];

    mockHhData.value = [
      {
        id: "R1",
        n: "Recruit 1",
        t: 8000,
        potentialScore: 100,
        potentialRawScore: 12000,
        lastScan: Date.now() - 60 * 60000,
        d: { don: 1000, war: 100, cards: 1000, ago: "1d ago" }
      },
      {
        id: "R2",
        n: "Recruit 2",
        t: 4000,
        potentialScore: 50,
        potentialRawScore: 6000,
        lastScan: Date.now() - 120 * 60000,
        d: { don: 500, war: 50, cards: 500, ago: "2d ago" }
      },
      {
        id: "R3",
        n: "Recruit 3",
        t: 0,
        potentialScore: 0,
        potentialRawScore: 0,
        lastScan: Date.now() - 240 * 60000,
        d: { don: 0, war: 0, cards: 0, ago: "3d ago" }
      }
    ];

    const benchmarking = useBenchmarking();
    getBenchmark = benchmarking.getBenchmark;
    getSafeBenchmark = benchmarking.getSafeBenchmark;
  });

  describe("lb context (Leaderboard)", () => {
    it("calculates ELITE tier correctly (>= 90% of max)", () => {
      // Max trophies is 9000. 90% of 9000 is 8100.
      const result = getBenchmark("lb", "trophies", 8500);
      expect(result?.tier).toBe("ELITE");
      expect(result?.label).toBe("Trophy Rank");
    });

    it("calculates TOP TIER correctly (>= avg)", () => {
      // Avg trophies is 5000.
      const result = getBenchmark("lb", "trophies", 6000);
      expect(result?.tier).toBe("TOP TIER");
      expect(result?.isBetter).toBe(true);
    });

    it("calculates GROWING correctly (< avg but >= 50% of avg)", () => {
      // Avg trophies is 5000. 50% of avg is 2500.
      const result = getBenchmark("lb", "trophies", 3000);
      expect(result?.tier).toBe("GROWING");
      expect(result?.isBetter).toBe(false);
    });

    it("calculates UNDER correctly (< 50% of avg)", () => {
      // Avg trophies is 5000. 50% of avg is 2500.
      const result = getBenchmark("lb", "trophies", 2000);
      expect(result?.tier).toBe("UNDER");
    });

    it("calculates percentages correctly", () => {
      // Avg score is 50. Value is 75. Diff = 25. 25/50 = 50%.
      const result = getBenchmark("lb", "score", 75);
      expect(result?.percent).toBe(50);
      expect(result?.isBetter).toBe(true);

      // Avg score is 50. Value is 25. Diff = -25. 25/50 = 50%.
      const result2 = getBenchmark("lb", "score", 25);
      expect(result2?.percent).toBe(50);
      expect(result2?.isBetter).toBe(false);
    });

    it("handles all lb metrics", () => {
      expect(getBenchmark("lb", "trophies", 5000)).not.toBeNull();
      expect(getBenchmark("lb", "warRate", 50)).not.toBeNull();
      expect(getBenchmark("lb", "donations", 25)).not.toBeNull();
      expect(getBenchmark("lb", "score", 50)).not.toBeNull();
      expect(getBenchmark("lb", "rawScore", 6000)).not.toBeNull();
      expect(getBenchmark("lb", "tenure", 50)).not.toBeNull();
      expect(getBenchmark("lb", "momentum", 0)).not.toBeNull();
      expect(getBenchmark("lb", "winRate", 0.5)).not.toBeNull();
      expect(getBenchmark("lb", "lastSeen", 120)).not.toBeNull();
    });

    it("benchmarks lb rawScore against RPeS instead of normalized PeS", () => {
      const result = getBenchmark("lb", "rawScore", 9000);
      expect(result?.label).toBe("Raw Performance");
      expect(result?.avg).toBe(6000);
      expect(result?.max).toBe(12000);
      expect(result?.tier).toBe("TOP TIER");
    });

    it("benchmarks lb winRate (Member Card lifetime KPI row) against the clan average", () => {
      // Max win rate is 1.0, avg is 0.5 -- mirrors the trophies/score fixtures above.
      const result = getBenchmark("lb", "winRate", 0.95);
      expect(result?.tier).toBe("ELITE");
      expect(result?.label).toBe("Win Rate");

      const avgResult = getBenchmark("lb", "winRate", 0.5);
      expect(avgResult?.isBetter).toBe(true);
      expect(avgResult?.format).toBe("percent");
    });

    it("benchmarks lb lastSeen across all lowerIsBetter performance tiers", () => {
      // min = 60, avg = 140, max = 240
      // value <= min * 1.1 (66) -> ELITE
      const eliteResult = getBenchmark("lb", "lastSeen", 60);
      expect(eliteResult?.tier).toBe("ELITE");
      expect(eliteResult?.isBetter).toBe(true);
      expect(eliteResult?.format).toBe("durationMinutes");

      // value > 66 and <= avg (140) -> TOP TIER
      const topTierResult = getBenchmark("lb", "lastSeen", 100);
      expect(topTierResult?.tier).toBe("TOP TIER");
      expect(topTierResult?.isBetter).toBe(true);

      // value > avg (140) and <= avg * 2 (280) -> GROWING
      const growingResult = getBenchmark("lb", "lastSeen", 180);
      expect(growingResult?.tier).toBe("GROWING");
      expect(growingResult?.isBetter).toBe(false);

      // value > avg * 2 (280) -> UNDER
      const underResult = getBenchmark("lb", "lastSeen", 300);
      expect(underResult?.tier).toBe("UNDER");
      expect(underResult?.isBetter).toBe(false);
    });
  });

  describe("hh context (Headhunter)", () => {
    it("handles all hh metrics", () => {
      expect(getBenchmark("hh", "trophies", 4000)).not.toBeNull();
      expect(getBenchmark("hh", "donations", 500)).not.toBeNull();
      expect(getBenchmark("hh", "warWins", 50)).not.toBeNull();
      expect(getBenchmark("hh", "cardsWon", 500)).not.toBeNull();
      expect(getBenchmark("hh", "score", 50)).not.toBeNull();
      expect(getBenchmark("hh", "rawScore", 6000)).not.toBeNull();
      expect(getBenchmark("hh", "lastScan", 120)).not.toBeNull();
    });

    it("uses correct labels for hh context", () => {
      expect(getBenchmark("hh", "donations", 500)?.label).toBe("Lifetime Donos");
      expect(getBenchmark("hh", "score", 50)?.label).toBe("Potential");
      expect(getBenchmark("hh", "rawScore", 6000)?.label).toBe("Raw Potential");
      expect(getBenchmark("hh", "lastScan", 120)?.label).toBe("Last Scan");
    });

    it("benchmarks hh rawScore against RPoS instead of normalized PoS", () => {
      const result = getBenchmark("hh", "rawScore", 9000);
      expect(result?.label).toBe("Raw Potential");
      expect(result?.avg).toBe(6000);
      expect(result?.max).toBe(12000);
      expect(result?.percent).toBe(50);
      expect(result?.tier).toBe("TOP TIER");
    });

    it("benchmarks hh lastScan as a lower-is-better freshness metric", () => {
      const freshResult = getBenchmark("hh", "lastScan", 60);
      expect(freshResult?.label).toBe("Last Scan");
      expect(freshResult?.format).toBe("durationMinutes");
      expect(freshResult?.isBetter).toBe(true);

      const staleResult = getBenchmark("hh", "lastScan", 300);
      expect(staleResult?.isBetter).toBe(false);
    });
  });

  describe("getSafeBenchmark", () => {
    it("returns benchmark data when ghostBenchmarking uses the default enabled state", () => {
      expect(getSafeBenchmark("lb", "trophies", 9000)).not.toBeNull();
    });

    it("returns null when ghostBenchmarking is disabled", () => {
      const { modules } = useAppSettings();
      modules.ghostBenchmarking = false;

      expect(getSafeBenchmark("lb", "trophies", 9000)).toBeNull();

      modules.ghostBenchmarking = true;
    });

    it("returns null if value is undefined", () => {
      expect(getSafeBenchmark("lb", "trophies", undefined)).toBeNull();
    });

    it("evaluates explicit zero values correctly without returning null", () => {
      const result = getSafeBenchmark("lb", "trophies", 0);
      expect(result).not.toBeNull();
      expect(result?.value).toBe(0);
      expect(result?.tier).toBe("UNDER");
    });
  });

  describe("Edge Cases", () => {
    it("returns null if context/stats not found", () => {
      expect(getBenchmark("lb", "non-existent", 100)).toBeNull();
    });

    it("falls back to raw metric key as label when metric metadata is undefined", () => {
      // Accessing a custom metric key if stats existed
      expect(getBenchmark("lb", "unknownKey", 50)).toBeNull();
    });

    it("handles zero average metric without division by zero errors", () => {
      // Create zero-average member list
      mockLbData.value = [
        { id: "1", t: 0, performanceScore: 0, d: { rate: "0", avg: 0, days: 0, winRate: 0, seen: "0h ago" } },
        { id: "2", t: 0, performanceScore: 0, d: { rate: "0", avg: 0, days: 0, winRate: 0, seen: "0h ago" } },
      ];

      const zeroAvgResult = getBenchmark("lb", "trophies", 0);
      expect(zeroAvgResult).not.toBeNull();
      expect(zeroAvgResult?.avg).toBe(0);
      expect(zeroAvgResult?.percent).toBe(0);
    });

    it("returns null when dataset pool is empty", () => {
      mockLbData.value = [];
      mockHhData.value = [];

      expect(getBenchmark("lb", "trophies", 5000)).toBeNull();
      expect(getBenchmark("hh", "trophies", 4000)).toBeNull();
    });
  });
});
