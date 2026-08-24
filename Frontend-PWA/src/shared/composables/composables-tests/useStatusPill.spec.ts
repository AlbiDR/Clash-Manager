// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useStatusPill, type StatusPillProps } from '../useStatusPill';
import { reactive, nextTick, ref } from 'vue';

const isMobileNarrow = ref(false);

// No haptics mock: useStatusPill delegates haptics to the v-tactile directive
// and imports only vue + ./useViewport, so it has no haptics dependency to stub.

// Mock useViewport
vi.mock('../useViewport', () => ({
  useViewport: () => ({
    isDesktop: ref(false),
    isMobileNarrow,
  }),
}));

describe('useStatusPill', () => {
  let props: StatusPillProps;

  beforeEach(() => {
    props = reactive({
      type: 'success' as const,
      text: 'Operational',
      remoteInfo: {
        source: 'SUPABASE',
        dataAge: '2m ago',
      },
    });
    // Reset window innerWidth for responsive tests
    vi.stubGlobal('innerWidth', 1024);
  });

  it('initializes with isExpanded as false', () => {
    const { isExpanded } = useStatusPill(props);
    expect(isExpanded.value).toBe(false);
  });

  it('auto-expands when type changes to loading', async () => {
    const { isExpanded } = useStatusPill(props);
    props.type = 'loading';
    await nextTick();
    expect(isExpanded.value).toBe(true);
  });

  it('auto-expands when type changes to error', async () => {
    const { isExpanded } = useStatusPill(props);
    props.type = 'error';
    await nextTick();
    expect(isExpanded.value).toBe(true);
  });

  it('does not auto-expand when type changes to success', async () => {
    props.type = 'warning';
    const { isExpanded: _isExpanded } = useStatusPill(props);
    props.type = 'success';
    await nextTick();
    // It remains whatever it was (it doesn't auto-collapse in the implementation)
    // but the trigger for success doesn't set it to true.
    // If it started as false:
    const props2 = reactive({ type: 'warning' as const, text: 'test' });
    const { isExpanded: isExpanded2 } = useStatusPill(props2);
    props2.type = 'success';
    await nextTick();
    expect(isExpanded2.value).toBe(false);
  });

  it('toggles expansion on handleToggle', () => {
    const { isExpanded, handleToggle } = useStatusPill(props);
    handleToggle();
    expect(isExpanded.value).toBe(true);
    handleToggle();
    expect(isExpanded.value).toBe(false);
  });

  it('prevents toggle when type is loading', () => {
    props.type = 'loading';
    const { isExpanded, handleToggle } = useStatusPill(props);
    // Already expanded due to watch
    expect(isExpanded.value).toBe(true);
    handleToggle();
    expect(isExpanded.value).toBe(true); // Should stay true
  });

  it('identifies DB status correctly', () => {
    props.text = 'DB';
    const { isDB } = useStatusPill(props);
    expect(isDB.value).toBe(true);

    props.text = 'Operational';
    expect(isDB.value).toBe(false);
  });

  it('handles responsive truncation for narrow screens', () => {
    props.text = 'System Operational';
    isMobileNarrow.value = true;
    const { displayText } = useStatusPill(props);
    expect(displayText.value).toBe('Operational');
  });

  it('does not truncate on wide screens', () => {
    props.text = 'System Operational';
    isMobileNarrow.value = false;
    const { displayText } = useStatusPill(props);
    expect(displayText.value).toBe('System Operational');
  });

  it('formats displaySource correctly for Supabase redundancy', () => {
    props.text = 'DB';
    props.remoteInfo = { source: 'SUPABASE', dataAge: '1m' };
    const { displaySource } = useStatusPill(props);
    expect(displaySource.value).toBe(null); // Redundant

    props.text = 'Sync';
    const { displaySource: ds2 } = useStatusPill(props);
    expect(ds2.value).toBe('DB'); // SUPABASE -> DB
  });

  it('returns raw source if not Supabase', () => {
    props.remoteInfo = { source: 'LOCAL', dataAge: '1m' };
    const { displaySource } = useStatusPill(props);
    expect(displaySource.value).toBe('LOCAL');
  });
});
