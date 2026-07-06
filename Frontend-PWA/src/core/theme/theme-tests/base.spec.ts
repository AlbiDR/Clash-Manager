// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { staticTokens, baseStyles } from "../base";

describe("Base Theme", () => {
  describe("staticTokens", () => {
    it("should define system layout and font variables", () => {
      expect(staticTokens).toContain("--sys-layout-max-width");
      expect(staticTokens).toContain("--sys-font-family-body");
      expect(staticTokens).toContain("--sys-font-family-mono");
    });

    it("should define a complete shape corner scale", () => {
      expect(staticTokens).toContain("--sys-shape-corner-extra-small");
      expect(staticTokens).toContain("--sys-shape-corner-medium");
      expect(staticTokens).toContain("--sys-shape-corner-large");
      expect(staticTokens).toContain("--sys-shape-corner-full");
    });

    it("should define a spacing scale on a 4px grid", () => {
      expect(staticTokens).toContain("--sys-space-4");
      expect(staticTokens).toContain("--sys-space-8");
      expect(staticTokens).toContain("--sys-space-12");
      expect(staticTokens).toContain("--sys-space-16");
    });

    it("should define a z-index stack", () => {
      expect(staticTokens).toContain("--sys-z-sticky");
      expect(staticTokens).toContain("--sys-z-dock");
      expect(staticTokens).toContain("--sys-z-toast");
      expect(staticTokens).toContain("--sys-z-overlay");
    });
  });

  describe("baseStyles", () => {
    it("should include static tokens", () => {
      expect(baseStyles).toContain("--sys-layout-max-width");
    });

    it("should implement a CSS reset", () => {
      expect(baseStyles).toContain("box-sizing: border-box");
      expect(baseStyles).toContain("margin: 0");
      expect(baseStyles).toContain("line-height: 1.5");
      expect(baseStyles).toContain("-webkit-text-size-adjust: 100%");
    });

    it("should enforce native app gestures and behavior", () => {
      expect(baseStyles).toContain("overscroll-behavior-y: contain");
      expect(baseStyles).toContain("-webkit-user-select: none");
      expect(baseStyles).toContain("-webkit-tap-highlight-color: transparent");
      expect(baseStyles).toContain("touch-action: manipulation");
    });

    it("should define local font faces", () => {
      expect(baseStyles).toContain('@font-face');
      expect(baseStyles).toContain('font-family: "Inter"');
      expect(baseStyles).toContain('font-family: "JetBrains Mono"');
    });

    it("should provide scrollable utility classes", () => {
      expect(baseStyles).toContain(".view-container");
      expect(baseStyles).toContain(".scrollable-area");
      expect(baseStyles).toContain("-webkit-overflow-scrolling: touch");
    });
  });
});
