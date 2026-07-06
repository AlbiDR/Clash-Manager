// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { getAppShellStyles, getAppShellHtml } from "../AppShell";

describe("AppShell", () => {
  describe("getAppShellStyles", () => {
    it("should return a non-empty string of CSS", () => {
      const styles = getAppShellStyles();
      expect(typeof styles).toBe("string");
      expect(styles.length).toBeGreaterThan(0);
    });

    it("should contain root and dark mode theme variables", () => {
      const styles = getAppShellStyles();
      expect(styles).toContain(":root");
      expect(styles).toContain("html.dark");
      expect(styles).toContain("--sh-bg");
      expect(styles).toContain("--sh-primary");
    });

    it("should contain critical app shell layout classes", () => {
      const styles = getAppShellStyles();
      expect(styles).toContain("#app-shell");
      expect(styles).toContain(".sh-header");
      expect(styles).toContain(".sh-dock");
      expect(styles).toContain(".sh-card");
    });

    it("should contain pulse animation for skeleton states", () => {
      const styles = getAppShellStyles();
      expect(styles).toContain("@keyframes sh-pulse");
      expect(styles).toContain(".sh-pulse");
    });
  });

  describe("getAppShellHtml", () => {
    it("should return a non-empty string of HTML", () => {
      const html = getAppShellHtml();
      expect(typeof html).toBe("string");
      expect(html.length).toBeGreaterThan(0);
    });

    it("should contain the main app shell container", () => {
      const html = getAppShellHtml();
      expect(html).toContain('<main id="app-shell">');
    });

    it("should contain the header with a title", () => {
      const html = getAppShellHtml();
      expect(html).toContain('class="sh-header"');
      expect(html).toContain('class="view-title"');
    });

    it("should contain a list of skeleton cards", () => {
      const html = getAppShellHtml();
      expect(html).toContain('class="sh-list"');
      expect(html).toContain('class="sh-card sh-pulse"');
      // Should have multiple cards (at least 8 as per implementation)
      const cardCount = (html.match(/class="sh-card sh-pulse"/g) || []).length;
      expect(cardCount).toBeGreaterThanOrEqual(8);
    });

    it("should contain the navigation dock with icons", () => {
      const html = getAppShellHtml();
      expect(html).toContain('class="sh-dock"');
      expect(html).toContain('role="navigation"');
      expect(html).toContain("<svg");
      expect(html).toContain("Roster");
    });
  });
});
