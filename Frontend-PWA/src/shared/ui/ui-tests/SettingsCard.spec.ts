// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 AlbiDR

/**
 * @vitest-environment jsdom
 */

import { describe, it, expect } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { SettingsCard } from '@shared';

describe('SettingsCard.vue', () => {
  const defaultProps = {
    title: 'System Settings',
    icon: 'settings'
  };

  it('renders title and icon correctly', () => {
    const wrapper = shallowMount(SettingsCard, {
      props: defaultProps
    });

    expect(wrapper.find('h3').text()).toBe('System Settings');
    // Using shallowMount, Icon is a component stub
    expect(wrapper.findComponent({ name: 'Icon' }).props('name')).toBe('settings');
  });

  it('is initially collapsed by default', () => {
    const wrapper = shallowMount(SettingsCard, {
      props: defaultProps
    });

    expect(wrapper.classes()).toContain('collapsed');
    expect(wrapper.find('.card-body').exists()).toBe(false);
  });

  it('is initially expanded when initiallyExpanded prop is true', () => {
    const wrapper = shallowMount(SettingsCard, {
      props: { ...defaultProps, initiallyExpanded: true }
    });

    expect(wrapper.classes()).not.toContain('collapsed');
    expect(wrapper.find('.card-body').exists()).toBe(true);
  });

  it('toggles collapse state when header is clicked', async () => {
    const wrapper = shallowMount(SettingsCard, {
      props: defaultProps
    });

    const header = wrapper.find('.card-header');

    // Expand
    await header.trigger('click');
    expect(wrapper.classes()).not.toContain('collapsed');
    expect(wrapper.find('.card-body').exists()).toBe(true);

    // Collapse
    await header.trigger('click');
    expect(wrapper.classes()).toContain('collapsed');
    expect(wrapper.find('.card-body').exists()).toBe(false);
  });

  it('reflects loading state in aria-busy attribute', () => {
    const wrapper = shallowMount(SettingsCard, {
      props: { ...defaultProps, loading: true }
    });

    expect(wrapper.attributes('aria-busy')).toBe('true');

    const notLoadingWrapper = shallowMount(SettingsCard, {
      props: { ...defaultProps, loading: false }
    });
    expect(notLoadingWrapper.attributes('aria-busy')).toBe('false');
  });

  it('renders default and header-extra slots correctly', () => {
    const wrapper = shallowMount(SettingsCard, {
      props: { ...defaultProps, initiallyExpanded: true },
      slots: {
        default: '<div class="test-content">Body Content</div>',
        'header-extra': '<button class="test-extra">Extra</button>'
      }
    });

    expect(wrapper.find('.test-content').exists()).toBe(true);
    expect(wrapper.find('.test-content').text()).toBe('Body Content');
    expect(wrapper.find('.header-actions .test-extra').exists()).toBe(true);
  });

  it('applies bodyClass to the card-body element', () => {
    const wrapper = shallowMount(SettingsCard, {
      props: { ...defaultProps, initiallyExpanded: true, bodyClass: 'custom-class' }
    });

    expect(wrapper.find('.card-body').classes()).toContain('custom-class');
  });
});
