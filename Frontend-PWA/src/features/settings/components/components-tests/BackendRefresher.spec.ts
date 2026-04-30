// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { ref, nextTick } from 'vue';
import BackendRefresher from '../BackendRefresher.vue';
import { triggerBackendUpdate } from '@core/api/SupabaseClient';
import { useClashDataStore } from '@core';

// Mock SupabaseClient
vi.mock('@core/api/SupabaseClient', () => ({
  triggerBackendUpdate: vi.fn(),
  lastHubDiagnosis: ref(null)
}));

// Mock @shared to avoid icon rendering issues
vi.mock('@shared', () => ({
  Icon: {
    name: 'Icon',
    render: () => null,
    props: ['name', 'size']
  }
}));

describe('BackendRefresher.vue', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('renders three refresh targets initially in idle state', () => {
    const wrapper = mount(BackendRefresher);
    const rows = wrapper.findAll('.refresh-row');
    expect(rows).toHaveLength(3);

    const labels = rows.map(r => r.find('.row-label').text());
    expect(labels).toContain('Clan Members');
    expect(labels).toContain('Roster');
    expect(labels).toContain('Headhunters');

    const buttons = wrapper.findAll('.action-btn');
    buttons.forEach(btn => {
      expect(btn.text()).toBe('REFRESH');
      expect(btn.attributes('disabled')).toBeUndefined();
    });
  });

  it('triggers refresh for a target and enters cooldown on success', async () => {
    let resolveRefresh: (val: any) => void;
    const refreshPromise = new Promise((resolve) => {
      resolveRefresh = resolve;
    });
    vi.mocked(triggerBackendUpdate).mockReturnValue(refreshPromise as any);

    const wrapper = mount(BackendRefresher);
    const membersButton = wrapper.findAll('.action-btn').at(0)!;

    await membersButton.trigger('click');

    // Should be in loading state
    expect(triggerBackendUpdate).toHaveBeenCalledWith('members');
    expect(membersButton.attributes('disabled')).toBeDefined();
    expect(wrapper.find('.spinner').exists()).toBe(true);

    // Resolve the promise
    resolveRefresh!({
      status: 'success',
      data: { success: true, message: 'Updated' }
    });

    // Wait for the async refresh function to continue after await
    await nextTick();
    await nextTick();

    // Should enter cooldown state
    const cooldownText = wrapper.find('.cooldown-text');
    expect(cooldownText.exists()).toBe(true);
    expect(cooldownText.text()).toBe('60s');
    expect(membersButton.attributes('disabled')).toBeDefined();

    // Fast forward 30s
    vi.advanceTimersByTime(30000);
    await nextTick();
    expect(wrapper.find('.cooldown-text').text()).toBe('30s');

    // Fast forward remaining 30s
    vi.advanceTimersByTime(30000);
    await nextTick();
    expect(membersButton.text()).toBe('REFRESH');
    expect(membersButton.attributes('disabled')).toBeUndefined();
  });

  it('enters cooldown even if backend refresh fails to prevent spam', async () => {
    vi.mocked(triggerBackendUpdate).mockRejectedValue(new Error('Network error'));

    // Suppress console.error for expected failure
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(BackendRefresher);
    const rosterButton = wrapper.findAll('.action-btn').at(1)!;

    await rosterButton.trigger('click');

    await nextTick();
    await nextTick();

    expect(wrapper.find('.cooldown-text').exists()).toBe(true);
    expect(wrapper.find('.cooldown-text').text()).toBe('60s');
    expect(rosterButton.attributes('disabled')).toBeDefined();
  });

  it('renders skeletons when global isRefreshing state is true', async () => {
    const wrapper = mount(BackendRefresher);
    const store = useClashDataStore();

    store.loading = true;

    await nextTick();

    expect(wrapper.attributes('aria-busy')).toBe('true');
    expect(wrapper.find('.sk-text-line-m').exists()).toBe(true);
    expect(wrapper.find('.row-label').exists()).toBe(false);

    const firstButton = wrapper.find('.action-btn');
    expect(firstButton.classes()).toContain('skeleton-anim');
  });
});
