// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { walkSource } from "@core/theme/theme-tests/style-corpus";

/**
 * The status pill caps its width (`.status-trigger { max-width }`) and
 * ellipsises the label, which is set in a monospace face, so whether a label
 * fits is a matter of its character count.
 *
 * [FIX] On the Android 16 emulator (412dp wide, 2026-10-06) Laboratory showed
 * "SCANNING VAU..." and Settings' healthy state "Systems Online" did not fit
 * either. Measured there: the indicator, chevron, gaps, padding and border
 * take 59px of the pill, and each uppercase character advances 7.15px, so a
 * label has room for 12 characters. Both measurements are of the rendered
 * pill; the cap itself is read from the component, so widening the pill
 * widens the allowance here.
 */
const PILL_CHROME_PX = 59;
const CHARACTER_ADVANCE_PX = 7.15;

const SRC = path.resolve(__dirname, "../../..");
const PILL_SOURCE = readFileSync(path.join(SRC, "shared", "ui", "StatusPill.vue"), "utf8");

function pillMaxWidthPx(): number {
  const match = PILL_SOURCE.match(/\.status-trigger\s*\{[^}]*?max-width:\s*(\d+)px/);
  if (!match) throw new Error("StatusPill.vue no longer caps .status-trigger with a px max-width");
  return Number(match[1]);
}

/** Every `{ type: <status>, text|label: "..." }` literal: the shape StatusPill renders. */
const STATUS_LABEL = /type:\s*"(?:loading|success|warning|error)",\s*(?:text|label):\s*"([^"]+)"/g;

export function statusLabels(source: string): string[] {
  return [...source.matchAll(STATUS_LABEL)].map((match) => match[1]);
}

describe("status pill labels", () => {
  const maxCharacters = Math.floor((pillMaxWidthPx() - PILL_CHROME_PX) / CHARACTER_ADVANCE_PX);

  it("finds labels written either way the producers write them", () => {
    expect(statusLabels('return { type: "loading", text: "Scanning" } as const;')).toEqual(["Scanning"]);
    expect(statusLabels('return {\n  type: "error",\n  label: "OFFLINE",\n};')).toEqual(["OFFLINE"]);
  });

  it("fit the pill without being cut off", () => {
    const labels = walkSource(SRC).flatMap((file) =>
      statusLabels(readFileSync(file, "utf8")).map((label) => ({ label, file: path.relative(SRC, file) })),
    );
    // A scan that found nothing would also report nothing too long.
    expect(labels.length).toBeGreaterThan(15);
    expect(maxCharacters).toBeGreaterThanOrEqual(10);
    const tooLong = labels.filter(({ label }) => label.length > maxCharacters).map(({ label, file }) => `${file}: "${label}"`);
    expect(tooLong).toEqual([]);
  });
});
