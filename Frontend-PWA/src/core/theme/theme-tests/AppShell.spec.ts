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
import { readFileSync } from "node:fs";
import { getAppShellStyles, getAppShellHtml } from "../AppShell";
import { getIconPaths } from "../icons";
import { NAV_ITEMS } from "../../utils/navigation";

const FLOATING_DOCK_SOURCE = readFileSync(
  new URL("../../../shared/ui/FloatingDock.vue", import.meta.url),
  "utf8",
);
const NAVIGATION_DOCK_SOURCE = readFileSync(
  new URL("../../../shared/ui/NavigationDock.vue", import.meta.url),
  "utf8",
);

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
      expect(styles).toContain("--sh-text");
    });

    it("should contain critical app shell layout classes", () => {
      const styles = getAppShellStyles();
      expect(styles).toContain("#app-shell");
      expect(styles).toContain(".sh-header");
      expect(styles).toContain("#app-shell .dock-container");
      expect(styles).toContain(".sh-card");
    });

    it("keeps the skeleton clear of the system bars as the live app does", () => {
      // Edge to edge, the first frame must already sit below the status bar, stick
      // its header there and cover the bar's strip, or the page jumps (and the list
      // shows behind the clock) when the live layout takes over.
      const styles = getAppShellStyles();
      expect(styles).toMatch(/#app-shell\s*{[^}]*padding-top:\s*calc\(var\(--sys-space-12\)\s*\+\s*var\(--sys-safe-top\)\)/);
      expect(styles).toMatch(/\.sh-header\s*{[^}]*top:\s*var\(--sys-safe-top\)/);
      expect(styles).toMatch(/body::before\s*{[^}]*height:\s*var\(--sys-safe-top\)/);
    });

    it("should contain pulse animation for skeleton states", () => {
      const styles = getAppShellStyles();
      expect(styles).toContain("@keyframes sh-pulse");
      expect(styles).toContain(".sh-pulse");
    });

    it("sources first-paint and live dock geometry from the same tokens", () => {
      const styles = getAppShellStyles();
      const sharedTokens = [
        "--sys-surface-glass",
        "--sys-surface-glass-blur",
        "--sys-surface-glass-border",
        "--sys-border-width-glass",
        "--sys-elevation-3",
        "--sys-layout-dock-compact-max-width",
      ];
      const itemTokens = [
        "--sys-layout-dock-item-min-width",
        "--sys-layout-dock-icon-size",
        "--sys-layout-dock-label-max-width",
        "--sys-layout-dock-active-grow",
        "--sys-layout-dock-compact-active-grow",
        "--sys-font-weight-dock",
        "--sys-elevation-dock-active",
        "--sys-opacity-dock-placeholder",
      ];

      for (const token of sharedTokens) {
        expect(styles).toContain(`var(${token})`);
        expect(FLOATING_DOCK_SOURCE).toContain(`var(${token})`);
      }
      for (const token of itemTokens) {
        expect(styles).toContain(`var(${token})`);
        expect(NAVIGATION_DOCK_SOURCE).toContain(`var(${token})`);
      }

      const shellBreakpoint = styles.match(/@media \(max-width:\s*([^)]+)\)/)?.[1];
      const liveBreakpoint = FLOATING_DOCK_SOURCE.match(/@media \(max-width:\s*([^)]+)\)/)?.[1];
      const itemBreakpoint = NAVIGATION_DOCK_SOURCE.match(/@media \(max-width:\s*([^)]+)\)/)?.[1];
      expect(shellBreakpoint).toBe(liveBreakpoint);
      expect(shellBreakpoint).toBe(itemBreakpoint);
      expect(FLOATING_DOCK_SOURCE).not.toContain("96%");
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

    it("renders the same semantic navigation structure as the live dock", () => {
      const html = getAppShellHtml();
      expect(html).toContain('class="dock-container"');
      expect(html).toContain('<nav class="dock-mode" aria-label="Main navigation">');

      const buttons = Array.from(html.matchAll(/<button\b([^>]*)>/g));
      expect(buttons).toHaveLength(NAV_ITEMS.length);

      NAV_ITEMS.forEach((item, index) => {
        const attributes = buttons[index][1];
        expect(attributes).toContain('type="button"');
        expect(attributes).toContain(`aria-label="${item.label}"`);
        expect(attributes.includes('aria-current="page"')).toBe(index === 0);
      });
    });

    it("defers SVG to Icon.vue while preserving each icon footprint", () => {
      const html = getAppShellHtml();
      expect(html).not.toContain("<svg");
      expect(html).not.toContain("<path");
      expect(html.match(/class="dock-icon dock-icon-placeholder"/g)).toHaveLength(NAV_ITEMS.length);
      expect(NAVIGATION_DOCK_SOURCE).toMatch(/<Icon\s+v-if="areIconsMounted"/);
      expect(NAVIGATION_DOCK_SOURCE).toMatch(/<span\s+v-else\s+class="dock-icon dock-icon-placeholder"/);
      NAV_ITEMS.forEach((item) => {
        expect(getIconPaths(item.icon).length, `${item.icon} is missing from the live registry`).toBeGreaterThan(0);
      });
    });
  });
});
