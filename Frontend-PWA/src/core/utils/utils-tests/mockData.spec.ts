// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateMockData, DEFAULT_MOCK_MEMBER_COUNT, DEFAULT_MOCK_RECRUIT_COUNT } from "../mockData";
import { WebAppDataSchema } from "../../api/DataSchemas";
import * as v from "valibot";

describe("mockData", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should generate mock data with default counts", () => {
    const data = generateMockData();

    expect(data.lb).toHaveLength(DEFAULT_MOCK_MEMBER_COUNT);
    expect(data.hh).toHaveLength(DEFAULT_MOCK_RECRUIT_COUNT);
    expect(data.timestamp).toBe(new Date("2026-05-20T12:00:00Z").getTime());
  });

  it("should generate mock data with custom counts", () => {
    const customOptions = {
      memberCount: 10,
      recruitCount: 5
    };
    const data = generateMockData(customOptions);

    expect(data.lb).toHaveLength(10);
    expect(data.hh).toHaveLength(5);
  });

  it("should handle zero counts gracefully", () => {
    const data = generateMockData({ memberCount: 0, recruitCount: 0 });

    expect(data.lb).toHaveLength(0);
    expect(data.hh).toHaveLength(0);
  });

  it("should ensure leaderboard is sorted by performanceScore descending", () => {
    const data = generateMockData({ memberCount: 50 });

    for (let i = 0; i < data.lb.length - 1; i++) {
      expect(data.lb[i].performanceScore).toBeGreaterThanOrEqual(data.lb[i + 1].performanceScore);
    }
  });

  it("should ensure recruits are sorted by potentialScore descending", () => {
    const data = generateMockData({ recruitCount: 20 });

    for (let i = 0; i < data.hh.length - 1; i++) {
      expect(data.hh[i].potentialScore).toBeGreaterThanOrEqual(data.hh[i + 1].potentialScore);
    }
  });

  it("should produce data that satisfies WebAppDataSchema", () => {
    const data = generateMockData();
    const result = v.safeParse(WebAppDataSchema, data);

    if (!result.success) {
      console.error(JSON.stringify(result.issues, null, 2));
    }

    expect(result.success).toBe(true);
  });

  it("should generate unique IDs for members and recruits", () => {
    const data = generateMockData({ memberCount: 10, recruitCount: 10 });

    const memberIds = new Set(data.lb.map(m => m.id));
    const recruitIds = new Set(data.hh.map(r => r.id));

    expect(memberIds.size).toBe(10);
    expect(recruitIds.size).toBe(10);
  });

  it("should generate realistic war history for members", () => {
    const data = generateMockData({ memberCount: 1 });
    const member = data.lb[0];

    expect(member.d.hist).toBeDefined();
    // 52 weeks separated by " | "
    const entries = member.d.hist.split(" | ");
    expect(entries).toHaveLength(52);

    // Check format of an entry: "fame YYWww"
    const entryPattern = /^\d+ \d{2}W\d{2}$/;
    expect(entries[0]).toMatch(entryPattern);
  });

  it("should assign roles based on index", () => {
    // Note: lb is sorted by performanceScore, so we need to find the specific members
    // Wait, the logic in mockData.ts assigns roles in the loop BEFORE sorting.
    // i=0 is Leader, i<5 is Co-Leader, rest Member.

    // To test this reliably, we might need to find them by name if we knew their performance scores,
    // but they are random.
    // However, names are assigned in the loop as names[i] || `Knight ${i}`

    const data = generateMockData({ memberCount: 10 });

    const leader = data.lb.find(m => m.d.role === "Leader");
    const coLeaders = data.lb.filter(m => m.d.role === "Co-Leader");
    const members = data.lb.filter(m => m.d.role === "Member");

    expect(leader).toBeDefined();
    expect(coLeaders.length).toBe(4);
    expect(members.length).toBe(5);
  });
});
