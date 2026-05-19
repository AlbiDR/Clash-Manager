// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * [TEST] USE SYNTHETIC MODE TEST
 * Verifies the singleton state management for Synthetic Mode, including
 * persistence to localStorage and reactive toggling.
 */

describe("useSyntheticMode", () => {
  beforeEach(() => {
    // Synthetic mode uses a module-level singleton state, so we must
    // reset modules between tests to ensure a clean state.
    vi.resetModules();
    localStorage.clear();
  });

  it("should initialize as false when localStorage is empty", async () => {
    const { useSyntheticMode } = await import("../useSyntheticMode");
    const { isSyntheticMode } = useSyntheticMode();
    expect(isSyntheticMode.value).toBe(false);
  });

  it("should initialize as true when localStorage has 'true'", async () => {
    localStorage.setItem("clash_manager_synthetic_mode", "true");
    const { useSyntheticMode } = await import("../useSyntheticMode");
    const { isSyntheticMode } = useSyntheticMode();
    expect(isSyntheticMode.value).toBe(true);
  });

  it("should toggle synthetic mode and update localStorage", async () => {
    const { useSyntheticMode } = await import("../useSyntheticMode");
    const { isSyntheticMode, toggleSyntheticMode } = useSyntheticMode();

    expect(isSyntheticMode.value).toBe(false);

    toggleSyntheticMode();
    expect(isSyntheticMode.value).toBe(true);
    expect(localStorage.getItem("clash_manager_synthetic_mode")).toBe("true");

    toggleSyntheticMode();
    expect(isSyntheticMode.value).toBe(false);
    expect(localStorage.getItem("clash_manager_synthetic_mode")).toBe("false");
  });

  it("should set synthetic mode explicitly and update localStorage", async () => {
    const { useSyntheticMode } = await import("../useSyntheticMode");
    const { isSyntheticMode, setSyntheticMode } = useSyntheticMode();

    setSyntheticMode(true);
    expect(isSyntheticMode.value).toBe(true);
    expect(localStorage.getItem("clash_manager_synthetic_mode")).toBe("true");

    setSyntheticMode(false);
    expect(isSyntheticMode.value).toBe(false);
    expect(localStorage.getItem("clash_manager_synthetic_mode")).toBe("false");
  });
});
