// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("useMotionPreference", () => {
  beforeEach(() => {
    vi.resetModules();
    localStorage.clear();
    document.documentElement.removeAttribute("data-motion-preference");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("follows the device by default and applies an explicit root contract", async () => {
    const { useMotionPreference } = await import("../useMotionPreference");
    const { motionPreference, init } = useMotionPreference();

    init();

    expect(motionPreference.value).toBe("system");
    expect(document.documentElement.dataset.motionPreference).toBe("system");
  });

  it("persists a manually reduced preference and applies it immediately", async () => {
    const { useMotionPreference } = await import("../useMotionPreference");
    const { motionPreference, setMotionPreference } = useMotionPreference();

    setMotionPreference("reduced");

    expect(motionPreference.value).toBe("reduced");
    expect(localStorage.getItem("cm_motion_preference")).toBe("reduced");
    expect(document.documentElement.dataset.motionPreference).toBe("reduced");
  });

  it("repairs malformed storage to the safe system default", async () => {
    localStorage.setItem("cm_motion_preference", "fast-and-furious");
    const { useMotionPreference } = await import("../useMotionPreference");
    const { motionPreference, init } = useMotionPreference();

    init();

    expect(motionPreference.value).toBe("system");
    expect(document.documentElement.dataset.motionPreference).toBe("system");
  });
});
