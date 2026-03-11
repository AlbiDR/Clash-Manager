// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import ErrorBoundary from '../ErrorBoundary.vue';
import { defineComponent, h, nextTick } from 'vue';

/**
 * HELPER: BuggyComponent
 * A component that intentionally throws an error during render to trigger the ErrorBoundary.
 */
const BuggyComponent = defineComponent({
  name: 'BuggyComponent',
  render() {
    throw new Error('Test Error');
  }
});

describe('ErrorBoundary.vue', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock window.location.reload
    const mockReload = vi.fn();
    vi.stubGlobal('location', {
      ...window.location,
      reload: mockReload
    });

    // Mock sessionStorage.clear
    vi.spyOn(Storage.prototype, 'clear');
  });

  it('renders slot content when no error occurs', () => {
    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: '<div class="content">System Operational</div>'
      }
    });

    expect(wrapper.find('.content').exists()).toBe(true);
    expect(wrapper.find('.content').text()).toBe('System Operational');
    expect(wrapper.find('.error-boundary').exists()).toBe(false);
  });

  it('captures error from child and displays error UI', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: h(BuggyComponent)
      }
    });

    await nextTick();

    expect(wrapper.find('.error-boundary').exists()).toBe(true);
    expect(wrapper.find('h2').text()).toBe('System Resilience');
    expect(wrapper.find('.error-details').text()).toContain('Test Error');
    expect(consoleSpy).toHaveBeenCalledWith('[GUARD] CAPTURED BY ERRORBOUNDARY:', expect.any(Error));

    consoleSpy.mockRestore();
  });

  it('copies error details to clipboard when copy button is clicked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true
    });

    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: h(BuggyComponent)
      }
    });

    await nextTick();

    const copyBtn = wrapper.find('.copy-btn');
    await copyBtn.trigger('click');

    // Wait for the async copyError to complete and state to update
    await nextTick();
    await nextTick();

    expect(writeTextMock).toHaveBeenCalled();
    expect(copyBtn.classes()).toContain('copied');
  });

  it('resets system and reloads page when recover button is clicked', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const wrapper = mount(ErrorBoundary, {
      slots: {
        default: h(BuggyComponent)
      }
    });

    await nextTick();

    const recoverBtn = wrapper.find('.recover-btn');
    await recoverBtn.trigger('click');

    expect(sessionStorage.clear).toHaveBeenCalled();
    expect(window.location.reload).toHaveBeenCalled();
  });
});
