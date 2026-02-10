import { describe, it, expect, beforeEach } from "vitest";
import { useAppSettings } from "@core";

describe("useAppSettings", () => {
  it("exports modules as a reactive object (not a Ref)", () => {
    const { modules } = useAppSettings();
    // Critical regression check: reactive objects MUST NOT be accessed via .value
    expect((modules as any).value).toBeUndefined();
    expect(modules.sortExplanation).toBeDefined();
  });

  it("toggles boolean modules correctly", () => {
    const { modules, init, toggle } = useAppSettings();
    const initial = modules.blitzMode;
    toggle("blitzMode");
    expect(modules.blitzMode).toBe(!initial);
  });
});
