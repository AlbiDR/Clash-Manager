// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { BOOT_INSETS_SCRIPT } from "../insetsContract";

type Bridge = { getSafeAreaInsets?: () => string };

function runBootScript() {
  // The script is inlined into <head> as plain text; run it the same way.
  new Function(BOOT_INSETS_SCRIPT)();
}

const shellInset = (side: string) => document.documentElement.style.getPropertyValue(`--shell-inset-${side}`);

describe("BOOT_INSETS_SCRIPT", () => {
  let reported: Record<string, unknown>;

  beforeEach(() => {
    document.documentElement.removeAttribute("style");
    reported = { top: 42, right: 0, bottom: 24, left: 0 };
    (window as unknown as { AndroidBridge?: Bridge }).AndroidBridge = { getSafeAreaInsets: () => JSON.stringify(reported) };
  });

  afterEach(() => {
    delete (window as unknown as { AndroidBridge?: Bridge }).AndroidBridge;
  });

  it("copies the shell's bar sizes to --shell-inset-* before first paint", () => {
    runBootScript();
    expect(shellInset("top")).toBe("42px");
    expect(shellInset("bottom")).toBe("24px");
    expect(shellInset("left")).toBe("0px");
  });

  it("reads them again on rotation or keyboard (resize) and when the shell says they changed", () => {
    runBootScript();
    reported = { top: 0, right: 48, bottom: 0, left: 0 };
    window.dispatchEvent(new Event("resize"));
    expect(shellInset("right")).toBe("48px");
    reported = { top: 42, right: 0, bottom: 0, left: 0 };
    window.dispatchEvent(new Event("shellinsetschange"));
    expect(shellInset("top")).toBe("42px");
    expect(shellInset("right")).toBe("0px");
  });

  it("ignores malformed values and sets nothing outside the shell", () => {
    reported = { top: -5, right: "12", bottom: Number.POSITIVE_INFINITY, left: null } as Record<string, unknown>;
    runBootScript();
    expect(shellInset("top")).toBe("");
    expect(shellInset("right")).toBe("");

    delete (window as unknown as { AndroidBridge?: Bridge }).AndroidBridge;
    document.documentElement.removeAttribute("style");
    runBootScript();
    expect(document.documentElement.getAttribute("style")).toBeNull();
  });
});

/**
 * env(safe-area-inset-*) alone is zero inside the Android shell, whose WebView
 * does not report its system bars, so anything placed with it lands under the
 * status or navigation bar there. The --sys-safe-* tokens combine env() with
 * what the shell reports; base.ts, which defines them, is the one place env()
 * may appear.
 */
const RAW_SAFE_AREA = /env\(\s*safe-area-inset-(top|right|bottom|left)\s*\)/;
const SRC = path.resolve(__dirname, "../../..");
const DEFINES_TOKENS = path.join("core", "theme", "base.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(vue|ts|css)$/.test(entry) && !/\.spec\.ts$/.test(entry) ? [full] : [];
  });
}

describe("safe-area placement", () => {
  it("detects a raw env(safe-area-inset-*) use", () => {
    expect(RAW_SAFE_AREA.test("bottom: calc(24px + env(safe-area-inset-bottom));")).toBe(true);
    expect(RAW_SAFE_AREA.test("bottom: calc(24px + var(--sys-safe-bottom));")).toBe(false);
  });

  it("goes through the --sys-safe-* tokens everywhere except where they are defined", () => {
    const files = sourceFiles(SRC);
    // A scan that found nothing to scan would also report no problems.
    expect(files.length).toBeGreaterThan(100);
    const offenders = files
      .filter((file) => path.relative(SRC, file) !== DEFINES_TOKENS)
      .filter((file) => RAW_SAFE_AREA.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
