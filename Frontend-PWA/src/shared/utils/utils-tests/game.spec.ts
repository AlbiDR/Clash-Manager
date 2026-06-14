// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

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
