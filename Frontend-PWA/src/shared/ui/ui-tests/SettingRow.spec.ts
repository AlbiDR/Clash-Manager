// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import SettingRow from '../SettingRow.vue';

describe('SettingRow.vue', () => {
  it('renders label and description props correctly', () => {
    const wrapper = shallowMount(SettingRow, {
      props: {
        label: 'Test Label',
        description: 'Test Description'
      }
    });

    expect(wrapper.find('.row-label').text()).toBe('Test Label');
    expect(wrapper.find('.row-desc').text()).toBe('Test Description');
  });

  it('renders slot content correctly and overrides props', () => {
    const wrapper = shallowMount(SettingRow, {
      props: {
        label: 'Prop Label',
        description: 'Prop Description'
      },
      slots: {
        label: 'Slot Label',
        description: 'Slot Description'
      }
    });

    expect(wrapper.find('.row-label').text()).toBe('Slot Label');
    expect(wrapper.find('.row-desc').text()).toBe('Slot Description');
  });

  it('applies active-row class when active prop is true', () => {
    const wrapper = shallowMount(SettingRow, {
      props: { active: true }
    });
    expect(wrapper.classes()).toContain('active-row');
    expect(wrapper.find('.switch').classes()).toContain('active');
  });

  it('applies mini class when mini prop is true', () => {
    const wrapper = shallowMount(SettingRow, {
      props: { mini: true }
    });
    expect(wrapper.classes()).toContain('mini');
  });

  it('applies disabled class and suppresses click when disabled prop is true', async () => {
    const wrapper = shallowMount(SettingRow, {
      props: { disabled: true }
    });
    expect(wrapper.classes()).toContain('disabled');

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toBeUndefined();
  });

  it('emits click event when clicked and not disabled', async () => {
    const wrapper = shallowMount(SettingRow, {
      props: { disabled: false }
    });

    await wrapper.trigger('click');
    expect(wrapper.emitted('click')).toHaveLength(1);
  });

  it('applies loading classes to the switch when loading prop is true', () => {
    const wrapper = shallowMount(SettingRow, {
      props: { loading: true }
    });
    const sw = wrapper.find('.switch');
    expect(sw.classes()).toContain('skeleton-anim');
    expect(sw.classes()).toContain('sk-badge-s');
  });
});
