// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR
import { describe, it } from 'vitest';
import { CARD_XP_TABLE } from "@core/utils/game";
import { asXP } from "@core/utils/economy";

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
