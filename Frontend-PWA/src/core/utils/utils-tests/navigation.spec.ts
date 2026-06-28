// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

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
