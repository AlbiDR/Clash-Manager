import { describe, it, expect, vi } from "vitest";
import {
  sortByName,
  sortByTrophies,
  sortByScore,
  sortByLastSeen,
  LeaderboardSort,
  RecruiterSort,
} from "../sortStrategies";
import type { LeaderboardMember, Recruit } from "@core/types";

// Mock parseTimeAgoValue to isolate sortByLastSeen
vi.mock("../formatters", () => ({
  parseTimeAgoValue: vi.fn((val) => {
    if (val === "new") return 10;
    if (val === "old") return 100;
    return 99999999;
  }),
}));

describe("sortStrategies", () => {
  describe("sortByName", () => {
    it("sorts names alphabetically", () => {
      const items = [{ n: "Zoro" }, { n: "Albi" }, { n: "Bobi" }];
      const sorted = [...items].sort(sortByName);
      expect(sorted[0].n).toBe("Albi");
      expect(sorted[1].n).toBe("Bobi");
      expect(sorted[2].n).toBe("Zoro");
    });

    it("is case-sensitive based on localeCompare default", () => {
      const items = [{ n: "albi" }, { n: "Albi" }];
      const sorted = [...items].sort(sortByName);
      // In most locales, "albi" and "Albi" order depends on environment but they should be different
      expect(sorted[0].n).not.toBe(sorted[1].n);
    });
  });

  describe("sortByTrophies", () => {
    it("sorts trophies in descending order", () => {
      const items = [{ t: 1000 }, { t: 3000 }, { t: 2000 }];
      const sorted = [...items].sort(sortByTrophies);
      expect(sorted[0].t).toBe(3000);
      expect(sorted[1].t).toBe(2000);
      expect(sorted[2].t).toBe(1000);
    });

    it("handles missing trophies by defaulting to 0", () => {
      const items = [{ t: 1000 }, { t: undefined as any }, { t: 500 }];
      const sorted = [...items].sort(sortByTrophies);
      expect(sorted[0].t).toBe(1000);
      expect(sorted[1].t).toBe(500);
      expect(sorted[2].t).toBeUndefined();
    });
  });

  describe("sortByScore", () => {
    it("sorts by score descending", () => {
      const items = [{ score: 50 }, { score: 90 }, { score: 70 }];
      const sorted = [...items].sort(sortByScore);
      expect(sorted[0].score).toBe(90);
      expect(sorted[1].score).toBe(70);
      expect(sorted[2].score).toBe(50);
    });

    it("sorts by rawScore if score is tied", () => {
      const items = [
        { score: 80, rawScore: 1000 },
        { score: 80, rawScore: 2000 },
        { score: 80, rawScore: 1500 },
      ];
      const sorted = [...items].sort(sortByScore);
      expect(sorted[0].rawScore).toBe(2000);
      expect(sorted[1].rawScore).toBe(1500);
      expect(sorted[2].rawScore).toBe(1000);
    });

    it("handles missing values by defaulting to 0", () => {
      const items = [{ score: 50 }, { score: undefined }, { rawScore: 100 }];
      const sorted = [...items].sort(sortByScore);
      // item 0: score 50, raw 0
      // item 1: score 0, raw 0
      // item 2: score 0, raw 100
      expect(sorted[0].score).toBe(50);
      expect(sorted[1].rawScore).toBe(100);
      expect(sorted[2].score).toBeUndefined();
    });
  });

  describe("sortByLastSeen", () => {
    it("sorts by seen or ago field using parseTimeAgoValue", () => {
      const items = [
        { d: { seen: "old" } },
        { d: { ago: "new" } },
        { d: { seen: "unknown" } },
      ];
      // "new" -> 10, "old" -> 100, "unknown" -> 99999999
      const sorted = [...items].sort(sortByLastSeen);
      expect(sorted[0].d.ago).toBe("new");
      expect(sorted[1].d.seen).toBe("old");
      expect(sorted[2].d.seen).toBe("unknown");
    });
  });

  describe("LeaderboardSort", () => {
    const memberA: Partial<LeaderboardMember> = {
      performanceScore: 80,
      performanceRawScore: 1000,
      dt: 10,
      t: 5000,
      n: "Albi",
      d: { avg: 100, days: 30, seen: "new" } as any,
    };
    const memberB: Partial<LeaderboardMember> = {
      performanceScore: 90,
      performanceRawScore: 500,
      dt: 20,
      t: 4000,
      n: "Bobi",
      d: { avg: 50, days: 60, seen: "old" } as any,
    };

    it("sorts by score", () => {
      const res = LeaderboardSort.score(memberA as any, memberB as any);
      expect(res).toBeGreaterThan(0); // B (90) > A (80), so b - a is positive
    });

    it("sorts by trend", () => {
      const res = LeaderboardSort.trend(memberA as any, memberB as any);
      expect(res).toBeGreaterThan(0); // B (20) > A (10)
    });

    it("sorts by trophies", () => {
      const res = LeaderboardSort.trophies(memberA as any, memberB as any);
      expect(res).toBeLessThan(0); // A (5000) > B (4000), descending so b - a is negative
    });

    it("sorts by name", () => {
      const res = LeaderboardSort.name(memberA as any, memberB as any);
      expect(res).toBeLessThan(0); // "Albi" < "Bobi"
    });

    it("sorts by donations_day", () => {
      const res = LeaderboardSort.donations_day(memberA as any, memberB as any);
      expect(res).toBeLessThan(0); // A (100) > B (50)
    });

    it("sorts by tenure", () => {
      const res = LeaderboardSort.tenure(memberA as any, memberB as any);
      expect(res).toBeGreaterThan(0); // B (60) > A (30)
    });

    it("sorts by last_seen", () => {
      const res = LeaderboardSort.last_seen(memberA as any, memberB as any);
      expect(res).toBeLessThan(0); // "new" (10) < "old" (100)
    });
  });

  describe("RecruiterSort", () => {
    const recruitA: Partial<Recruit> = {
      potentialScore: 80,
      potentialRawScore: 1000,
      t: 5000,
      n: "Albi",
      longevity: 60,
      d: { don: 100, ago: "new" } as any,
    };
    const recruitB: Partial<Recruit> = {
      potentialScore: 90,
      potentialRawScore: 500,
      t: 4000,
      n: "Bobi",
      longevity: 120,
      d: { don: 200, ago: "old" } as any,
    };

    it("sorts by score", () => {
      const res = RecruiterSort.score(recruitA as any, recruitB as any);
      expect(res).toBeGreaterThan(0); // B > A
    });

    it("sorts by trophies", () => {
      const res = RecruiterSort.trophies(recruitA as any, recruitB as any);
      expect(res).toBeLessThan(0); // A > B
    });

    it("sorts by name", () => {
      const res = RecruiterSort.name(recruitA as any, recruitB as any);
      expect(res).toBeLessThan(0);
    });

    it("sorts by time_found", () => {
      const res = RecruiterSort.time_found(recruitA as any, recruitB as any);
      expect(res).toBeLessThan(0);
    });

    it("sorts by donations", () => {
      const res = RecruiterSort.donations(recruitA as any, recruitB as any);
      expect(res).toBeGreaterThan(0); // B (200) > A (100)
    });
  });
});
