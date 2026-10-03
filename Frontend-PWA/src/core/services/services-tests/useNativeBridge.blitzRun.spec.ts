// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { BlitzRunRecord } from "@core/types";

const toast = { success: vi.fn(), info: vi.fn(), error: vi.fn() };
vi.mock("@core/services/useToast", () => ({ useToast: () => toast }));

import { useNativeBridge, resetNativeBridgeState, parseBlitzRun, describeBlitzRun } from "../useNativeBridge";

const run = (overrides: Partial<BlitzRunRecord> = {}): BlitzRunRecord => ({
  startedAt: 1_000,
  endedAt: 5_000,
  players: 10,
  opened: 10,
  invites: 10,
  outcome: "completed",
  rehearsal: false,
  ...overrides,
});

describe("parseBlitzRun", () => {
  it("reads a well-formed record", () => {
    expect(parseBlitzRun(JSON.stringify(run()))).toEqual(run());
  });

  it("treats an empty string, junk and wrong shapes as no record", () => {
    expect(parseBlitzRun("")).toBeNull();
    expect(parseBlitzRun(undefined)).toBeNull();
    expect(parseBlitzRun("{not json")).toBeNull();
    expect(parseBlitzRun(JSON.stringify({ ...run(), outcome: "exploded" }))).toBeNull();
    expect(parseBlitzRun(JSON.stringify({ ...run(), opened: -1 }))).toBeNull();
    expect(parseBlitzRun(JSON.stringify({ ...run(), players: "10" }))).toBeNull();
  });
});

describe("describeBlitzRun", () => {
  it("reports a complete run with every Invite tapped as a success", () => {
    expect(describeBlitzRun(run())).toEqual({ type: "success", message: "Blitz finished. Tapped Invite for 10 of 10 players." });
  });

  it("says when profiles opened without an Invite tap", () => {
    expect(describeBlitzRun(run({ invites: 4 }))?.message).toBe(
      "Blitz finished, but only 4 of 10 players got an Invite tap. Check the Blitz accessibility setting.",
    );
  });

  it("reports a stop, a failure, a single player and a rehearsal in plain words", () => {
    expect(describeBlitzRun(run({ outcome: "stopped", opened: 3 }))).toEqual({ type: "info", message: "Blitz stopped after 3 of 10 players." });
    expect(describeBlitzRun(run({ outcome: "failed" }))?.type).toBe("error");
    expect(describeBlitzRun(run({ players: 1, opened: 1, invites: 1 }))?.message).toBe("Blitz finished. Tapped Invite for 1 of 1 player.");
    expect(describeBlitzRun(run({ rehearsal: true }))?.message).toMatch(/^Rehearsal: Blitz finished/);
  });

  it("says nothing about a run that is still going", () => {
    expect(describeBlitzRun(run({ outcome: "running", endedAt: 0 }))).toBeNull();
  });
});

describe("reporting the last Blitz run on return to the app", () => {
  let lastRun = "";
  let onFocus: (() => void) | undefined;

  beforeEach(() => {
    resetNativeBridgeState();
    localStorage.clear();
    vi.clearAllMocks();
    lastRun = JSON.stringify(run());
    vi.stubGlobal("window", {
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event === "focus") onFocus = handler;
      }),
      location: { href: "" },
      AndroidBridge: {
        getLastBlitzRun: () => lastRun,
        getCoordinates: () => JSON.stringify({ inviteX: 0.5, inviteY: 0.6, closeX: 0.7, closeY: 0.8 }),
        isAccessibilityActive: () => true,
        hasOverlayPermission: () => true,
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports a finished run once, and a newer run again", () => {
    useNativeBridge();
    expect(toast.success).toHaveBeenCalledTimes(1);

    onFocus?.();
    expect(toast.success).toHaveBeenCalledTimes(1);

    lastRun = JSON.stringify(run({ startedAt: 6_000, endedAt: 9_000, outcome: "stopped", opened: 2 }));
    onFocus?.();
    expect(toast.info).toHaveBeenCalledWith("Blitz stopped after 2 of 10 players.");
  });

  it("does not report a run that is still going", () => {
    lastRun = JSON.stringify(run({ outcome: "running", endedAt: 0 }));
    useNativeBridge();
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  it("re-reads calibration on return, so the overlay's changes are not overwritten", () => {
    const { inviteY } = useNativeBridge();
    expect(inviteY.value).toBe(60);
    (window as unknown as { AndroidBridge: { getCoordinates: () => string } }).AndroidBridge.getCoordinates = () =>
      JSON.stringify({ inviteX: 0.5, inviteY: 0.65, closeX: 0.7, closeY: 0.8 });
    onFocus?.();
    expect(inviteY.value).toBe(65);
  });
});
