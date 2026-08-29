// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * [TEST] USE BLUEPRINT MODE TEST
 * Verifies the singleton state management for Blueprint Mode, including
 * persistence to localStorage, reactive toggling, URL query/hash parameter
 * initialization, and showcase mode fallback boundaries.
 */

describe("useBlueprintMode", () => {
  function setUrl(url: string) {
    delete (window as any).location;
    window.location = new URL(url, "http://localhost") as unknown as Location;
  }

  beforeEach(() => {
    // Blueprint mode uses a module-level singleton state, so we must
    // reset modules between tests to ensure a clean state.
    vi.resetModules();
    localStorage.clear();
    setUrl("http://localhost/");
  });

  it("should initialize as false when localStorage is empty and no URL params exist", async () => {
    const { useBlueprintMode } = await import("../useBlueprintMode");
    const { isBlueprintMode } = useBlueprintMode();
    expect(isBlueprintMode.value).toBe(false);
  });

  it("should initialize as true when localStorage has 'true'", async () => {
    localStorage.setItem("clash_manager_blueprint_mode", "true");
    const { useBlueprintMode } = await import("../useBlueprintMode");
    const { isBlueprintMode } = useBlueprintMode();
    expect(isBlueprintMode.value).toBe(true);
  });

  it("should initialize as true when URL search param 'blueprint' is 'true'", async () => {
    setUrl("http://localhost/?blueprint=true");
    const { useBlueprintMode } = await import("../useBlueprintMode");
    const { isBlueprintMode } = useBlueprintMode();
    expect(isBlueprintMode.value).toBe(true);
  });

  it("should initialize as true when URL hash query param 'blueprint' is 'true'", async () => {
    setUrl("http://localhost/#/dashboard?blueprint=true");
    const { useBlueprintMode } = await import("../useBlueprintMode");
    const { isBlueprintMode } = useBlueprintMode();
    expect(isBlueprintMode.value).toBe(true);
  });

  it("should initialize as true when URL search param 'showcase' is 'true' and localStorage is empty", async () => {
    setUrl("http://localhost/?showcase=true");
    const { useBlueprintMode } = await import("../useBlueprintMode");
    const { isBlueprintMode } = useBlueprintMode();
    expect(isBlueprintMode.value).toBe(true);
  });

  it("should initialize as false when 'showcase' is 'true' but localStorage is explicitly 'false'", async () => {
    localStorage.setItem("clash_manager_blueprint_mode", "false");
    setUrl("http://localhost/?showcase=true");
    const { useBlueprintMode } = await import("../useBlueprintMode");
    const { isBlueprintMode } = useBlueprintMode();
    expect(isBlueprintMode.value).toBe(false);
  });

  it("should evaluate non-'true' URL parameter values as false", async () => {
    setUrl("http://localhost/?blueprint=1&showcase=yes");
    const { useBlueprintMode } = await import("../useBlueprintMode");
    const { isBlueprintMode } = useBlueprintMode();
    expect(isBlueprintMode.value).toBe(false);
  });

  it("should toggle blueprint mode and update localStorage", async () => {
    const { useBlueprintMode } = await import("../useBlueprintMode");
    const { isBlueprintMode, toggleBlueprintMode } = useBlueprintMode();

    expect(isBlueprintMode.value).toBe(false);

    toggleBlueprintMode();
    expect(isBlueprintMode.value).toBe(true);
    expect(localStorage.getItem("clash_manager_blueprint_mode")).toBe("true");

    toggleBlueprintMode();
    expect(isBlueprintMode.value).toBe(false);
    expect(localStorage.getItem("clash_manager_blueprint_mode")).toBe("false");
  });

  it("should set blueprint mode explicitly and update localStorage", async () => {
    const { useBlueprintMode } = await import("../useBlueprintMode");
    const { isBlueprintMode, setBlueprintMode } = useBlueprintMode();

    setBlueprintMode(true);
    expect(isBlueprintMode.value).toBe(true);
    expect(localStorage.getItem("clash_manager_blueprint_mode")).toBe("true");

    setBlueprintMode(false);
    expect(isBlueprintMode.value).toBe(false);
    expect(localStorage.getItem("clash_manager_blueprint_mode")).toBe("false");
  });
});
