// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { beforeEach, describe, expect, it, vi } from "vitest";
import { harvestGlobalPlayers, harvestSeasonPlayers } from "./harvester.ts";
import { PLAYER_LEADERBOARD_LIMIT, TARGET_HARVEST_FLOOR } from "../_shared/config.ts";

const { fetchRankings } = vi.hoisted(() => ({ fetchRankings: vi.fn() }));
vi.mock("../_shared/muscle.ts", () => ({
  fetchWithRotation: fetchRankings,
  processBatch: (tasks: Array<() => Promise<unknown>>) => Promise.all(tasks.map(task => task())),
}));

const ranking = (tag: string) => ({ tag, name: tag, rank: 1 });
const respond = (body: unknown, status = 200) => ({
  ok: status === 200, status, json: async () => body,
});

beforeEach(() => { fetchRankings.mockReset(); });

describe("completed-season recruitment fallback", () => {
  it("selects the newest API season, follows cursors, deduplicates and verifies current clan membership", async () => {
    const seasonPath = `/locations/global/pathoflegend/2026-09/rankings/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
    fetchRankings.mockImplementation(async (path: string) => {
      if (path === "/locations/global/seasons") return respond({ items: [{ id: "2026-09" }, { id: "2025-12" }] });
      if (path === seasonPath) return respond({
        items: [ranking("#FREE"), ranking("#JOINED"), { ...ranking("#CLANNED"), clan: { tag: "#CLAN" } }],
        paging: { cursors: { after: "next/+=" } },
      });
      if (path === `${seasonPath}&after=next%2F%2B%3D`) return respond({ items: [ranking("#FREE"), ranking("#LATER"), ranking("#DELETED")] });
      if (path === "/players/%23FREE") return respond({ tag: "#FREE", name: "Current name" });
      if (path === "/players/%23JOINED") return respond({ tag: "#JOINED", name: "Joined since season finish", clan: { tag: "#CLAN" } });
      if (path === "/players/%23LATER") return respond({ tag: "#LATER", name: "Later page", clan: null });
      if (path === "/players/%23DELETED") return respond({}, 404);
      throw new Error(`Unexpected path: ${path}`);
    });

    expect(await harvestSeasonPlayers(vi.fn())).toEqual({
      items: [{ tag: "#FREE", name: "Current name", clan: null }, { tag: "#LATER", name: "Later page", clan: null }],
      region: "Global (completed season 2026-09)",
    });
    expect(fetchRankings.mock.calls.filter(([path]) => path === "/players/%23FREE")).toHaveLength(1);
    expect(fetchRankings).not.toHaveBeenCalledWith("/players/%23CLANNED");
  });

  it.each([
    ["season catalog outage", respond({}, 503), /Failed to fetch completed seasons/],
    ["invalid season ID", respond({ items: [{ id: "../players" }] }), /Invalid/],
    ["empty season catalog", respond({ items: [] }), /No completed season/],
  ])("reports %s as a failure", async (_label, response, expected) => {
    fetchRankings.mockResolvedValueOnce(response);
    await expect(harvestSeasonPlayers(vi.fn())).rejects.toThrow(expected);
  });

  it("reports a profile verification outage instead of claiming no recruits exist", async () => {
    fetchRankings.mockResolvedValueOnce(respond({ items: [{ id: "2026-09" }] }))
      .mockResolvedValueOnce(respond({ items: [ranking("#FREE")] }))
      .mockResolvedValueOnce(respond({}, 503));
    await expect(harvestSeasonPlayers(vi.fn())).rejects.toThrow("Failed to verify recruit profile: 503");
  });

  it("rejects repeated pagination cursors", async () => {
    fetchRankings.mockResolvedValueOnce(respond({ items: [{ id: "2026-09" }] }))
      .mockResolvedValue(respond({ items: [ranking("#FREE")], paging: { cursors: { after: "same" } } }));
    await expect(harvestSeasonPlayers(vi.fn())).rejects.toThrow("repeated pagination cursor");
  });
});

describe("worldwide-only global harvest", () => {
  const livePath = `/locations/global/pathoflegend/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
  const seasonPath = `/locations/global/pathoflegend/2026-09/rankings/players?limit=${PLAYER_LEADERBOARD_LIMIT}`;
  const livePlayers = (count: number) => Array.from({ length: count }, (_, index) => ({ ...ranking(`#LIVE${index}`), clan: null }));

  it("returns the live board alone when it meets the floor", async () => {
    fetchRankings.mockImplementation(async (path: string) => {
      if (path === livePath) return respond({ items: livePlayers(TARGET_HARVEST_FLOOR) });
      throw new Error(`Unexpected path: ${path}`);
    });
    const result = await harvestGlobalPlayers(vi.fn());
    expect(result.region).toBe("Global");
    expect(result.items).toHaveLength(TARGET_HARVEST_FLOOR);
    expect(fetchRankings).toHaveBeenCalledTimes(1);
  });

  it("adds verified completed-season recruits after the live players when the live board is thin, without touching any country", async () => {
    fetchRankings.mockImplementation(async (path: string) => {
      if (path === livePath) return respond({ items: livePlayers(2) });
      if (path === "/locations/global/seasons") return respond({ items: [{ id: "2026-09" }] });
      if (path === seasonPath) return respond({ items: [ranking("#LIVE0"), ranking("#OLD"), ranking("#JOINED")] });
      if (path === "/players/%23LIVE0") return respond({ tag: "#LIVE0", name: "Live zero" });
      if (path === "/players/%23OLD") return respond({ tag: "#OLD", name: "Old guard" });
      if (path === "/players/%23JOINED") return respond({ tag: "#JOINED", name: "Joined", clan: { tag: "#CLAN" } });
      throw new Error(`Unexpected path: ${path}`);
    });
    const audit = vi.fn();
    const result = await harvestGlobalPlayers(audit);
    expect(result.region).toBe("Global (completed season 2026-09)");
    expect(result.items.map(item => item.tag)).toEqual(["#LIVE0", "#LIVE1", "#OLD"]);
    expect(result.items[0].name).toBe("#LIVE0");
    expect(audit).toHaveBeenCalledWith("GLOBAL_LIVE_BOARD_THIN", "run", { live: 2, floor: TARGET_HARVEST_FLOOR });
    expect(fetchRankings.mock.calls.some(([path]) => /\/locations\/\d+\//.test(String(path)))).toBe(false);
  });
});
