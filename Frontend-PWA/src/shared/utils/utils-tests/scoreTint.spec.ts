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

    it('handles floating point scores correctly', () => {
      expect(scoreTintStyle(42.8)).toEqual({ '--score-raw': '42.8' });
      expect(scoreTintStyle(-0.1)).toEqual({ '--score-raw': '0' });
      expect(scoreTintStyle(100.001)).toEqual({ '--score-raw': '100' });
    });

    it('handles infinite and NaN boundary inputs correctly', () => {
      expect(scoreTintStyle(Infinity)).toEqual({ '--score-raw': '100' });
      expect(scoreTintStyle(-Infinity)).toEqual({ '--score-raw': '0' });
      expect(scoreTintStyle(NaN)).toEqual({ '--score-raw': 'NaN' });
    });

    it('returns no style when score is undefined', () => {
      expect(scoreTintStyle(undefined)).toEqual({});
    });
  });
});
