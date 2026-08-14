// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect } from 'vitest';
import { scoreTintStyle } from '../scoreTint';

describe('Shared Score Tint Utilities', () => {
  describe('scoreTintStyle()', () => {
    it('sets --score-raw for an in-range score', () => {
      expect(scoreTintStyle(85)).toEqual({ '--score-raw': '85' });
      expect(scoreTintStyle(0)).toEqual({ '--score-raw': '0' });
      expect(scoreTintStyle(100)).toEqual({ '--score-raw': '100' });
    });

    it('clamps out-of-range scores to [0, 100]', () => {
      expect(scoreTintStyle(-15)).toEqual({ '--score-raw': '0' });
      expect(scoreTintStyle(140)).toEqual({ '--score-raw': '100' });
    });

    it('returns no style when score is undefined', () => {
      expect(scoreTintStyle(undefined)).toEqual({});
    });
  });
});
