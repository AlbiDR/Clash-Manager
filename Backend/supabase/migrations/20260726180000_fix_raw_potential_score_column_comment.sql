-- SPDX-License-Identifier: GPL-3.0-only
-- Copyright (C) 2026 AlbiDR


COMMENT ON COLUMN drivers.recruits.raw_potential_score IS 'Authoritative merit score (RPoS) calculated by the scoring kernel (calculateRpos() in _shared/utils.ts): trophies*RPOS_TROPHY_WEIGHT + lifetime_donations*RPOS_DONATION_WEIGHT + weightedWinRate*winRateWeight + legacy_war_wins*RPOS_LEGACY_WAR_WEIGHT + min(challenge_cards_won, RPOS_CHALLENGE_CARD_CAP)*RPOS_CHALLENGE_CARD_WEIGHT + grandChallengeBonus. No +500/*20 offset (removed bug).';
