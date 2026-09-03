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
import { describe, it, expect, vi } from 'vitest';
import { useConsoleSelection } from '../useConsoleSelection';
import { ref } from 'vue';

describe('useConsoleSelection', () => {
  const mockItems = [
    { id: '1', score: 80 },
    { id: '2', score: 40 },
    { id: '3', score: 95 },
  ];
  const items = ref(mockItems);
  const batchIdMapper = (candidateItem: any) => candidateItem.id;
  const setForceSelectionMode = vi.fn();
  const selectAll = vi.fn();
  const scoreGetter = (candidateItem: any) => candidateItem.score;

  it('selects all items correctly', () => {
    const { handleSelectAll } = useConsoleSelection(
      items,
      batchIdMapper,
      setForceSelectionMode,
      selectAll
    );

    handleSelectAll();

    expect(selectAll).toHaveBeenCalledWith(['1', '2', '3']);
    expect(setForceSelectionMode).toHaveBeenCalledWith(false);
  });

  it('selects items by score (greater than or equal)', () => {
    const { handleSelectScore } = useConsoleSelection(
      items,
      batchIdMapper,
      setForceSelectionMode,
      selectAll,
      scoreGetter
    );

    handleSelectScore(80, 'ge');

    expect(selectAll).toHaveBeenCalledWith(['1', '3']);
    expect(setForceSelectionMode).toHaveBeenCalledWith(false);
  });

  it('selects items by score (less than or equal)', () => {
    const { handleSelectScore } = useConsoleSelection(
      items,
      batchIdMapper,
      setForceSelectionMode,
      selectAll,
      scoreGetter
    );

    handleSelectScore(50, 'le');

    expect(selectAll).toHaveBeenCalledWith(['2']);
    expect(setForceSelectionMode).toHaveBeenCalledWith(false);
  });

  it('forces selection mode if no items match the score threshold', () => {
    const { handleSelectScore } = useConsoleSelection(
      items,
      batchIdMapper,
      setForceSelectionMode,
      selectAll,
      scoreGetter
    );

    handleSelectScore(100, 'ge');

    expect(selectAll).toHaveBeenCalledWith([]);
    expect(setForceSelectionMode).toHaveBeenCalledWith(true);
  });

  it('uses customScoreGetter if provided', () => {
    const { handleSelectScore } = useConsoleSelection(
      items,
      batchIdMapper,
      setForceSelectionMode,
      selectAll,
      scoreGetter
    );

    const customScoreGetter = (candidateItem: any) => candidateItem.id === '2' ? 100 : 0;
    handleSelectScore(100, 'ge', customScoreGetter);

    expect(selectAll).toHaveBeenCalledWith(['2']);
  });
});
