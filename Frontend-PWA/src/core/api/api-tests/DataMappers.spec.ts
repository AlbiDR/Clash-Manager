// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { mapSbRosterRow, mapSbHeadhunterRow } from "../DataMappers";

describe("DataMappers", () => {
  describe("mapSbRosterRow", () => {
    it("transforms a valid roster row correctly", () => {
      const row = {
        player_tag: "#ABC",
        player_name: "Hero",
        role: "elder",
        trophies: 5000,
        performance_score: 85,
        raw_performance_score: 52000,
        tenure_days: 100,
        donations: 500,
        last_seen_at: "2026-01-01T00:00:00Z",
        war_participation: 90,
        avg_fame: 2000,
        hist: "W-W-L",
        war_wins: 42,
      };

      const result = mapSbRosterRow(row as any);

      expect(result.id).toBe("ABC");
      expect(result.n).toBe("Hero");
      expect(result.t).toBe(5000);
      expect(result.performanceScore).toBe(85);
      expect(result.performanceRawScore).toBe(52000);
      expect(result.d.role).toBe("elder");
      expect(result.d.days).toBe(100);
      expect(result.d.avg).toBe(500);
      expect(result.d.seen).toBe("2026-01-01T00:00:00Z");
      expect(result.d.rate).toBe("90%");
      expect(result.d.wfame).toBe(2000);
      expect(result.d.hist).toBe("W-W-L");
      expect(result.d.war).toBe(42);
    });

    it("defaults d.war to 0 when war_wins is missing", () => {
      const row = { player_tag: "#ABC" };
      const result = mapSbRosterRow(row as any);
      expect(result.d.war).toBe(0);
    });

    it("handles missing or null fields gracefully", () => {
      const row = {
        player_tag: null,
        player_name: null,
      };

      const result = mapSbRosterRow(row as any);

      expect(result.id).toBe("");
      expect(result.n).toBe("");
      expect(result.t).toBe(0);
      expect(result.d.rate).toBe("-");
      expect(result.d.seen).toBe("-");
    });

    it("floors tenure_days and cleans player_tag", () => {
      const row = {
        player_tag: "#ABC",
        tenure_days: 100.9,
      };
      const result = mapSbRosterRow(row as any);
      expect(result.id).toBe("ABC");
      expect(result.d.days).toBe(100);
    });

    it("renders war_participation as 0% correctly", () => {
      const row = {
        war_participation: 0,
      };
      const result = mapSbRosterRow(row as any);
      expect(result.d.rate).toBe("0%");
    });

    it("falls back to week_fame if avg_fame is missing", () => {
      const row = {
        avg_fame: 0,
        week_fame: 1500,
      };
      const result = mapSbRosterRow(row as any);
      expect(result.d.wfame).toBe(1500);
    });

    it("handles voyage history (v_hist) correctly", () => {
      // Case 1: v_hist present
      const row1 = { v_hist: "S-S-F" };
      expect(mapSbRosterRow(row1 as any).d.v_hist).toBe("S-S-F");

      // Case 2: v_hist empty string
      const row2 = { v_hist: "" };
      expect(mapSbRosterRow(row2 as any).d.v_hist).toBeUndefined();

      // Case 3: v_hist missing
      const row3 = {};
      expect(mapSbRosterRow(row3 as any).d.v_hist).toBeUndefined();
    });

    it("resiliently handles malformed numeric inputs", () => {
      const row = {
        trophies: "not-a-number",
        performance_score: null,
        tenure_days: undefined,
        avg_fame: "invalid",
      };
      const result = mapSbRosterRow(row as any);
      expect(result.t).toBe(0);
      expect(result.performanceScore).toBe(0);
      expect(result.d.days).toBe(0);
      expect(result.d.wfame).toBe(0);
    });
  });

  describe("mapSbHeadhunterRow", () => {
    it("transforms a valid headhunter row correctly", () => {
      const row = {
        player_tag: "#XYZ",
        player_name: "Recruit",
        trophies: 4000,
        potential_score: 75,
        raw_potential_score: 48000,
        longevity: 120,
        longevity_label: "2h",
        tenure_days: 50,
        tenure_label: "1mo",
        last_seen_at: "2026-02-01T12:00:00Z",
        donations: 300,
        war_wins: 10,
        win_rate: 0.564,
        found_date: "2026-02-01",
        cards: 100,
      };

      const result = mapSbHeadhunterRow(row as any);

      expect(result.id).toBe("XYZ");
      expect(result.n).toBe("Recruit");
      expect(result.t).toBe(4000);
      expect(result.potentialScore).toBe(75);
      expect(result.potentialRawScore).toBe(48000);
      expect(result.longevity).toBe(120);
      expect(result.longevityLabel).toBe("2h");
      expect(result.tenureDays).toBe(50);
      expect(result.tenureLabel).toBe("1mo");
      expect(result.lastScan).toBe(new Date("2026-02-01T12:00:00Z").getTime());
      expect(result.d.don).toBe(300);
      expect(result.d.war).toBe(10);
      expect(result.d.winRate).toBe(0.564);
      expect(result.d.ago).toBe("2026-02-01");
      expect(result.d.cards).toBe(100);
    });

    it("defaults win_rate to 0 when missing", () => {
      const row = {
        player_tag: "#ABC",
        player_name: "NoWinRate",
      };
      const result = mapSbHeadhunterRow(row as any);
      expect(result.d.winRate).toBe(0);
    });

    it("handles missing or null fields gracefully", () => {
      const now = Date.now();
      const row = {
        player_tag: null,
        player_name: null,
      };

      const result = mapSbHeadhunterRow(row as any);

      expect(result.id).toBe("");
      expect(result.n).toBe("");
      expect(result.t).toBe(0);
      expect(result.lastScan).toBeGreaterThanOrEqual(now);
      expect(result.d.ago).toBe("-");
    });

    it("preserves 0 for tenure_days", () => {
      const row = {
        tenure_days: 0,
      };
      const result = mapSbHeadhunterRow(row as any);
      expect(result.tenureDays).toBe(0);
    });

    it("returns NaN for invalid last_seen_at date string", () => {
      const row = {
        last_seen_at: "not-a-date",
      };
      const result = mapSbHeadhunterRow(row as any);
      expect(result.lastScan).toBeNaN();
    });

    it("implements potential_score fallback to raw_potential_score", () => {
      // Case 1: potential_score is 0, raw is present
      const row1 = {
        potential_score: 0,
        raw_potential_score: 55000,
      };
      const res1 = mapSbHeadhunterRow(row1 as any);
      expect(res1.potentialScore).toBe(55000);
      expect(res1.potentialRawScore).toBe(55000);

      // Case 2: both present, potential_score takes precedence
      const row2 = {
        potential_score: 80,
        raw_potential_score: 55000,
      };
      const res2 = mapSbHeadhunterRow(row2 as any);
      expect(res2.potentialScore).toBe(80);
      expect(res2.potentialRawScore).toBe(55000);

      // Case 3: both null (fallback to 0)
      const row3 = {
        potential_score: null,
        raw_potential_score: null,
      };
      const res3 = mapSbHeadhunterRow(row3 as any);
      expect(res3.potentialScore).toBe(0);
    });

    it("resiliently handles malformed numeric inputs for recruits", () => {
      const row = {
        trophies: "invalid",
        longevity: null,
        donations: undefined,
        cards: "NaN",
      };
      const result = mapSbHeadhunterRow(row as any);
      expect(result.t).toBe(0);
      expect(result.longevity).toBe(0);
      expect(result.d.don).toBe(0);
      expect(result.d.cards).toBe(0);
    });
  });
});
