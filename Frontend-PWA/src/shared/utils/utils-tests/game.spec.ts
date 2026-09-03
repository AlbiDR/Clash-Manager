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
import { describe, it, expect } from 'vitest';
import { formatRole } from '../game';

describe('Shared Game Utilities', () => {
  describe('formatRole()', () => {
    it('identifies Leader', () => {
      expect(formatRole('Leader')).toEqual({ label: 'Leader', class: 'role-leader' });
      expect(formatRole('leader')).toEqual({ label: 'Leader', class: 'role-leader' });
    });

    it('identifies Co-Leader variations', () => {
      expect(formatRole('Co-Leader')).toEqual({ label: 'Co-Lead', class: 'role-coleader' });
      expect(formatRole('coleader')).toEqual({ label: 'Co-Lead', class: 'role-coleader' });
    });

    it('identifies Elder', () => {
      expect(formatRole('Elder')).toEqual({ label: 'Elder', class: 'role-elder' });
    });

    it('defaults to Member', () => {
      expect(formatRole('Member')).toEqual({ label: 'Member', class: 'role-member' });
      expect(formatRole('')).toEqual({ label: 'Member', class: 'role-member' });
      expect(formatRole('Newbie')).toEqual({ label: 'Member', class: 'role-member' });
    });
  });
});
