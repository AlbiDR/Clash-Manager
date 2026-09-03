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
import { describe, it } from 'vitest';
import { CARD_XP_TABLE } from "@core/utils/game";

describe("Calculate XP", () => {
  it("should output max XP", () => {
    let maxXPPerCard = 0;
    for (let i = 2; i <= 16; i++) {
      if (CARD_XP_TABLE[i]) maxXPPerCard += Number(CARD_XP_TABLE[i]);
    }
    console.log("Max XP per card from level 1 to 16:", maxXPPerCard);
    console.log("115 cards max XP:", maxXPPerCard * 115);
    console.log("XP needed for Level 80:", 10938770);
  });
});
