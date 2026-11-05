// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * [TEST] USE SYNTHETIC MODE TEST
 * Verifies the singleton state management for Synthetic Mode, including
 * persistence to localStorage, URL parameter extraction, showcase cascades,
 * and reactive toggling across callers.
 */

describe("useSyntheticMode", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    // Synthetic mode uses a module-level singleton state, so we must
    // reset modules between tests to ensure a clean state.
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    // Restore window.location in case any test modified or replaced it
    Object.defineProperty(window, "location", {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });

  function setWindowLocation(search: string = "", hash: string = ""): void {
    Object.defineProperty(window, "location", {
      value: {
        search,
        hash,
      },
      writable: true,
      configurable: true,
    });
  }

  it("should initialize as false when localStorage is empty and no URL query params are present", async () => {
    setWindowLocation("", "");
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

  it("should initialize as true when window.location.search contains ?synthetic=true", async () => {
    setWindowLocation("?synthetic=true", "");
    const { useSyntheticMode } = await import("../useSyntheticMode");
    const { isSyntheticMode } = useSyntheticMode();
    expect(isSyntheticMode.value).toBe(true);
  });

  it("should initialize as false when window.location.search contains ?synthetic=false or invalid value", async () => {
    setWindowLocation("?synthetic=false", "");
    const { useSyntheticMode } = await import("../useSyntheticMode");
    const { isSyntheticMode } = useSyntheticMode();
    expect(isSyntheticMode.value).toBe(false);
  });

  it("should initialize as true when window.location.hash contains hash search params with synthetic=true", async () => {
    setWindowLocation("", "#/dashboard?synthetic=true");
    const { useSyntheticMode } = await import("../useSyntheticMode");
    const { isSyntheticMode } = useSyntheticMode();
    expect(isSyntheticMode.value).toBe(true);
  });

  it("should cascade showcase=true to enable synthetic mode when localStorage is unset", async () => {
    setWindowLocation("?showcase=true", "");
    const { useSyntheticMode } = await import("../useSyntheticMode");
    const { isSyntheticMode } = useSyntheticMode();
    expect(isSyntheticMode.value).toBe(true);
  });

  it("should suppress showcase=true when localStorage explicitly sets 'false'", async () => {
    localStorage.setItem("clash_manager_synthetic_mode", "false");
    setWindowLocation("?showcase=true", "");
    const { useSyntheticMode } = await import("../useSyntheticMode");
    const { isSyntheticMode } = useSyntheticMode();
    expect(isSyntheticMode.value).toBe(false);
  });

  it("should toggle synthetic mode and update localStorage", async () => {
    setWindowLocation("", "");
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
    setWindowLocation("", "");
    const { useSyntheticMode } = await import("../useSyntheticMode");
    const { isSyntheticMode, setSyntheticMode } = useSyntheticMode();

    setSyntheticMode(true);
    expect(isSyntheticMode.value).toBe(true);
    expect(localStorage.getItem("clash_manager_synthetic_mode")).toBe("true");

    setSyntheticMode(false);
    expect(isSyntheticMode.value).toBe(false);
    expect(localStorage.getItem("clash_manager_synthetic_mode")).toBe("false");
  });

  it("should synchronize reactive singleton state across multiple composable instances", async () => {
    setWindowLocation("", "");
    const { useSyntheticMode } = await import("../useSyntheticMode");
    const instanceA = useSyntheticMode();
    const instanceB = useSyntheticMode();

    expect(instanceA.isSyntheticMode.value).toBe(false);
    expect(instanceB.isSyntheticMode.value).toBe(false);

    instanceA.toggleSyntheticMode();

    expect(instanceA.isSyntheticMode.value).toBe(true);
    expect(instanceB.isSyntheticMode.value).toBe(true);

    instanceB.setSyntheticMode(false);

    expect(instanceA.isSyntheticMode.value).toBe(false);
    expect(instanceB.isSyntheticMode.value).toBe(false);
  });
});
