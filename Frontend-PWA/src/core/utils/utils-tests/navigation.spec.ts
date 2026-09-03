// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment node
 *
 * No DOM in this file, so it skips jsdom entirely. Building a jsdom Window
 * costs ~410ms per test file and dominated the suite (80.6s of ~120s CPU,
 * against 8.1s of actual test execution). Adding anything here that touches
 * `document`, `window`, `localStorage` or mounts a component will fail loudly
 * and immediately - remove this docblock if that is intentional.
 */
import { describe, it, expect } from "vitest";
import { NAV_ITEMS } from "../navigation";

describe("navigation utility", () => {
  it("should have the correct number of navigation items", () => {
    expect(NAV_ITEMS.length).toBe(4);
  });

  it("should have correctly defined navigation items", () => {
    const expectedPaths = ["/roster", "/headhunter", "/laboratory", "/settings"];
    const actualPaths = NAV_ITEMS.map(item => item.path);

    expect(actualPaths).toEqual(expectedPaths);

    NAV_ITEMS.forEach(item => {
      expect(item).toHaveProperty("path");
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("label");
      expect(item).toHaveProperty("icon");
    });
  });

  it("should have unique paths and names", () => {
    const paths = NAV_ITEMS.map(item => item.path);
    const names = NAV_ITEMS.map(item => item.name);

    expect(new Set(paths).size).toBe(NAV_ITEMS.length);
    expect(new Set(names).size).toBe(NAV_ITEMS.length);
  });
});
