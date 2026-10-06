// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { walkSource } from "./style-corpus";

/**
 * The production build minifies CSS with lightningcss, which treats a
 * prefixed declaration and its standard property as one property and keeps
 * only whichever was written last. Written standard-first, a pair loses the
 * standard declaration:
 *
 *   backdrop-filter: var(--b); -webkit-backdrop-filter: var(--b);
 *   => -webkit-backdrop-filter: var(--b)
 *
 * [FIX] Every glass surface (dock, header, sheets, dropdowns, status details)
 * was written that way. Chromium has never read -webkit-backdrop-filter, so
 * on Android and desktop Chrome none of them blurred, and the 90% white glass
 * let the list behind show through the View options sheet and the dock.
 * Written prefix-first, lightningcss keeps both, and the runtime-injected
 * base.ts styles, which skip the minifier, keep both as well.
 */
export function findStandardBeforePrefix(source: string): string[] {
  const offenders: string[] = [];
  for (const [, body] of source.matchAll(/\{([^{}]*)\}/g)) {
    const properties = body
      .split(";")
      .filter((declaration) => declaration.includes(":"))
      .map((declaration) => declaration.split(":")[0].trim());
    properties.forEach((property, index) => {
      const standard = property.replace(/^-webkit-/, "");
      if (standard !== property && properties.slice(0, index).includes(standard)) offenders.push(property);
    });
  }
  return offenders;
}

const SRC = path.resolve(__dirname, "../../..");

describe("prefixed declaration order", () => {
  it("detects a standard property written before its -webkit- copy", () => {
    expect(findStandardBeforePrefix(".a { backdrop-filter: var(--b); -webkit-backdrop-filter: var(--b); }")).toEqual(["-webkit-backdrop-filter"]);
    expect(findStandardBeforePrefix(".a { -webkit-backdrop-filter: var(--b); backdrop-filter: var(--b); }")).toEqual([]);
    expect(findStandardBeforePrefix(".a { backdrop-filter: none; } .b { -webkit-backdrop-filter: none; }")).toEqual([]);
  });

  it("writes every -webkit- copy before its standard property", () => {
    const files = walkSource(SRC);
    // A scan that found nothing to scan would also report no problems.
    expect(files.length).toBeGreaterThan(100);
    const offenders = files.flatMap((file) =>
      findStandardBeforePrefix(readFileSync(file, "utf8")).map((property) => `${path.relative(SRC, file)}: ${property}`),
    );
    expect(offenders).toEqual([]);
  });
});
